import { jsonResult, textResult, valueResult } from './results.js';
export async function performPageAction(page, action, signal) {
    signal.throwIfAborted();
    switch (action.name) {
        case 'navigate':
            await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: action.timeout_ms });
            return jsonResult({ status: 'Navigated' });
        case 'click':
            await page.waitForSelector(action.selector, { signal, timeout: action.timeout_ms });
            await page.click(action.selector);
            return jsonResult({ status: 'Clicked' });
        case 'type':
            await page.waitForSelector(action.selector, { signal, timeout: action.timeout_ms });
            await page.type(action.selector, action.text);
            return jsonResult({ status: 'Typed' });
        case 'get_content': {
            if (action.selector)
                await page.waitForSelector(action.selector, { signal, timeout: action.timeout_ms });
            return textResult(action.selector ? await page.$eval(action.selector, el => el.outerHTML) : await page.content(), action.max_chars);
        }
        case 'evaluate': return valueResult(await page.evaluate(action.script), action.max_chars);
    }
}
