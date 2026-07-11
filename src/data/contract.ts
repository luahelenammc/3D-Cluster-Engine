export const DATASET_SCHEMA_VERSION = "1.1" as const;
export const LEGACY_DATASET_SCHEMA_VERSIONS = ["1.0"] as const;

export const PERFORMANCE_ENVELOPE = {
  mobileRecommended: { nodes: 750, links: 2500 },
  desktopRecommended: { nodes: 2000, links: 8000 },
  stressBoundary: { nodes: 5000, links: 20000 },
  averageDegreeWarning: 20,
  serializedSizeWarningBytes: 10 * 1024 * 1024,
} as const;
