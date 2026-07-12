import { describe, expect, it } from "vitest";
import { parseDatasetRegistry, registeredDatasetUrl, registryUrl, resolveRegistryEntry } from "../../src/data/registry";

const registry = parseDatasetRegistry({
  registryVersion: "1.0",
  defaultDataset: "demo",
  datasets: [
    { id: "demo", title: "Demo", path: "demo/dataset.json" },
    { id: "project-x", title: "Project X", path: "project-x/dataset.json", tags: ["project"] },
  ],
});

describe("dataset registry", () => {
  it("resolves requested entries and falls back to the declared default", () => {
    expect(resolveRegistryEntry(registry, "project-x").id).toBe("project-x");
    expect(resolveRegistryEntry(registry, "missing").id).toBe("demo");
    expect(resolveRegistryEntry(registry).id).toBe("demo");
  });

  it("builds GitHub Pages-aware URLs", () => {
    expect(registryUrl("/3D-Cluster-Engine/")).toBe("/3D-Cluster-Engine/datasets/registry.json");
    expect(registeredDatasetUrl("/3D-Cluster-Engine", "project-x/dataset.json")).toBe("/3D-Cluster-Engine/datasets/project-x/dataset.json");
  });

  it("rejects duplicate dataset ids", () => {
    expect(() => parseDatasetRegistry({
      registryVersion: "1.0",
      datasets: [
        { id: "same", title: "One", path: "one/dataset.json" },
        { id: "same", title: "Two", path: "two/dataset.json" },
      ],
    })).toThrow(/duplicados/);
  });

  it("rejects unsafe paths and missing defaults", () => {
    expect(() => parseDatasetRegistry({
      registryVersion: "1.0",
      datasets: [{ id: "unsafe", title: "Unsafe", path: "../secret.json" }],
    })).toThrow(/Registry inválido/);

    expect(() => parseDatasetRegistry({
      registryVersion: "1.0",
      defaultDataset: "missing",
      datasets: [{ id: "demo", title: "Demo", path: "demo/dataset.json" }],
    })).toThrow(/padrão inexistente/);
  });
});
