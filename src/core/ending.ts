import { type GameState, type Collection } from './state.ts';

export function collect(state: GameState, item: Collection): boolean {
  if (state.phase !== 'revisit' || !state.registered || state.collections.includes(item)) return false;
  state.collections.push(item);
  return true;
}
export function tokenReady(state: GameState): boolean { return state.collections.length === 3; }
export function hasWokenInNextCycle(state: GameState): boolean {
  return state.registered && (state.phase === 'reunion' || state.phase === 'revisit');
}
