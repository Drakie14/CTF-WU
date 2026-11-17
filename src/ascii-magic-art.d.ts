declare module 'ascii-magic-art/pieces/desert-needle-skyline.js' {
  export type SkylineFrame = { text: string; color: string };
  export const meta: { cols: number; rows: number; fps: number; palette: Record<string, string> };
  export default function createSkyline(): (seconds: number) => SkylineFrame;
}
