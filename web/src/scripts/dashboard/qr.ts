import qrcode from "qrcode-generator";

export function qrSvg(value: string, size = 176): string {
  const code = qrcode(0, "M");
  code.addData(value);
  code.make();
  const count = code.getModuleCount();
  let cells = "";
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) cells += `<rect x="${col}" y="${row}" width="1" height="1"/>`;
    }
  }
  return `<svg class="qr" viewBox="0 0 ${count} ${count}" width="${size}" height="${size}" role="img" aria-label="QR code" shape-rendering="crispEdges"><rect width="${count}" height="${count}" fill="#fff"/><g fill="#14181a">${cells}</g></svg>`;
}
