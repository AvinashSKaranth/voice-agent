import { createLogger } from "@voice-agent/shared";

/**
 * Real browser automation over Playwright (FR-MCP-05).
 * A single managed Chromium instance; tools map 1:1 to
 * open/navigate/click/type/select/extract/screenshot (FR 13.6).
 * Loaded lazily so unit tests never need a browser installed.
 */
export class PlaywrightExecutor {
  private log = createLogger("browser");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private browser: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private page: any = null;

  private async ensure(): Promise<void> {
    if (this.page) return;
    const spec = "playwright";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pw: any = await Function("s", "return import(s)")(spec).catch(() => null);
    if (!pw?.chromium) {
      throw new Error("Playwright not installed. Run: pnpm --filter @voice-agent/agent add playwright && npx playwright install chromium");
    }
    this.browser = await pw.chromium.launch({ headless: true });
    const ctx = await this.browser.newContext();
    this.page = await ctx.newPage();
    this.log.info("browser-launched", {});
  }

  async exec(tool: string, input: unknown, signal: AbortSignal): Promise<unknown> {
    await this.ensure();
    if (signal.aborted) throw new Error("cancelled");
    const p = this.page;
    const o = (input ?? {}) as Record<string, string>;
    switch (tool) {
      case "open":
      case "navigate": {
        if (!o.url) throw new Error("browser.navigate requires { url }");
        await p.goto(o.url, { timeout: 30_000 });
        return { url: p.url(), title: await p.title().catch(() => "") };
      }
      case "click": {
        if (!o.selector) throw new Error("browser.click requires { selector }");
        await p.click(o.selector, { timeout: 15_000 });
        return { clicked: o.selector };
      }
      case "type": {
        if (!o.selector || o.text === undefined) throw new Error("browser.type requires { selector, text }");
        await p.fill(o.selector, o.text, { timeout: 15_000 });
        return { typed: o.selector };
      }
      case "select": {
        if (!o.selector) throw new Error("browser.select requires { selector }");
        await p.selectOption(o.selector, o.value ?? o.text ?? "", { timeout: 15_000 }).catch(() => undefined);
        return { selected: o.selector };
      }
      case "extract": {
        const text = await p.evaluate("document.body ? document.body.innerText : ''").catch(() => "");
        return { url: p.url(), text: String(text).slice(0, 8000) };
      }
      case "screenshot": {
        const path = o.path ?? `browser-${Date.now()}.png`;
        await p.screenshot({ path, timeout: 15_000 });
        return { path };
      }
      default:
        throw new Error(`Unknown browser tool: ${tool}`);
    }
  }

  async close(): Promise<void> {
    try { await this.browser?.close(); } catch { /* noop */ }
    this.browser = null;
    this.page = null;
  }
}
