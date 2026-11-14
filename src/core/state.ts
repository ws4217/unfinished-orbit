export const ELEMENTS = ['dark', 'moon', 'tomorrow', 'comet'] as const;
export type Element = typeof ELEMENTS[number];
export type Branch = 'symbols' | 'objects';
export const PHASES = ['arrival', 'branch', 'report', 'phone3', 'maintenance', 'entrance', 'stable', 'registration', 'reunion', 'revisit'] as const;
export type Phase = typeof PHASES[number];
export const EXPERIMENTS = ['inside-free', 'inside-held', 'outside-held', 'outside-free'] as const;
export type Experiment = typeof EXPERIMENTS[number];
export const COLLECTIONS = ['star-card', 'note', 'receipt'] as const;
export type Collection = typeof COLLECTIONS[number];
export const EVIDENCE = ['arrival-intro', 'p01', 'old-note', 'met-karo', 'symbol-terminal', 'base-dark', 'base-moon', 'base-tomorrow', 'base-comet', 'range', 'diagnosis', 'storage', 'experiment-intro'] as const;
export type Evidence = typeof EVIDENCE[number];
export const HINT_STAGES = ['mapping', 'ordering', 'experiment', 'calibration', 'route'] as const;
export type HintStage = typeof HINT_STAGES[number];

export interface GameState {
  version: 1;
  phase: Phase;
  branch: Branch | null;
  evidence: Evidence[];
  phones: { first: boolean; second: boolean; third: boolean };
  puzzles: { symbols: Element[]; objects: Element[]; mappingDone: boolean; orderingDone: boolean };
  experiment: { held: boolean; outside: boolean; discovered: Experiment[]; conclusions: string[] };
  hints: Record<HintStage, number>;
  log: string[];
  collections: Collection[];
  entranceFound: boolean;
  registered: boolean;
}

export function createState(): GameState {
  return {
    version: 1, phase: 'arrival', branch: null, evidence: [],
    phones: { first: false, second: false, third: false },
    puzzles: {
      symbols: ['moon', 'dark', 'comet', 'tomorrow'],
      objects: ['tomorrow', 'dark', 'comet', 'moon'],
      mappingDone: false, orderingDone: false,
    },
    experiment: { held: false, outside: false, discovered: [], conclusions: [] },
    hints: { mapping: 0, ordering: 0, experiment: 0, calibration: 0, route: 0 },
    log: [], collections: [], entranceFound: false, registered: false,
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function uniqueList(value: unknown, allowed?: readonly string[]): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string'
    && item.length > 0 && item.length <= 160 && (!allowed || allowed.includes(item)))
    && new Set(value).size === value.length && value.length <= 200;
}
export function isPermutation(value: unknown): value is Element[] {
  return uniqueList(value, ELEMENTS) && value.length === 4;
}

/** Invalid saves are rejected, never merged into defaults or silently repaired. */
export function isGameState(value: unknown): value is GameState {
  if (!record(value) || value.version !== 1 || !PHASES.includes(value.phase as Phase)
    || ![null, 'symbols', 'objects'].includes(value.branch as Branch | null)
    || !uniqueList(value.evidence, EVIDENCE) || !uniqueList(value.log)
    || !uniqueList(value.collections, COLLECTIONS)
    || typeof value.entranceFound !== 'boolean' || typeof value.registered !== 'boolean') return false;
  const { phones, puzzles, experiment, hints } = value;
  if (!record(phones) || !['first', 'second', 'third'].every(key => typeof phones[key] === 'boolean')
    || !record(puzzles) || !isPermutation(puzzles.symbols) || !isPermutation(puzzles.objects)
    || typeof puzzles.mappingDone !== 'boolean' || typeof puzzles.orderingDone !== 'boolean'
    || !record(experiment) || typeof experiment.held !== 'boolean' || typeof experiment.outside !== 'boolean'
    || !uniqueList(experiment.discovered, EXPERIMENTS)
    || !uniqueList(experiment.conclusions, ['occupancy', 'boundary', 'independence'])
    || !record(hints) || !HINT_STAGES.every(key => Number.isInteger(hints[key])
      && Number(hints[key]) >= 0 && Number(hints[key]) <= 3)) return false;
  // Reject impossible progression combinations, not merely malformed field types.
  const evidence = value.evidence;
  const discovered = experiment.discovered;
  if (phones.second && !phones.first || phones.third && !phones.second) return false;
  if (value.phase !== 'arrival' && value.branch === null) return false;
  if (phones.first && (value.branch === null || (value.branch === 'symbols'
    ? !value.evidence.includes('symbol-terminal')
    : !['base-dark', 'base-moon', 'base-tomorrow', 'base-comet'].every(id => evidence.includes(id))))) return false;
  if (puzzles.mappingDone && (!phones.first || !puzzles.symbols.every((id, i) => id === ELEMENTS[i]))) return false;
  if (puzzles.orderingDone && (!phones.second || !puzzles.objects.every((id, i) => id === ELEMENTS[i]))) return false;
  if (phones.second && !puzzles.mappingDone) return false;
  if (['report', 'phone3', 'maintenance', 'entrance', 'stable', 'registration', 'reunion', 'revisit'].includes(value.phase as string)
    && (!puzzles.mappingDone || !puzzles.orderingDone || !phones.second)) return false;
  if (['maintenance', 'entrance', 'stable', 'registration', 'reunion', 'revisit'].includes(value.phase as string) && !phones.third) return false;
  if ((value.entranceFound || ['entrance', 'stable', 'registration', 'reunion', 'revisit'].includes(value.phase as string))
    && (experiment.discovered.length !== 4 || !value.evidence.includes('storage'))) return false;
  if (value.registered && !value.entranceFound) return false;
  if (['stable', 'registration', 'reunion', 'revisit'].includes(value.phase as string) && !value.entranceFound) return false;
  if (['reunion', 'revisit'].includes(value.phase as string) && !value.registered) return false;
  if (value.collections.length > 0 && value.phase !== 'revisit') return false;
  const dependencies: Record<string, Experiment[]> = {
    occupancy: ['inside-free', 'inside-held'],
    boundary: ['inside-held', 'outside-held'],
    independence: ['outside-held', 'outside-free'],
  };
  if (!experiment.conclusions.every(id => dependencies[id].every(item => discovered.includes(item)))) return false;
  return true;
}
