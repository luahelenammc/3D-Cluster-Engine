import { chromium } from "../.qa-browser/node_modules/playwright/index.mjs";
import { mkdir } from "node:fs/promises";
await mkdir("qa-artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const results = [];
try {
  for (const spec of [{ name: "desktop", viewport: { width: 1440, height: 900 } }, { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true }]) {
    const context = await browser.newContext({ viewport: spec.viewport, isMobile: Boolean(spec.isMobile), deviceScaleFactor: 1, acceptDownloads: true });
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push("pageerror: " + error.message));
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.getByRole("button", { name: "Second Mind" }).waitFor({ timeout: 45000 });
    await page.screenshot({ path: "qa-artifacts/" + spec.name + "-3d.png", fullPage: false });
    await page.getByRole("button", { name: "Agrupar por clusters" }).click();
    await page.getByRole("button", { name: "Voltar aos nós" }).waitFor();
    await page.screenshot({ path: "qa-artifacts/" + spec.name + "-lod.png" });
    await page.getByRole("button", { name: "Voltar aos nós" }).click();
    await page.getByRole("button", { name: "Second Mind" }).click();
    await page.getByRole("tab", { name: "Knowledge Engine" }).click();
    await page.getByRole("heading", { name: /Knowledge Engine/ }).waitFor();
    await page.screenshot({ path: "qa-artifacts/" + spec.name + "-knowledge.png", fullPage: false });
    await page.getByRole("button", { name: "Encontrar caminho" }).click();
    await page.getByText(/Sem caminho demonstrável|Caminho encontrado/).waitFor();
    await page.getByRole("button", { name: /Baixar vault Obsidian/ }).click();
    await page.getByRole("tab", { name: "Fontes" }).click();
    await page.getByRole("button", { name: "Fechar Second Mind" }).click();
    results.push({ viewport: spec.name, errors: failures, evaluated: ["load", "lod", "knowledge-tab", "path", "obsidian-export", "back-to-sources"] });
    if (failures.length) throw new Error(spec.name + ": " + failures.join("; "));
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ visualSmoke: "passed", results }, null, 2));
