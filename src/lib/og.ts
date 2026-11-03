const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
export function ogSvg(title: string, ctf: string, category: string): string {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const chunks = word.match(/.{1,30}/gu) ?? [''];
    for (const part of chunks) {
      if ((line + ' ' + part).trim().length > 30 && line) {
        lines.push(line);
        line = '';
      }
      line = (line + ' ' + part).trim();
    }
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, 3);
  if (lines.length > 3) visible[2] = visible[2].slice(0, 28) + '…';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#16101f"/><path d="M940 0h260v630H560Z" fill="#291a36"/><rect x="66" y="72" width="8" height="46" fill="#f472b6"/><g font-family="DejaVu Sans, sans-serif" fill="#ece8f4"><text x="98" y="106" font-size="30" letter-spacing="4">DRAKIE14 / CTF WRITE-UPS</text>${visible.map((text, i) => `<text x="66" y="${235 + i * 78}" font-weight="700" font-size="60">${escapeXml(text)}</text>`).join('')}<text x="66" y="535" font-size="28" fill="#c9c1d8">${escapeXml(ctf.slice(0, 55))}</text><text x="66" y="585" font-size="25" fill="#f472b6">${escapeXml(category.toUpperCase())}</text></g></svg>`;
}
