import routes from '../content/maps/karo-routes.json' with { type: 'json' };
import type { Branch, GameState } from './state.ts';

type Direction = 'up' | 'down' | 'left' | 'right';
type Leg = { room: string; points: number[][] };
export interface KaroPresence { room: string; x: number; y: number; moving: boolean; facing: Direction }

export function karoBlocksPlayer(presence: KaroPresence, player?: { x: number; y: number }): boolean {
  if (presence.moving) return false;
  // 玩家16×12脚框；Karo24×12脚框。行动结束时已重叠就允许走离，离开后恢复实体碰撞。
  return !player || !(Math.abs(player.x - presence.x) < 20
    && player.y + 6 > presence.y - 12 && player.y - 6 < presence.y);
}

/** 两次固定行动的运行态；不写存档，不创建跟随／寻路或主线前置。 */
export class KaroJourney {
  private legs?: Leg[];
  private leg = 0;
  private node = 1;
  private location?: KaroPresence;
  private returned = false;
  reset(state: GameState): void {
    this.legs = undefined; this.location = undefined;
    this.returned = state.phones.third;
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
      this.location.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      const step = Math.min(length, distance);
      this.location.x += dx / length * step;
      this.location.y += dy / length * step;
      distance -= step;
      if (step === length) this.node++;
    }
  }
  presence(state: GameState): KaroPresence | undefined {
    if (this.location) return { ...this.location };
    let room: keyof typeof routes.parking | undefined;
    if (state.registered) room = 'stable';
    else if (state.phones.third && this.returned) room = 'maintenance';
    else if (state.phase === 'arrival' && state.evidence.includes('met-karo')) room = 'junction';
    return room ? { room, ...routes.parking[room], moving: false, facing: 'down' } : undefined;
  }
}
