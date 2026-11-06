/** Minimal deterministic ZIP (stored entries only), for private in-browser export with no dependency/CDN. */
export function createLocalZip(files: Record<string, string>): Blob {
  const encoder = new TextEncoder();
  const entries = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length > 5000) throw new Error("Arquivo excede o limite de 5.000 entradas.");
  const totalBytes = entries.reduce((sum, [name, text]) => sum + encoder.encode(name).length + encoder.encode(text).length, 0);
  if (totalBytes > 50 * 1024 * 1024) throw new Error("Exportação excede o limite de 50 MiB.");
  const binary: Uint8Array[] = [], directory: Uint8Array[] = [];
  const seen = new Set<string>();
  let offset = 0;
  const write16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true);
  const write32 = (view: DataView, at: number, value: number) => view.setUint32(at, value >>> 0, true);
  function crc32(bytes: Uint8Array): number {
    let crc = -1;
    for (const value of bytes) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ -1) >>> 0;
  }
  for (const [filename, content] of entries) {
    if (!filename || filename.startsWith("/") || filename.includes("..") || (filename.includes("\\\\") || [...filename].some((char) => char.charCodeAt(0) < 32)) || filename.endsWith("/")) throw new Error("Caminho de exportação inseguro.");
    if (seen.has(filename.toLocaleLowerCase())) throw new Error("Nomes de exportação duplicados.");
    seen.add(filename.toLocaleLowerCase());
    const name = encoder.encode(filename), data = encoder.encode(content), crc = crc32(data);
    if (name.length > 65535 || data.length > 0xffffffff) throw new Error("Entrada ZIP excede o limite permitido.");
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    write32(h, 0, 0x04034b50); write16(h, 4, 20); write16(h, 6, 0x800);
    write16(h, 8, 0); write16(h, 10, 0); write16(h, 12, 0);
    write32(h, 14, crc); write32(h, 18, data.length); write32(h, 22, data.length);
    write16(h, 26, name.length); write16(h, 28, 0); header.set(name, 30);
    binary.push(header, data);
    const central = new Uint8Array(46 + name.length), c = new DataView(central.buffer);
    write32(c, 0, 0x02014b50); write16(c, 4, 20); write16(c, 6, 20);
    write16(c, 8, 0x800); write16(c, 10, 0); write16(c, 12, 0); write16(c, 14, 0);
    write32(c, 16, crc); write32(c, 20, data.length); write32(c, 24, data.length);
    write16(c, 28, name.length); write16(c, 30, 0); write16(c, 32, 0);
    write16(c, 34, 0); write16(c, 36, 0); write32(c, 38, 0); write32(c, 42, offset);
    central.set(name, 46); directory.push(central);
    offset += header.length + data.length;
  }
  const centralLength = directory.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  write32(e, 0, 0x06054b50); write16(e, 4, 0); write16(e, 6, 0);
  write16(e, 8, entries.length); write16(e, 10, entries.length);
  write32(e, 12, centralLength); write32(e, 16, offset); write16(e, 20, 0);
  return new Blob([...binary, ...directory, end], { type: "application/zip" });
}
