import { chromium } from "../.qa-browser/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";
await mkdir("qa-artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const report = [];
try {
  for (const spec of [{ name: "desktop", viewport: { width: 1440, height: 900 } }, { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true }]) {
    const context = await browser.newContext({ viewport: spec.viewport, isMobile: Boolean(spec.isMobile), acceptDownloads: true, deviceScaleFactor: 1 });
    const page = await context.newPage(), errors = [], downloads = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("download", (item) => downloads.push(item.suggestedFilename()));
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.getByRole("button", { name: "Second Mind" }).click();
    await page.getByRole("tab", { name: "Fontes" }).click();
    const text = "# Memo sintético\nAurora financia Boreal.\nOs resultados são apenas fictícios.\n";
    await page.locator('.second-mind-body input[accept=".md,text/markdown"]').first().setInputFiles({
      name: "qa-synthetic.md", mimeType: "text/markdown", buffer: Buffer.from(text),
    });
    await page.locator(".sm-source-list summary").filter({ hasText: "qa-synthetic.md" }).first().waitFor({ timeout: 18000 });
    await page.getByRole("tab", { name: "Knowledge Engine" }).click();
    await page.getByRole("heading", { name: /Knowledge Compiler/ }).waitFor();
    await page.screenshot({ path: "qa-artifacts/second-mind-04-" + spec.name + "-entry.png" });
    await page.getByRole("button", { name: "Revisar", exact: true }).click();
    await page.getByRole("button", { name: "Selecionar todos os deltas" }).click();
    await page.getByRole("button", { name: /Aprovar \d+ página/ }).click();
    await page.getByRole("button", { name: "Explorar", exact: true }).click();
    await page.getByRole("heading", { name: "Wiki derivada" }).waitFor();
    await page.screenshot({ path: "qa-artifacts/second-mind-04-" + spec.name + "-wiki.png" });
    await page.getByRole("button", { name: "Exportar Obsidian + Canvas" }).click();
    await page.getByRole("button", { name: "Snapshot MCP somente leitura" }).click();
    await page.getByRole("button", { name: "Perguntar", exact: true }).click();
    await page.getByPlaceholder("O que mudou sobre…?").fill("Aurora");
    await page.getByRole("button", { name: "Buscar na wiki" }).click();
    await page.getByRole("button", { name: "Exportar handoff/resume" }).click();
    await page.screenshot({ path: "qa-artifacts/second-mind-04-" + spec.name + "-ask.png" });
    if (downloads.length < 3) throw new Error("Exportações incompletas: " + downloads.join(", "));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Second Mind" }).click();
    await page.getByRole("tab", { name: "Knowledge Engine" }).click();
    await page.getByRole("button", { name: "Explorar", exact: true }).click();
    await page.getByRole("heading", { name: "Wiki derivada" }).waitFor({ timeout: 15000 });
    if (errors.length) throw new Error(spec.name + ": " + errors.join("; "));
    report.push({ device: spec.name, status: "passed", downloads, checks: ["import", "review", "approve", "persistent wiki", "Obsidian", "MCP", "resume", "search", "reload"] });
    await context.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ secondMind04Smoke: "passed", report }, null, 2));
