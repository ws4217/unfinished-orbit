import routes from '../content/maps/karo-routes.json' with { type: 'json' };
import type { Branch, GameState } from './state.ts';
import { facingOf, type Facing, type Point } from './world-geometry.ts';

type Leg = { room: string; points: number[][] };
export interface KaroPresence extends Point { room: string; moving: boolean; facing: Facing }
export const FOLLOW_GAP = 48;

/** Karo 的固定行动与跟随共用一个运行态；不写存档。 */
export class KaroMotion {
  private legs?: Leg[];
  private leg = 0;
  private node = 1;
  private location?: KaroPresence;
  private returned = false;
  private follower?: { trail: FollowTrail; presence: KaroPresence };
  get following(): boolean { return this.follower !== undefined; }
  reset(state: GameState): void {
    this.legs = undefined; this.location = undefined;
    this.leaveFollow();
    this.returned = state.phones.third;
  }
  leaveFollow(): void { this.follower = undefined; }
  followFrom(room: string, leader: Point, facing: Facing, blocked: (x: number, y: number) => boolean): void {
    const trail = new FollowTrail(leader, clearStart(leader, facing, blocked), facing);
    this.follower = { trail, presence: { room, ...trail.update(leader) } };
  }
  trackLeader(leader: Point): KaroPresence | undefined {
    if (!this.follower) return;
    const next = { room: this.follower.presence.room, ...this.follower.trail.update(leader) };
    this.follower.presence = next;
    return next;
  }
  blocksPlayer(presence: KaroPresence, player?: Point): boolean {
    if (this.following || presence.moving) return false;
    // 脚框已重叠时先允许走离，离开后恢复固定停点的碰撞。
    return !player || !(Math.abs(player.x - presence.x) < 20
      && player.y + 6 > presence.y - 12 && player.y - 6 < presence.y);
  }
  depart(branch: Branch): void { this.start(routes.departure[branch]); }
  returnFromPartner(state: GameState): void {
    if (this.returned || !state.phones.third || !state.branch) return;
    this.returned = true;
    this.start(routes.return[state.branch]);
  }
  private start(legs: Leg[]): void {
    this.legs = legs; this.leg = 0; this.node = 1;
    const [x, y] = legs[0].points[0];
    this.location = { room: legs[0].room, x, y, moving: true, facing: 'down' };
  }
  advance(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    let distance = routes.speed * seconds;
    while (this.legs && this.location && distance > 0) {
      const leg = this.legs[this.leg], point = leg.points[this.node];
      if (!point) {
        this.leg++;
        const next = this.legs[this.leg];
        if (!next) { this.legs = undefined; this.location = undefined; break; }
        const [x, y] = next.points[0];
        this.location = { room: next.room, x, y, moving: true, facing: 'right' };
        this.node = 1;
        continue;
      }
      const dx = point[0] - this.location.x, dy = point[1] - this.location.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) { this.node++; continue; }
      this.location.facing = facingOf(dx, dy);
      const step = Math.min(length, distance);
      this.location.x += dx / length * step;
      this.location.y += dy / length * step;
      distance -= step;
      if (step === length) this.node++;
    }
  }
  presence(state: GameState): KaroPresence | undefined {
    if (this.follower) return { ...this.follower.presence };
    if (state.phase === 'registration') return;
    if (this.location) return { ...this.location };
    let room: keyof typeof routes.parking | undefined;
    if (state.registered) room = 'stable';
    else if (state.phones.third && this.returned) room = 'maintenance';
    else if (state.phase === 'arrival' && state.evidence.includes('met-karo')) room = 'junction';
    return room ? { room, ...routes.parking[room], moving: false, facing: 'down' } : undefined;
  }
}

/** 以真实走过的路程维持48px间距，而不是对角线追赶。 */
class FollowTrail {
  private trail: (Point & { at: number })[];
  private point: Point;
  private facing: Facing;

  constructor(leader: Point, behind: Point, facing: Facing) {
    this.point = { ...behind };
    this.trail = [{ ...behind, at: 0 }, { x: leader.x, y: leader.y, at: Math.hypot(leader.x - behind.x, leader.y - behind.y) }];
    this.facing = facing;
  }

  update(leader: Point) {
    const last = this.trail.at(-1)!;
    const step = Math.hypot(leader.x - last.x, leader.y - last.y);
    if (step) this.trail.push({ x: leader.x, y: leader.y, at: last.at + step });
    const target = Math.max(0, last.at + step - FOLLOW_GAP);
    while (this.trail.length > 2 && this.trail[1].at <= target) this.trail.shift();
    const [start, end] = this.trail;
    const fraction = end.at === start.at ? 0 : (target - start.at) / (end.at - start.at);
    const x = start.x + (end.x - start.x) * fraction, y = start.y + (end.y - start.y) * fraction;
    const dx = x - this.point.x, dy = y - this.point.y;
    const moving = Math.hypot(dx, dy) > 1e-6;
    if (moving) this.facing = facingOf(dx, dy);
    this.point = { x, y };
    return { ...this.point, moving, facing: this.facing };
  }
}

function clearStart(leader: Point, facing: Facing, blocked: (x: number, y: number) => boolean): Point {
  const back = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] }[facing];
  let best = { point: { x: leader.x, y: leader.y }, distance: 0 };
  for (const [dx, dy] of [back, [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const length = Math.hypot(dx, dy);
    for (let distance = 1; distance <= FOLLOW_GAP; distance++) {
      const point = { x: leader.x + dx * distance / length, y: leader.y + dy * distance / length };
      if (blocked(point.x, point.y)) break;
      if (distance > best.distance) best = { point, distance };
    }
    if (best.distance === FOLLOW_GAP) break;
  }
  return best.point;
}
