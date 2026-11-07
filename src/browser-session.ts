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
  ): Promise<T> {
    if (this.broken || this.stopped)
      return Promise.reject(
        new SessionError(this.broken ? "unusable" : "stopped"),
      );
    return new Promise((resolve, reject) => {
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
          const controller = new AbortController();
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
              controller.signal.reason.code === "timeout"
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
                reject(new SessionError("timeout"));
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
      this.queue.push(job);
      void this.drain();
    });
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
      if (this.active === id) this.active = this.tabs.keys().next().value;
    });
    return id;
  }
  private async syncTabs(browser: Browser, ctx: Operation): Promise<void> {
    const pages = await browser.pages();
    ctx.signal.throwIfAborted();
    if (browser !== this.browser) throw new SessionError("stopped");
    for (const page of pages) if (!page.isClosed()) this.register(page);
    for (const [id, p] of this.tabs) if (p.isClosed()) this.tabs.delete(id);
    if (!this.active || !this.tabs.has(this.active))
      this.active = this.tabs.keys().next().value;
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
    options: { tabId?: string; timeoutMs: number },
    operation: (page: Page, signal: AbortSignal, tabId: string) => Promise<T>,
  ): Promise<T> {
    return this.enqueue(options.timeoutMs, async (ctx) => {
      const page = await this.pageFor(options.tabId, ctx);
      ctx.signal.throwIfAborted();
      return operation(page, ctx.signal, this.register(page));
    });
  }
  private async info(id: string, page: Page): Promise<TabInfo> {
    return {
      id,
      title: await page.title().catch(() => ""),
      url: page.url(),
      active: this.active === id,
    };
  }
  listTabs(): Promise<TabInfo[]> {
    return this.enqueue(DEFAULT_MS, async (ctx) => {
      if (!this.browser?.connected) return [];
      await this.syncTabs(this.browser, ctx);
      return Promise.all(
        Array.from(this.tabs, ([id, page]) => this.info(id, page)),
      );
    });
  }
  newTab(url?: string, timeoutMs = DEFAULT_MS): Promise<TabInfo> {
    return this.enqueue(timeoutMs, async (ctx) => {
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
    });
  }
  switchTab(id: string): Promise<TabInfo> {
    return this.enqueue(DEFAULT_MS, async (ctx) => {
      const p = await this.pageFor(id, ctx);
      await p.bringToFront();
      ctx.signal.throwIfAborted();
      this.active = id;
      return this.info(id, p);
    });
  }
  closeTab(id: string): Promise<void> {
    return this.enqueue(DEFAULT_MS, async (ctx) => {
      const p = await this.pageFor(id, ctx);
      await p.close();
    });
  }
  closeBrowser(): Promise<void> {
    return this.enqueue(DEFAULT_MS, () => this.reset());
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
