export const ROUTE_ROWS = [[6, 4000], [8, 4500], [10, 4800], [12, 5200], [22, 7000]] as const;
export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type Direction = typeof DIRECTIONS[number];
export type RouteEvent = 'correct' | 'wrong' | 'timeout' | 'row' | 'complete';

export class MaintenanceRoute {
  readonly rows: Direction[][];
  row = 0;
  cursor = 0;
  failures = 0;
  private started?: number;
  private random: () => number;

  constructor(random = Math.random) {
    this.random = random;
    this.rows = ROUTE_ROWS.map(([length]) => this.generate(length));
  }
  get done(): boolean { return this.row === this.rows.length; }
  get limit(): number { return ROUTE_ROWS[this.row][1] + Math.max(0, this.failures - 2) * 500; }
  get running(): boolean { return this.started !== undefined; }
  remaining(now: number): number {
    return Math.max(0, this.limit - (this.started === undefined ? 0 : Math.max(0, now - this.started)));
  }
  tick(now: number): 'timeout' | undefined {
    if (!this.done && this.running && this.remaining(now) === 0) {
      this.retry(); return 'timeout';
    }
  }
  press(direction: Direction, now: number): RouteEvent | undefined {
    if (this.done) return;
    if (this.tick(now)) return 'timeout';
    this.started ??= now;
    if (this.rows[this.row][this.cursor] !== direction) {
      this.retry(); return 'wrong';
    }
    if (++this.cursor < this.rows[this.row].length) return 'correct';
    this.row++;
    this.cursor = this.failures = 0;
    this.started = undefined;
    return this.done ? 'complete' : 'row';
  }
  private retry(): void {
    const old = this.rows[this.row];
    const next = this.generate(old.length);
    if (next.every((direction, i) => direction === old[i])) {
      next[0] = DIRECTIONS[(DIRECTIONS.indexOf(old[0]) + 1) % DIRECTIONS.length];
    }
    this.rows[this.row] = next;
    this.cursor = 0;
    this.failures++;
    this.started = undefined;
  }
  private generate(length: number): Direction[] {
    return Array.from({ length }, () => DIRECTIONS[Math.floor(this.random() * DIRECTIONS.length)]);
  }
}
