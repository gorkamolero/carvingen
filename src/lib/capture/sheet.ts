import sharp from "sharp";
export const sheetLayout = (count: number) => ({ width: Math.max(1, count) * 600, height: 680, cellWidth: 600, labelHeight: 80 });
function escapeXml(value: string) { return value.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!); }
export async function buildSheet(items: { label: string; buffer: Buffer }[]) {
  if (!items.length) throw new Error("No images available for sheet.");
  const layout = sheetLayout(items.length);
  const layers = await Promise.all(items.map(async (item, i) => ({ input: await sharp(item.buffer).rotate().resize(560, 560, { fit: "contain", background: "#fafaf5" }).png().toBuffer(), left: i * 600 + 20, top: 100 })));
  const labels = Buffer.from(`<svg width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg">${items.map((item, i) => `<text x="${i * 600 + 24}" y="50" font-family="sans-serif" font-size="26" font-weight="bold">${escapeXml(item.label.slice(0, 35))}</text>`).join("")}</svg>`);
  return sharp({ create: { width: layout.width, height: layout.height, channels: 4, background: "#fafaf5" } }).composite([...layers, { input: labels, left: 0, top: 0 }]).png().toBuffer();
}
