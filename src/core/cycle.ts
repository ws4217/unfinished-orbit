import type { GameState } from './state.ts';

export const LAST_RETURN = 11;
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
  return s.phase === 'entrance' && !s.entranceFound && (!s.cycle || s.cycle.beat === 'open');
}
export function chooseReturn(s: GameState): boolean {
  if (!portalOpen(s)) return false;
  const c = cycleOf(s);
  c.beat = ++c.count === LAST_RETURN ? 'closed' : 'return';
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
