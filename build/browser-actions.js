var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { jsonResult, textResult, valueResult, SessionError, } from "./results.js";
import { capture } from "./screenshot.js";
export async function performPageAction(page, action, signal, tabId) {
    signal.throwIfAborted();
    switch (action.name) {
        case "screenshot":
            return capture(page, action, signal, tabId);
        case "navigate":
            await page.goto(action.url, {
                waitUntil: action.wait_until,
                timeout: 0,
                signal,
            });
            return jsonResult({ status: "Navigated" });
        case "click": {
            const end = new AbortController();
            const clickSignal = AbortSignal.any([signal, end.signal]);
            const navigation = action.wait_until
                ? page.waitForNavigation({
                    waitUntil: action.wait_until,
                    timeout: 0,
                    signal: clickSignal,
                })
                : undefined;
            try {
                await Promise.all([
                    navigation,
                    page
                        .locator(`:is(${action.selector}):not(:disabled)`)
                        .setTimeout(0)
                        .click({ signal: clickSignal }),
                ]);
            }
            finally {
                end.abort();
                await navigation?.catch(() => { });
            }
            return jsonResult({ status: "Clicked" });
        }
        case "type": {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const element = __addDisposableResource(env_1, await page.waitForSelector(action.selector, {
                    signal,
                    timeout: 0,
                }), false);
                signal.throwIfAborted();
                if (!element)
                    throw new SessionError("failed");
                await element.type(action.text);
                return jsonResult({ status: "Typed" });
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        }
        case "fill":
            await page
                .locator(`:is(${action.selector}):not(:disabled)`)
                .setTimeout(0)
                .fill(action.text, { signal });
            return jsonResult({ status: "Filled" });
        case "select_option": {
            const env_2 = { stack: [], error: void 0, hasError: false };
            try {
                const element = __addDisposableResource(env_2, await page.waitForSelector(action.selector, {
                    signal,
                    timeout: 0,
                }), false);
                if (!element ||
                    !(await element.evaluate((el, values) => el instanceof HTMLSelectElement &&
                        !el.disabled &&
                        (el.multiple || values.length === 1) &&
                        values.every((v) => Array.from(el.options).some((o) => o.value === v && !o.disabled)), action.values)))
                    throw new SessionError("failed");
                signal.throwIfAborted();
                const selected = await element.select(...action.values);
                if (new Set(action.values).size !== selected.length)
                    throw new SessionError("failed");
                return jsonResult({ count: selected.length });
            }
            catch (e_2) {
                env_2.error = e_2;
                env_2.hasError = true;
            }
            finally {
                __disposeResources(env_2);
            }
        }
        case "press_key": {
            if (action.selector) {
                const env_3 = { stack: [], error: void 0, hasError: false };
                try {
                    const element = __addDisposableResource(env_3, await page.waitForSelector(action.selector, {
                        signal,
                        timeout: 0,
                    }), false);
                    signal.throwIfAborted();
                    if (!element)
                        throw new SessionError("failed");
                    await element.press(action.key);
                }
                catch (e_3) {
                    env_3.error = e_3;
                    env_3.hasError = true;
                }
                finally {
                    __disposeResources(env_3);
                }
            }
            else
                await page.keyboard.press(action.key);
            return jsonResult({ status: "Key pressed" });
        }
        case "wait_for": {
            if (action.state === "detached") {
                const env_4 = { stack: [], error: void 0, hasError: false };
                try {
                    const handle = __addDisposableResource(env_4, await page.waitForFunction((sel) => !document.querySelector(sel), { timeout: 0, signal }, action.selector), false);
                }
                catch (e_4) {
                    env_4.error = e_4;
                    env_4.hasError = true;
                }
                finally {
                    __disposeResources(env_4);
                }
            }
            else {
                const env_5 = { stack: [], error: void 0, hasError: false };
                try {
                    const handle = __addDisposableResource(env_5, await page.waitForSelector(action.selector, {
                        timeout: 0,
                        signal,
                        visible: action.state === "visible",
                        hidden: action.state === "hidden",
                    }), false);
                }
                catch (e_5) {
                    env_5.error = e_5;
                    env_5.hasError = true;
                }
                finally {
                    __disposeResources(env_5);
                }
            }
            return jsonResult({ state: action.state });
        }
        case "get_content": {
            if (action.selector) {
                const env_6 = { stack: [], error: void 0, hasError: false };
                try {
                    const el = __addDisposableResource(env_6, await page.waitForSelector(action.selector, {
                        signal,
                        timeout: 0,
                    }), false);
                    if (!el)
                        throw new SessionError("failed");
                    signal.throwIfAborted();
                    return textResult(await el.evaluate((e) => e.outerHTML), action.max_chars);
                }
                catch (e_6) {
                    env_6.error = e_6;
                    env_6.hasError = true;
                }
                finally {
                    __disposeResources(env_6);
                }
            }
            return textResult(await page.content(), action.max_chars);
        }
        case "evaluate": {
            const env_7 = { stack: [], error: void 0, hasError: false };
            try {
                // A handle preserves the distinction between undefined and a value CDP cannot serialize.
                const handle = __addDisposableResource(env_7, await page.evaluateHandle(action.script), true);
                signal.throwIfAborted();
                const encoded = await handle.evaluate((value, limit) => {
                    if (value === undefined)
                        return { kind: "undefined" };
                    try {
                        const json = JSON.stringify(value, (_key, v) => {
                            if (["undefined", "function", "symbol", "bigint"].includes(typeof v) ||
                                (typeof v === "number" && !Number.isFinite(v)))
                                throw Error();
                            return v;
                        });
                        if (json.length <= limit)
                            return { kind: "json", json };
                        let preview = json.slice(0, limit);
                        if (/[\uD800-\uDBFF]$/.test(preview))
                            preview = preview.slice(0, -1);
                        return {
                            kind: "preview",
                            preview,
                            total_chars: json.length,
                        };
                    }
                    catch {
                        return { kind: "unsupported" };
                    }
                }, action.max_chars);
                if (encoded.kind === "undefined")
                    return valueResult(undefined);
                if (encoded.kind === "unsupported")
                    throw new SessionError("serialization");
                if (encoded.kind === "preview")
                    return jsonResult({
                        truncated: true,
                        preview: encoded.preview,
                        total_chars: encoded.total_chars,
                    });
                return valueResult(JSON.parse(encoded.json), action.max_chars);
            }
            catch (e_7) {
                env_7.error = e_7;
                env_7.hasError = true;
            }
            finally {
                const result_1 = __disposeResources(env_7);
                if (result_1)
                    await result_1;
            }
        }
    }
}
