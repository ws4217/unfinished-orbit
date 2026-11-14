import { ELEMENTS, type GameState } from './state.ts';
import { canFirstPhone, isMappingCorrect, orderingError } from './rules.ts';

export type BranchError = 'observe' | 'phone1' | 'mapping' | 'phone2' | 'ordering';
export function firstSync(state: GameState): BranchError | null {
  if (!canFirstPhone(state)) return 'observe';
  state.phones.first = true;
  return null;
}
export function submitMapping(state: GameState): BranchError | null {
  if (!state.phones.first) return 'phone1';
  if (!isMappingCorrect(state.puzzles.symbols)) return 'mapping';
  state.puzzles.mappingDone = true;
  return null;
}
export function secondSync(state: GameState): BranchError | null {
  if (!state.phones.first) return 'phone1';
  if (state.branch === 'symbols' && !state.puzzles.mappingDone) return 'mapping';
  state.phones.second = true;
  if (state.branch === 'objects') {
    state.puzzles.symbols = [...ELEMENTS];
    state.puzzles.mappingDone = true;
  } else {
    state.puzzles.objects = [...ELEMENTS];
    state.puzzles.orderingDone = true;
    state.phase = 'report';
  }
  return null;
}
export function submitOrdering(state: GameState): BranchError | null {
  if (!state.phones.second) return 'phone2';
  if (orderingError(state.puzzles.objects) !== null) return 'ordering';
  state.puzzles.orderingDone = true;
  state.phase = 'report';
  return null;
}
export function reportRead(state: GameState): boolean {
  if (state.phase !== 'report') return false;
  state.phase = 'phone3';
  return true;
}
export function thirdSync(state: GameState): boolean {
  if (state.phase !== 'phone3') return false;
  state.phones.third = true;
  state.phase = 'maintenance';
  return true;
}
