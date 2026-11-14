export interface Point { x: number; y: number }
export interface Bounds { left: number; top: number; width: number; height: number }
export function toLogical(point: Point, bounds: Bounds, width = 960, height = 540): Point {
  return { x: (point.x - bounds.left) * width / bounds.width, y: (point.y - bounds.top) * height / bounds.height };
}
export function aligned(card: Point, target: Point): boolean {
  return Math.hypot(card.x - target.x, card.y - target.y) <= 12;
}
