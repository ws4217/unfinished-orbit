import station from '../content/assets/station-frames.json' with { type: 'json' };
import decor from '../content/assets/decor-frames.json' with { type: 'json' };
import theme from '../content/assets/room-theme-frames.json' with { type: 'json' };
import furniture from '../content/assets/garden-furniture-frames.json' with { type: 'json' };

export interface SourceFrame {
  texture: string; x: number; y: number; w: number; h: number;
  anchor?: { x: number; y: number };
}
export const FRAMES: Record<string, SourceFrame> = { ...station.frames, ...decor.frames, ...theme.frames, ...furniture.frames };
