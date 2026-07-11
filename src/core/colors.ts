const palette = ["#8f7cff", "#3ed6b2", "#ffb45e", "#ff6f91", "#55b8ff", "#d5e45a", "#b68cff", "#56d47b"];

export function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function clusterColor(id: string, explicit?: string): string {
  return explicit || palette[stableHash(id) % palette.length];
}

export function seededPoint(seed: string, nodeId: string, clusterId: string) {
  const h = stableHash(`${seed}:${nodeId}:${clusterId}`);
  const a = ((h & 0xffff) / 0xffff) * Math.PI * 2;
  const b = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * Math.PI;
  const radius = 70 + (h % 35);
  return { x: Math.cos(a) * Math.cos(b) * radius, y: Math.sin(b) * radius, z: Math.sin(a) * Math.cos(b) * radius };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] || char);
}
