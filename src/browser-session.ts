import puppeteer, { type Browser, type Page } from 'puppeteer';
import { SessionError } from './results.js';
export interface TabInfo { id: string; title: string; url: string; active: boolean }
export class BrowserSession {
  private browser?: Browser;
  private page?: Page;
  constructor(private options: { headless: boolean; launch?: () => Promise<Browser> }) {}
  async withPage<T>(options: { tabId?: string; timeoutMs: number }, operation: (page: Page, signal: AbortSignal) => Promise<T>): Promise<T> {
    if (options.tabId) throw new SessionError('stale');
    this.browser ??= await (this.options.launch?.() ?? puppeteer.launch({ headless: this.options.headless }));
    this.page ??= (await this.browser.pages())[0] ?? await this.browser.newPage();
    return operation(this.page, new AbortController().signal);
  }
  async listTabs(): Promise<TabInfo[]> {
    return this.page ? [{id:'tab-1', title:await this.page.title(), url:this.page.url(), active:true}] : [];
  }
  async closeBrowser(): Promise<void> { await this.browser?.close(); this.browser = undefined; this.page = undefined; }
  async shutdown(): Promise<void> { await this.closeBrowser(); }
}
