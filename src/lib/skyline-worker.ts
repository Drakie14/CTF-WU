import createSkyline, { meta, type SkylineFrame } from 'ascii-magic-art/pieces/desert-needle-skyline.js';

function createSkylinePlayer(canvas: OffscreenCanvas) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Skyline canvas is unavailable');

  const cell = 5;
  const shades = '▁▂▃▄▅▆▇█';
  const draw = createSkyline();
  const { cols, rows, fps, palette } = meta;
  const stride = cols + 1;
  canvas.width = cols * cell;
  canvas.height = rows * cell;
  context.font = '8px monospace';
  context.textBaseline = 'bottom';

  let previous: SkylineFrame | undefined;
  const paint = (seconds: number) => {
    const frame = draw(seconds);
    for (let y = 0; y < rows; y++) {
      const top = y * cell;
      for (let x = 0; x < cols; x++) {
        const index = y * stride + x;
        const glyph = frame.text[index];
        const color = frame.color[index];
        if (previous?.text[index] === glyph && previous?.color[index] === color) continue;
        const left = x * cell;
        context.fillStyle = '#171421';
        context.fillRect(left, top, cell, cell);
        if (!glyph || glyph === ' ') continue;
        context.fillStyle = palette[color ?? ''] || '#e2bccc';
        const level = shades.indexOf(glyph) + 1;
        if (level) {
          const ink = Math.max(1, Math.round(cell * level / 8));
          context.fillRect(left, top + cell - ink, cell - 1, ink);
        } else {
          context.fillText(glyph, left, top + cell, cell);
        }
      }
    }
    previous = frame;
  };

  let elapsed = 1.25;
  let lastFrame = Math.floor(elapsed * fps);
  let lastTimestamp: number | undefined;
  let request: number | undefined;
  function tick(timestamp: number) {
    if (lastTimestamp !== undefined) elapsed += (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    const frame = Math.floor(elapsed * fps);
    if (frame !== lastFrame) {
      lastFrame = frame;
      paint(elapsed);
    }
    request = requestAnimationFrame(tick);
  }

  paint(elapsed);

  return {
    play() { request ??= requestAnimationFrame(tick); },
    pause() {
      if (request !== undefined) cancelAnimationFrame(request);
      request = undefined;
      lastTimestamp = undefined;
    },
  };
}

let player: ReturnType<typeof createSkylinePlayer> | undefined;
globalThis.addEventListener('message', ({ data }: MessageEvent<OffscreenCanvas | 'play' | 'pause'>) => {
  if (data === 'play') player?.play();
  else if (data === 'pause') player?.pause();
  else {
    player = createSkylinePlayer(data);
    globalThis.postMessage('ready');
  }
});
