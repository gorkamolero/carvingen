import { CaptureUnavailableError } from "./errors";
import type { Page } from "@playwright/test";
// Resolve the installed browser tool at runtime so Next does not bundle its binaries.
const runtimeRequire = process.getBuiltinModule("module").createRequire(`${process.cwd()}/package.json`);
export async function launchCaptureBrowser() {
  try {
    const { chromium } = runtimeRequire("@playwright/test") as typeof import("@playwright/test");
    return await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  } catch (error) {
    if (/Cannot find module|Executable doesn.t exist|ENOENT/.test(String(error))) throw new CaptureUnavailableError("PLAYWRIGHT_UNAVAILABLE", "Playwright Chromium is unavailable. Run pnpm exec playwright install chromium.");
    throw error;
  }
}
export async function waitForCapture(page: Page) {
  await page.waitForFunction(() => window.__captureReady || window.__captureError, undefined, { timeout: 120_000 });
  const error = await page.evaluate(() => window.__captureError);
  if (error) throw new Error(error);
  await page.waitForTimeout(300);
}
export async function captureCanvas(baseUrl: string, projectId: string) {
  const browser = await launchCaptureBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1200 }, deviceScaleFactor: 2 });
    await page.route("**/*", (route) => route.request().method() === "GET" ? route.continue() : route.abort());
    await page.goto(`${baseUrl}/capture/canvas/${encodeURIComponent(projectId)}`);
    await waitForCapture(page);
    return await page.screenshot({ type: "png", animations: "disabled" });
  } finally { await browser.close(); }
}
