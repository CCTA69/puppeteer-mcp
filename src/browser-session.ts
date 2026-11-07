import { execFile } from "node:child_process";
import { once } from "node:events";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { SessionError } from "./results.js";

export interface TabInfo {
  id: string;
  title: string;
  url: string;
  active: boolean;
}
interface Operation {
  signal: AbortSignal;
  page?: Page;
}
interface Job {
  timer: NodeJS.Timeout;
  start(): Promise<void>;
  reject(error: Error): void;
}
const DEFAULT_MS = 30000;

async function bounded<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new SessionError("timeout")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// A disconnected DevTools connection is not proof that our Chrome exited.
async function dispose(browser: Browser): Promise<void> {
  const child = browser.process();
  const exited = () =>
    !child || child.exitCode !== null || child.signalCode !== null;
  if (child && exited()) return;
  const exit = exited()
    ? Promise.resolve()
    : once(child!, "exit").then(() => {});
  try {
    await bounded(
      Promise.all([browser.connected ? browser.close() : undefined, exit]),
      2000,
    );
    return;
  } catch {
    /* force owned process below */
  }
  if (exited()) return;
  if (!child?.pid) throw new SessionError("unusable");
  if (process.platform === "win32") {
    execFile(
      "taskkill.exe",
      ["/PID", String(child.pid), "/T", "/F"],
      { windowsHide: true, timeout: 3000 },
      () => {},
    );
  } else {
    child.kill("SIGKILL");
  }
  try {
    await bounded(exit, 3000);
  } catch {
    throw new SessionError("unusable");
  }
}

export class BrowserSession {
  private browser?: Browser;
  private readonly owned = new Set<Browser>();
  private readonly disposing = new WeakMap<Browser, Promise<void>>();
  private readonly tabs = new Map<string, Page>();
  private active?: string;
  private focusFallback = false;
  private sequence = 0;
  private generation = 0;
  private readonly queue: Job[] = [];
  private draining = false;
  private current?: AbortController;
  private stopped = false;
  private broken = false;
  private closing?: Promise<void>;
  private launching?: Promise<Browser>;

  constructor(
    private options: { headless: boolean; launch?: () => Promise<Browser> },
  ) {}

  private discardWaiting(): void {
    for (const job of this.queue.splice(0)) {
      clearTimeout(job.timer);
      job.reject(new SessionError("stopped"));
    }
  }
  private enqueue<T>(
    ms: number,
    run: (ctx: Operation) => Promise<T>,
    clientSignal?: AbortSignal,
  ): Promise<T> {
    if (clientSignal?.aborted)
      return Promise.reject(new SessionError("cancelled"));
    if (this.broken || this.stopped)
      return Promise.reject(
        new SessionError(this.broken ? "unusable" : "stopped"),
      );
    let detach = () => {};
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      const queueDeadline = performance.now() + ms;
      const job: Job = {
        reject,
        timer: setTimeout(() => {
          const i = this.queue.indexOf(job);
          if (i >= 0) {
            this.queue.splice(i, 1);
            reject(new SessionError("queued"));
          }
        }, ms),
        start: async () => {
          clearTimeout(job.timer);
          if (performance.now() >= queueDeadline) {
            reject(new SessionError("queued"));
            return;
          }
          this.current = controller;
          const ctx: Operation = { signal: controller.signal };
          const timer = setTimeout(
            () => controller.abort(new SessionError("timeout")),
            ms,
          );
          let onAbort: () => void = () => {};
          const interrupted = new Promise<never>((_, fail) => {
            onAbort = () => fail(controller.signal.reason);
            controller.signal.addEventListener("abort", onAbort, {
              once: true,
            });
          });
          try {
            resolve(await Promise.race([run(ctx), interrupted]));
          } catch (err) {
            if (
              controller.signal.aborted &&
              controller.signal.reason instanceof SessionError &&
              ["timeout", "cancelled"].includes(controller.signal.reason.code)
            ) {
              this.discardWaiting();
              try {
                if (!ctx.page || ctx.page.isClosed()) {
                  if (!ctx.page) await this.reset();
                } else {
                  try {
                    await bounded(
                      ctx.page.close({ runBeforeUnload: false }),
                      2000,
                    );
                  } catch {
                    await this.reset();
                  }
                }
                reject(controller.signal.reason);
              } catch {
                this.broken = true;
                reject(new SessionError("unusable"));
              }
            } else {
              reject(err);
            }
          } finally {
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", onAbort);
            this.current = undefined;
          }
        },
      };
      const cancel = () => {
        const reason = new SessionError("cancelled");
        const i = this.queue.indexOf(job);
        if (i >= 0) {
          this.queue.splice(i, 1);
          clearTimeout(job.timer);
          reject(reason);
        } else controller.abort(reason);
      };
      clientSignal?.addEventListener("abort", cancel, { once: true });
      detach = () => clientSignal?.removeEventListener("abort", cancel);
      this.queue.push(job);
      void this.drain();
    }).finally(() => detach());
  }
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length) {
        if (this.stopped || this.broken) {
          this.discardWaiting();
          break;
        }
        await this.queue.shift()!.start();
      }
    } finally {
      this.draining = false;
    }
  }
  private clearTabs(): void {
    this.focusFallback = false;
    this.browser = undefined;
    this.generation++;
    this.tabs.clear();
    this.active = undefined;
  }
  private release(browser: Browser): Promise<void> {
    const existing = this.disposing.get(browser);
    if (existing) return existing;
    const work = dispose(browser).then(() => {
      this.owned.delete(browser);
    });
    this.disposing.set(browser, work);
    return work;
  }
  private async reset(): Promise<void> {
    this.clearTabs();
    try {
      if (this.launching) {
        const b = await bounded(this.launching, 5000).catch((err) => {
          if (err instanceof SessionError) throw err;
          return undefined;
        });
        if (b) this.owned.add(b);
      }
      await Promise.all(Array.from(this.owned, (b) => this.release(b)));
    } catch {
      this.broken = true;
      throw new SessionError("unusable");
    }
  }
  private async ensureBrowser(ctx: Operation): Promise<Browser> {
    ctx.signal.throwIfAborted();
    if (this.browser?.connected) return this.browser;
    for (const b of this.owned) await this.release(b);
    ctx.signal.throwIfAborted();
    const generation = ++this.generation;
    const launch =
      this.options.launch?.() ??
      puppeteer.launch({
        logger: () => undefined,
        headless: this.options.headless,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
      });
    this.launching = launch;
    try {
      const browser = await launch;
      this.owned.add(browser);
      if (
        ctx.signal.aborted ||
        this.stopped ||
        generation !== this.generation
      ) {
        await this.release(browser);
        throw new SessionError("stopped");
      }
      this.browser = browser;
      browser.on("disconnected", () => {
        if (this.browser !== browser || this.generation !== generation) return;
        this.clearTabs();
        this.discardWaiting();
        this.current?.abort(new SessionError("stopped"));
      });
      await this.syncTabs(browser, ctx);
      return browser;
    } finally {
      if (this.launching === launch) this.launching = undefined;
    }
  }
  private register(page: Page): string {
    for (const [id, p] of this.tabs) if (p === page) return id;
    const id = `tab-${++this.sequence}`;
    this.tabs.set(id, page);
    this.active ??= id;
    page.once("close", () => {
      this.tabs.delete(id);
      if (this.active === id) {
        this.active = this.tabs.keys().next().value;
        this.focusFallback = true;
      }
    });
    return id;
  }
  private async syncTabs(browser: Browser, ctx: Operation): Promise<void> {
    const pages = await browser.pages();
    ctx.signal.throwIfAborted();
    if (browser !== this.browser) throw new SessionError("stopped");
    for (const page of pages) if (!page.isClosed()) this.register(page);
    for (const [id, p] of this.tabs) if (p.isClosed()) this.tabs.delete(id);
    if (!this.active || !this.tabs.has(this.active)) {
      this.active = this.tabs.keys().next().value;
      this.focusFallback = true;
    }
    if (this.active && this.focusFallback) {
      const next = this.tabs.get(this.active);
      await next?.bringToFront();
      ctx.signal.throwIfAborted();
      this.focusFallback = false;
    }
  }
  private async pageFor(id: string | undefined, ctx: Operation): Promise<Page> {
    if (id !== undefined && !this.browser?.connected)
      throw new SessionError("stale");
    const browser = await this.ensureBrowser(ctx);
    await this.syncTabs(browser, ctx);
    let page = this.tabs.get(id ?? this.active ?? "");
    if (!page && id !== undefined) throw new SessionError("stale");
    if (!page) {
      page = await browser.newPage();
      ctx.signal.throwIfAborted();
      this.active = this.register(page);
    }
    ctx.page = page;
    return page;
  }
  withPage<T>(
    options: { tabId?: string; timeoutMs: number; signal?: AbortSignal },
    operation: (page: Page, signal: AbortSignal, tabId: string) => Promise<T>,
  ): Promise<T> {
    return this.enqueue(
      options.timeoutMs,
      async (ctx) => {
        const page = await this.pageFor(options.tabId, ctx);
        ctx.signal.throwIfAborted();
        const active = this.active && this.tabs.get(this.active);
        await page.bringToFront();
        ctx.signal.throwIfAborted();
        try {
          return await operation(page, ctx.signal, this.register(page));
        } finally {
          if (
            !ctx.signal.aborted &&
            active &&
            active !== page &&
            !active.isClosed()
          )
            await active.bringToFront();
        }
      },
      options.signal,
    );
  }
  private async info(id: string, page: Page): Promise<TabInfo> {
    return {
      id,
      title: await page.title().catch(() => ""),
      url: page.url(),
      active: this.active === id,
    };
  }
  listTabs(signal?: AbortSignal): Promise<TabInfo[]> {
    return this.enqueue(
      DEFAULT_MS,
      async (ctx) => {
        if (!this.browser?.connected) return [];
        await this.syncTabs(this.browser, ctx);
        return Promise.all(
          Array.from(this.tabs, ([id, page]) => this.info(id, page)),
        );
      },
      signal,
    );
  }
  newTab(
    url?: string,
    timeoutMs = DEFAULT_MS,
    signal?: AbortSignal,
  ): Promise<TabInfo> {
    return this.enqueue(
      timeoutMs,
      async (ctx) => {
        const alreadyOpen = !!this.browser?.connected;
        const browser = await this.ensureBrowser(ctx);
        const previous = this.active;
        const initial =
          !alreadyOpen && this.tabs.size === 1
            ? this.tabs.values().next().value
            : undefined;
        const page =
          initial?.url() === "about:blank" ? initial : await browser.newPage();
        ctx.signal.throwIfAborted();
        ctx.page = page;
        const id = this.register(page);
        try {
          if (url)
            await page.goto(url, {
              waitUntil: "domcontentloaded",
              timeout: 0,
              signal: ctx.signal,
            });
          ctx.signal.throwIfAborted();
          await page.bringToFront();
          ctx.signal.throwIfAborted();
          this.active = id;
          return await this.info(id, page);
        } catch (err) {
          if (!ctx.signal.aborted) {
            await page.close();
            if (previous && this.tabs.has(previous)) this.active = previous;
          }
          throw err;
        }
      },
      signal,
    );
  }
  switchTab(id: string, signal?: AbortSignal): Promise<TabInfo> {
    return this.enqueue(
      DEFAULT_MS,
      async (ctx) => {
        const p = await this.pageFor(id, ctx);
        await p.bringToFront();
        ctx.signal.throwIfAborted();
        this.active = id;
        return this.info(id, p);
      },
      signal,
    );
  }
  closeTab(id: string, signal?: AbortSignal): Promise<void> {
    return this.enqueue(
      DEFAULT_MS,
      async (ctx) => {
        const p = await this.pageFor(id, ctx);
        await p.close();
        if (this.browser?.connected) await this.syncTabs(this.browser, ctx);
      },
      signal,
    );
  }
  closeBrowser(signal?: AbortSignal): Promise<void> {
    return this.enqueue(DEFAULT_MS, () => this.reset(), signal);
  }
  shutdown(): Promise<void> {
    if (this.closing) return this.closing;
    this.stopped = true;
    this.discardWaiting();
    this.current?.abort(new SessionError("stopped"));
    this.closing = this.reset();
    return this.closing;
  }
}
