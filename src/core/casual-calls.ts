import { CASUAL_CALL_LIMITS, type CasualTopic, type GameState } from './state.ts';

/** 返回下一组索引；听完全部后固定在末组。只在调用方确认完整听完后推进。 */
export function casualCallIndex(state: GameState, topic: CasualTopic): number {
  return Math.min(state.casualCalls?.[topic] ?? 0, CASUAL_CALL_LIMITS[topic] - 1);
}
export function hasNewCasualCall(state: GameState, topic: CasualTopic): boolean {
  const heard = state.casualCalls?.[topic] ?? 0;
  return heard > 0 && heard < CASUAL_CALL_LIMITS[topic];
}
export function finishCasualCall(state: GameState, topic: CasualTopic): boolean {
  if (!state.evidence.includes('met-karo')) return false;
  const heard = state.casualCalls?.[topic] ?? 0;
  if (heard >= CASUAL_CALL_LIMITS[topic]) return false;
  state.casualCalls ??= { greet: 0, patterns: 0, flirt: 0 };
  state.casualCalls[topic] = heard + 1;
  return true;
}
