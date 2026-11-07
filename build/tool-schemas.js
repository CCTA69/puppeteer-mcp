import { z } from "zod";
import { _keyDefinitions } from "puppeteer-core/internal/common/USKeyboardLayout.js";
const selector = z.string().min(1).max(4096);
const text = z.string().max(100000);
export const urlSchema = z
    .string()
    .min(1)
    .max(8192)
    .refine((value) => {
    if (value === "about:blank")
        return true;
    try {
        return ["http:", "https:"].includes(new URL(value).protocol);
    }
    catch {
        return false;
    }
}, "Use an HTTP or HTTPS URL, or about:blank.");
const page = {
    tab_id: z.string().min(1).max(64).optional(),
    timeout_ms: z.number().int().min(1000).max(120000).default(30000),
};
const max_chars = z.number().int().min(1).max(100000).default(25000);
const until = z.enum([
    "load",
    "domcontentloaded",
    "networkidle0",
    "networkidle2",
]);
export const schemas = {
    navigate: z.strictObject({
        ...page,
        url: urlSchema,
        wait_until: until.default("domcontentloaded"),
    }),
    click: z.strictObject({ ...page, selector, wait_until: until.optional() }),
    fill: z.strictObject({ ...page, selector, text }),
    select_option: z.strictObject({
        ...page,
        selector,
        values: z.array(z.string().max(4096)).min(1).max(100),
    }),
    press_key: z.strictObject({
        ...page,
        selector: selector.optional(),
        key: z.enum(Object.keys(_keyDefinitions)),
    }),
    wait_for: z.strictObject({
        ...page,
        selector,
        state: z
            .enum(["visible", "hidden", "attached", "detached"])
            .default("visible"),
    }),
    screenshot: z
        .strictObject({
        ...page,
        selector: selector.optional(),
        full_page: z.boolean().optional(),
    })
        .refine((a) => !(a.selector && a.full_page), "Choose a selector or full_page, not both."),
    type: z.strictObject({ ...page, selector, text }),
    get_content: z.strictObject({
        ...page,
        selector: selector.optional(),
        max_chars,
    }),
    evaluate: z.strictObject({ ...page, script: text, max_chars }),
    close_browser: z.strictObject({}),
    list_tabs: z.strictObject({}),
    new_tab: z.strictObject({
        url: urlSchema.optional(),
        timeout_ms: page.timeout_ms,
    }),
    switch_tab: z.strictObject({ tab_id: z.string().min(1).max(64) }),
    close_tab: z.strictObject({ tab_id: z.string().min(1).max(64) }),
};
