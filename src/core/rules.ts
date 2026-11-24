import { ELEMENTS, EXPERIMENT_COMPARISONS, type Element, type GameState, type Experiment, type ExperimentConclusion, type HintStage } from './state.ts';

import ending from '../content/text/ending.json' with { type: 'json' };

export function validToken(input: string): boolean {
  return input.trim().toUpperCase() === ending.ui.tokenValue;
}
export function canDivide(state: GameState): boolean {
  return state.evidence.includes('p01') && state.evidence.includes('old-note');
}
export function hasStartedExperiment(state: GameState): boolean {
  return state.evidence.includes('experiment-intro') || state.experiment.discovered.length > 0;
}
export function canFirstPhone(state: GameState): boolean {
  return state.branch === 'symbols' ? state.evidence.includes('symbol-terminal')
    : state.branch === 'objects' && ['base-dark', 'base-moon', 'base-tomorrow', 'base-comet']
      .every(id => state.evidence.includes(id as typeof state.evidence[number]));
}
export function isMappingCorrect(items: Element[]): boolean {
  return items.length === 4 && items.every((item, index) => item === ELEMENTS[index]);
}
/** First failing rule, stable order. null means all five rules hold. */
export function orderingError(items: Element[]): number | null {
  if (items.length !== 4 || new Set(items).size !== 4 || items.some(id => !ELEMENTS.includes(id))) return 0;
  const at = (id: Element) => items.indexOf(id);
  const conditions = [
    at('dark') !== 1, at('moon') !== 2, at('dark') < at('tomorrow'),
    at('moon') < at('comet'), at('tomorrow') < at('comet'),
  ];
  const failed = conditions.indexOf(false);
  return failed < 0 ? null : failed + 1;
}
export function swap(items: Element[], a: number, b: number): Element[] {
  if (![a, b].every(index => Number.isInteger(index) && index >= 0 && index < 4)) return [...items];
  const result = [...items];
  [result[a], result[b]] = [result[b], result[a]];
  return result;
}
export function experimentResult(outside: boolean, held: boolean) {
  const id: Experiment = outside ? (held ? 'outside-held' : 'outside-free') : (held ? 'inside-held' : 'inside-free');
  const outcome = outside ? 'excluded' : held ? 'occupied' : 'restored';
  // retained描述纸上的图案，不是纸本身。恢复成功时留下空白快照。
  return { id, outcome, success: outcome !== 'occupied', retained: outcome !== 'restored' };
}
export function discoverExperiment(state: GameState): { fresh: boolean; conclusions: ExperimentConclusion[] } {
  const result = experimentResult(state.experiment.outside, state.experiment.held);
  const fresh = !state.experiment.discovered.includes(result.id);
  if (fresh) state.experiment.discovered.push(result.id);
  const conclusions = (Object.keys(EXPERIMENT_COMPARISONS) as ExperimentConclusion[]).filter(id =>
    !state.experiment.conclusions.includes(id)
    && EXPERIMENT_COMPARISONS[id].every(item => state.experiment.discovered.includes(item)));
  state.experiment.conclusions.push(...conclusions);
  return { fresh, conclusions };
}
export function canFindEntrance(state: GameState): boolean {
  return state.experiment.discovered.length === 4 && state.evidence.includes('storage');
}
export function addLog(state: GameState, id: string): boolean {
  if (state.log.includes(id)) return false;
  state.log.push(id);
  return true;
}
export function nextHint(state: GameState, stage: HintStage): number {
  state.hints[stage] = Math.min(3, state.hints[stage] + 1);
  return state.hints[stage];
}
