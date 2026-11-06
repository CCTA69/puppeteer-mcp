import puppeteer from 'puppeteer';
import { SessionError } from './results.js';
export class BrowserSession {
    options;
    browser;
    page;
    constructor(options) {
        this.options = options;
    }
    async withPage(options, operation) {
        if (options.tabId)
            throw new SessionError('stale');
        this.browser ??= await (this.options.launch?.() ?? puppeteer.launch({ headless: this.options.headless }));
        this.page ??= (await this.browser.pages())[0] ?? await this.browser.newPage();
        return operation(this.page, new AbortController().signal);
    }
    async listTabs() {
        return this.page ? [{ id: 'tab-1', title: await this.page.title(), url: this.page.url(), active: true }] : [];
    }
    async closeBrowser() { await this.browser?.close(); this.browser = undefined; this.page = undefined; }
    async shutdown() { await this.closeBrowser(); }
}
