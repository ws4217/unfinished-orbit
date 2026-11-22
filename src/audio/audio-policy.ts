import type { GameState } from '../core/state.ts';
import { hasStartedExperiment } from '../core/rules.ts';

export type MusicStage = 'intro' | 'exploration' | 'techno' | 'valley' | 'fleeting' | 'ending';
export type Track = MusicStage | 'alternate';
// 仅由现有剧情状态选曲，不新增进度字段、计时器或主线门槛。
export function musicStage(state: GameState, explorationStarted: boolean): MusicStage {
  if (state.registered) return 'ending';
  if (state.entranceFound) return 'exploration';
  if (state.phase === 'entrance') return 'fleeting';
  if (hasStartedExperiment(state)) return 'valley';
  if (['branch', 'report', 'phone3'].includes(state.phase)) return 'techno';
  if (state.phones.third || explorationStarted || state.evidence.some(id => ['p01', 'old-note', 'met-karo'].includes(id))) return 'exploration';
  return 'intro';
}
export function nextTrack(stage: MusicStage, current?: Track): Track {
  return stage === 'techno' && current === 'techno' ? 'alternate' : stage;
}
