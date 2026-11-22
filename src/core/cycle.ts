import type { GameState } from './state.ts';

export const LAST_RETURN = 11;
export const FIRST_CYCLE = 4216;
export const NEXT_CYCLE = FIRST_CYCLE + 1;

/** 只用于结局滚屏，不计入玩家的折返存档。 */
export function futureCycles(random = Math.random): number[] {
  return [NEXT_CYCLE + 1, ...[[7000, 8000], [20_000, 30_000], [300_000, 400_000], [90_000_000, 100_000_000]]
    .map(([min, max]) => min + Math.floor(random() * (max - min)))];
}
export type CycleBeat = 'open' | 'return' | 'closed' | 'apology' | 'visit' | 'p01' | 'merin' | 'drawing' | 'end';
export interface Cycle {
  count: number;
  beat: CycleBeat;
  sawTitle: boolean;
  p01: boolean;
  merin: boolean;
}
export function cycleOf(s: GameState): Cycle {
  return s.cycle ??= { count: 0, beat: 'open', sawTitle: false, p01: false, merin: false };
}
export function portalOpen(s: GameState): boolean {
  return s.phase === 'entrance' && !s.entranceFound
    && (!s.cycle || (s.cycle.beat === 'open' && s.cycle.count < LAST_RETURN - 1));
}
export function chooseReturn(s: GameState): boolean {
  if (!portalOpen(s)) return false;
  const c = cycleOf(s);
  c.count++;
  c.beat = 'return';
  return true;
}
export function closePortalOnTitle(s: GameState): boolean {
  const c = s.cycle;
  if (s.phase !== 'entrance' || s.entranceFound || c?.beat !== 'open' || c.count !== LAST_RETURN - 1) return false;
  c.count = LAST_RETURN;
  c.beat = 'closed';
  return true;
}
export function validCycle(value: unknown, phase: unknown): boolean {
  if (value === undefined) return phase !== 'cycle';
  if (!value || typeof value !== 'object') return false;
  const c = value as Cycle;
  if (!Number.isInteger(c.count) || c.count < 0 || c.count > LAST_RETURN
    || [c.sawTitle, c.p01, c.merin].some(flag => typeof flag !== 'boolean')) return false;
  if (phase === 'entrance') return !c.p01 && !c.merin && (c.count < LAST_RETURN
    ? c.beat === 'open' || (c.count > 0 && c.beat === 'return')
    : c.beat === 'closed' || c.beat === 'apology');
  return phase === 'cycle' && c.count === LAST_RETURN
    && (['visit', 'p01', 'merin'].includes(c.beat) || (c.p01 && c.merin && (c.beat === 'drawing' || c.beat === 'end')));
}
