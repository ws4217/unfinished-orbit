export interface Rect { x: number; y: number; w: number; h: number }
export interface Target { id: string; x: number; y: number }
export function inside(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}
export function moveVector(keys: Set<string>, elapsed: number): { x: number; y: number } {
  let x = Number(keys.has('ArrowRight') || keys.has('d')) - Number(keys.has('ArrowLeft') || keys.has('a'));
  let y = Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w'));
  const length = Math.hypot(x, y);
  if (length > 0) { x /= length; y /= length; }
  return { x: x * 256 * elapsed, y: y * 256 * elapsed };
}
export function nearest<T extends Target>(x: number, y: number, objects: T[]): T | undefined {
  return objects.filter(item => Math.hypot(item.x - x, item.y - y) <= 48)
    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || a.id.localeCompare(b.id))[0];
}
