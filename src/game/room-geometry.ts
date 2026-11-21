import { inside, type Rect } from '../core/world-geometry.ts';

export function footBlocked(x: number, y: number, walkable: Rect[], solids: Rect[]): boolean {
  const foot = { x: x - 8, y: y - 6, w: 16, h: 12 };
  if (![[foot.x, foot.y], [foot.x + 16, foot.y], [foot.x, foot.y + 12], [foot.x + 16, foot.y + 12]]
    .every(([cx, cy]) => walkable.some(rect => inside(cx, cy, rect)))) return true;
  return solids.some(rect => foot.x < rect.x + rect.w && foot.x + foot.w > rect.x
    && foot.y < rect.y + rect.h && foot.y + foot.h > rect.y);
}
