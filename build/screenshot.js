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
import { SessionError } from './results.js';
export function checkImageBounds(width, height, scale, bytes = 0) {
    const pixels = Math.ceil(width * scale) * Math.ceil(height * scale);
    if (!(width > 0 && height > 0 && scale > 0) || !Number.isSafeInteger(pixels) || pixels > 16_000_000 || bytes > 5 * 1024 * 1024) {
        throw new SessionError('limit');
    }
}
// Read the frame header of Chrome's JPEG; layout can change after the preflight.
function jpegDimensions(bytes) {
    if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8)
        throw new SessionError('failed');
    for (let i = 2; i + 4 <= bytes.length;) {
        if (bytes[i++] !== 0xff)
            break;
        while (bytes[i] === 0xff)
            i++;
        const marker = bytes[i++];
        if (marker === 0xda || marker === 0xd9 || i + 2 > bytes.length)
            break;
        const length = bytes.readUInt16BE(i);
        if (length < 2 || i + length > bytes.length)
            break;
        if ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && length >= 8)
            return [bytes.readUInt16BE(i + 5), bytes.readUInt16BE(i + 3)];
        i += length;
    }
    throw new SessionError('failed');
}
export async function capture(page, options, signal, tabId) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const element = __addDisposableResource(env_1, options.selector ? await page.waitForSelector(options.selector, { visible: true, timeout: 0, signal }) : null, true);
        const bounds = await page.evaluate((full) => ({ width: full ? Math.max(innerWidth, document.documentElement.scrollWidth) : innerWidth,
            height: full ? Math.max(innerHeight, document.documentElement.scrollHeight) : innerHeight, scale: devicePixelRatio }), !!options.full_page);
        const rect = element ? await element.boundingBox() : bounds;
        if (!rect)
            throw new SessionError('failed');
        checkImageBounds(rect.width, rect.height, bounds.scale);
        signal.throwIfAborted();
        const imageOptions = { type: 'jpeg', quality: 80 };
        const image = element ? await element.screenshot(imageOptions) : await page.screenshot({ ...imageOptions, fullPage: !!options.full_page });
        const bytes = Buffer.from(image.buffer, image.byteOffset, image.byteLength);
        const [width, height] = jpegDimensions(bytes);
        checkImageBounds(width, height, 1, bytes.length);
        return { content: [{ type: 'image', mimeType: 'image/jpeg', data: bytes.toString('base64') }],
            structuredContent: { tab_id: tabId, width, height, bytes: bytes.length } };
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        const result_1 = __disposeResources(env_1);
        if (result_1)
            await result_1;
    }
}
