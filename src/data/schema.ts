const semanticAxisSchema = {
  type: "object",
  required: ["enabled", "source", "label"],
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    source: { enum: ["field", "cluster", "degree", "inDegree", "outDegree", "graphDepth", "stableIndex"] },
    field: { type: "string" },
    label: { type: "string", minLength: 1 },
    min: { type: "number" },
    max: { type: "number" },
    invert: { type: "boolean" },
    strength: { type: "number", minimum: 0 },
    span: { type: "number", exclusiveMinimum: 0 },
    missing: { enum: ["center", "min", "max", "graphDepth", "stableIndex"] },
  },
} as const;

export const graphDatasetSchema = {
  $id: "https://localmoon.source/schema/graph-dataset-1.0.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "meta", "nodes", "links"],
  properties: {
    schemaVersion: { const: "1.0" },
    meta: {
      type: "object",
      required: ["id", "title", "version"],
      additionalProperties: true,
      properties: { id: { type: "string", minLength: 1 }, title: { type: "string", minLength: 1 }, version: { type: "string", minLength: 1 } },
    },
    clusters: { type: "array", items: { type: "object", required: ["id", "label"], additionalProperties: true, properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } },
    nodes: {
      type: "array",
      items: { type: "object", required: ["id", "label", "cluster"], additionalProperties: true, properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 }, cluster: { type: "string", minLength: 1 }, value: { type: "number", minimum: 0 }, level: { type: "number" }, visible: { type: "boolean" }, pinned: { type: "boolean" } } },
    },
    links: {
      type: "array",
      items: { type: "object", required: ["source", "target"], additionalProperties: true, properties: { id: { type: "string" }, source: { type: "string", minLength: 1 }, target: { type: "string", minLength: 1 }, weight: { type: "number", minimum: 0 }, directed: { type: "boolean" }, visible: { type: "boolean" } } },
    },
    layout: {
      type: "object",
      additionalProperties: true,
      properties: {
        axes: {
          type: "object",
          required: ["enabled", "x", "y", "z"],
          additionalProperties: false,
          properties: {
            enabled: { type: "boolean" },
            x: semanticAxisSchema,
            y: semanticAxisSchema,
            z: semanticAxisSchema,
          },
        },
        axis: { type: "object" },
      },
    },
    visual: { type: "object", additionalProperties: true },
  },
} as const;
