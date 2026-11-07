// Test subprocess only: report the PID of the browser this server actually launched.
import puppeteer from "puppeteer";
const launch = puppeteer.launch.bind(puppeteer);
puppeteer.launch = async (options) => {
  const browser = await launch(options);
  process.send?.({ ownedPid: browser.process().pid });
  return browser;
};
process.on("message", (message) => {
  if (message === "test-fatal")
    queueMicrotask(() => {
      throw new Error("PRIVATE_FATAL_SAMPLE_713");
    });
});
process.channel?.unref();
