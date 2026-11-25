import { createState, isGameState, type GameState } from './state.ts';

export const SAVE_KEY = 'unfinished-orbit.save.v1';
export const SETTINGS_KEY = 'unfinished-orbit.settings.v1';
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface Settings { bgm: number; sfx: number; muted: boolean }
export const DEFAULT_SETTINGS: Settings = { bgm: 40, sfx: 60, muted: false };
export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; state: GameState }
  | { status: 'invalid' }
  | { status: 'unavailable' };

function migrateLegacyElements(value: unknown): void {
  if (!value || typeof value !== 'object' || !('puzzles' in value)) return;
  const puzzles = value.puzzles;
  if (!puzzles || typeof puzzles !== 'object') return;
  const slots = puzzles as Record<string, unknown>;
  for (const key of ['symbols', 'objects']) {
    const order = slots[key];
    if (Array.isArray(order)) slots[key] = order.map(id => id === 'tomorrow' ? 'delta' : id);
  }
}

export function loadGame(storage: StorageLike): LoadResult {
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (raw === null) return { status: 'empty' };
    try {
      const value: unknown = JSON.parse(raw);
      migrateLegacyElements(value);
      return isGameState(value) ? { status: 'ok', state: value } : { status: 'invalid' };
    } catch { return { status: 'invalid' }; }
  } catch { return { status: 'unavailable' }; }
}

/** One owner for persistence. Invalid input locks writes until explicit restart consent. */
export class SaveSession {
  state: GameState;
  blocked: boolean;
  loadStatus: LoadResult['status'];
  private storage: StorageLike;
  private onFailure: () => void;
  constructor(storage: StorageLike, onFailure: () => void) {
    this.storage = storage;
    this.onFailure = onFailure;
    const result = loadGame(storage);
    this.loadStatus = result.status;
    this.state = result.status === 'ok' ? result.state : createState();
    this.blocked = result.status === 'invalid';
    if (result.status === 'unavailable') onFailure();
  }
  save(): boolean {
    if (this.blocked) return false;
    try {
      if (!isGameState(this.state)) throw new Error('Invalid runtime state');
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.state));
      this.loadStatus = 'ok';
      return true;
    } catch { this.onFailure(); return false; }
  }
  restart(confirmed: boolean): boolean {
    if (!confirmed) return false;
    this.blocked = false;
    this.state = createState();
    return this.save();
  }
}

export function loadSettings(storage: StorageLike): Settings {
  try {
    const value = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null');
    if (value && typeof value.muted === 'boolean' && ['bgm', 'sfx'].every(key =>
      typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 100)) {
      return { bgm: value.bgm, sfx: value.sfx, muted: value.muted };
    }
  } catch { /* Noncritical preferences fall back without changing adventure data. */ }
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(storage: StorageLike, settings: Settings): boolean {
  try { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; }
  catch { return false; }
}

// Accessing window.localStorage itself may throw in restricted browsers.
export function browserStorage(): StorageLike {
  return {
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: key => window.localStorage.removeItem(key),
  };
}
