import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceDir = path.resolve("datasets-src/acl");
const outputPath = path.resolve("public/datasets/acl/dataset.json");

const parse = async (fileName) => JSON.parse(
  await readFile(path.join(sourceDir, fileName), "utf8"),
);

const core = await parse("core.json");
const files = await readdir(sourceDir);
const nodeFiles = files.filter((name) => /^nodes-\d+\.json$/.test(name)).sort();
const linkFiles = files.filter((name) => /^links-\d+\.json$/.test(name)).sort();

const nodes = (await Promise.all(nodeFiles.map(parse))).flat();
const links = (await Promise.all(linkFiles.map(parse))).flat();

if (nodes.length !== 70 || links.length !== 98) {
  throw new Error(`ACL dataset cardinality mismatch: ${nodes.length} nodes, ${links.length} links`);
}

const dataset = {
  schemaVersion: core.schemaVersion,
  meta: core.meta,
  clusters: core.clusters,
  nodes,
  links,
  layout: core.layout,
  visual: core.visual,
  extensions: core.extensions,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(dataset), "utf8");
console.log(`Materialized ${outputPath}: ${nodes.length} nodes, ${links.length} links.`);
