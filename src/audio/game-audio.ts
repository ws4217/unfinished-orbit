import manifest from '../content/assets/audio-manifest.json' with { type: 'json' };
import config from '../content/assets/audio-playback.json' with { type: 'json' };
import { AudioLoadQueue } from './audio-load-queue.ts';
import { nextTrack, type MusicStage, type Track } from './audio-policy.ts';
import type { Settings } from '../core/storage.ts';

export type SoundEvent = keyof typeof config.events;
interface Voice { source: AudioScheduledSourceNode; gain: GainNode; priority: number; event: string }
interface Hooks { music?: (track: Track) => void; status?: () => void }
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export class Audio {
  private context?: AudioContext;
  private bgmVolume?: GainNode;
  private bgmEnvelope?: GainNode;
  private sfxVolume?: GainNode;
  private media?: HTMLAudioElement;
  private buffers = new Map<string, AudioBuffer>();
  private effectLoads = new Set<string>();
  private blobs = new Map<string, string>();
  private failed = new Set<string>();
  private loading = 0;
  private slow = false;
  private slowTimer?: ReturnType<typeof setTimeout>;
  private voices = new Set<Voice>();
  private lastText = -Infinity;
  private lastFocus = -Infinity;
  private pending: SoundEvent[] = [];
  private eventScheduled = false;
  private stage: MusicStage = 'intro';
  private current?: Track;
  private generation = 0;
  private ducked = false;
  private started = false;
  private musicStarts = 0;
  private settings: () => Settings;
  private hooks: Hooks;
  private queue = new AudioLoadQueue(async url => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`Audio HTTP ${response.status}`);
      return await response.arrayBuffer();
    } finally { clearTimeout(timer); }
  }, config.batchLimitBytes);
  constructor(settings: () => Settings, hooks: Hooks = {}) { this.settings = settings; this.hooks = hooks; }
  unlock(): void {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.bgmVolume = this.context.createGain();
        this.bgmEnvelope = this.context.createGain();
        this.sfxVolume = this.context.createGain();
        this.bgmEnvelope.connect(this.bgmVolume).connect(this.context.destination);
        this.sfxVolume.connect(this.context.destination);
        this.media = document.createElement('audio');
        this.media.preload = 'auto';
        this.context.createMediaElementSource(this.media).connect(this.bgmEnvelope);
        this.media.addEventListener('ended', () => {
          if (this.stage === 'techno' && this.current) {
            const track = nextTrack(this.stage, this.current);
            void this.changeTrack(track, ++this.generation);
          }
        });
        this.media.addEventListener('error', () => {
          if (this.media?.getAttribute('src')) this.markFailed('bgm-playback');
        });
      }
      void this.context.resume().catch(() => this.markFailed('audio-context'));
      this.updateSettings();
      if (!this.started) {
        this.started = true;
        this.preloadEffects();
        void this.changeTrack(this.stage, ++this.generation);
      }
    } catch { this.markFailed('audio-context'); }
  }
  setStage(stage: MusicStage, restart = false): void {
    if (this.stage === stage && !restart) return;
    this.stage = stage;
    if (!this.started) return;
    void this.changeTrack(stage, ++this.generation);
  }
  setDialogue(active: boolean): void { this.ducked = active; this.updateSettings(); }
  updateSettings(): void {
    if (!this.context) return;
    const settings = this.settings(), now = this.context.currentTime;
    this.bgmVolume?.gain.setValueAtTime(settings.muted ? 0 : settings.bgm / 100 * (this.ducked ? config.dialogueRatio : 1), now);
    this.sfxVolume?.gain.setValueAtTime(settings.muted ? 0 : settings.sfx / 100, now);
    // 只调增益，不暂停/重启媒体；静音期间仍正常换曲和推进时间。
    this.notify();
  }
  get status(): 'locked' | 'loading' | 'loadingSlow' | 'failed' | 'ready' {
    if (this.failed.size) return 'failed';
    if (!this.started) return 'locked';
    return this.loading ? (this.slow ? 'loadingSlow' : 'loading') : 'ready';
  }
  get hasFailures(): boolean { return this.failed.size > 0; }
  retry(): void {
    const retryMusic = !this.current || [...this.failed].some(id => !id.startsWith('sfx.'));
    const wasStarted = this.started;
    this.failed.clear();
    this.unlock();
    this.preloadEffects();
    if (retryMusic && wasStarted) void this.changeTrack(this.stage, ++this.generation);
    this.notify();
  }
  get playback() { return { current: this.current ?? '', musicStarts: this.musicStarts, ducked: this.ducked }; }
  private notify(): void { this.hooks.status?.(); }
  private markFailed(id: string): void { this.failed.add(id); this.notify(); }
  private beginLoad(): void {
    if (this.loading++ === 0) {
      this.slow = false;
      this.slowTimer = setTimeout(() => { this.slow = true; this.notify(); }, 15000);
    }
    this.notify();
  }
  private endLoad(): void {
    this.loading--;
    if (!this.loading && this.slowTimer !== undefined) { clearTimeout(this.slowTimer); this.slowTimer = undefined; }
    this.notify();
  }
  private preloadEffects(): void {
    for (const asset of manifest.entries.filter(asset => asset.id.startsWith('sfx.'))) {
      if (this.buffers.has(asset.id) || this.effectLoads.has(asset.id)) continue;
      this.effectLoads.add(asset.id);
      this.beginLoad();
      void this.queue.load(asset).then(async bytes => {
        if (!bytes || !this.context) return;
        this.buffers.set(asset.id, await this.context.decodeAudioData(bytes.slice(0)));
        this.failed.delete(asset.id);
      }).catch(() => this.markFailed(asset.id)).finally(() => { this.effectLoads.delete(asset.id); this.endLoad(); });
    }
  }
  private async changeTrack(track: Track, generation: number): Promise<void> {
    const asset = manifest.entries.find(asset => asset.id === config.tracks[track].asset)!;
    const needed = () => generation === this.generation;
    this.beginLoad();
    try {
      let bytes = await this.queue.load(asset, needed);
      if (!bytes && needed()) bytes = await this.queue.load(asset, needed);
      if (!bytes || !needed() || !this.media || !this.bgmEnvelope || !this.context) return;
      if (!this.blobs.has(asset.id)) this.blobs.set(asset.id, URL.createObjectURL(new Blob([bytes], { type: 'audio/ogg' })));
      if (this.current && !this.media.paused) {
        const now = this.context.currentTime;
        this.bgmEnvelope.gain.cancelScheduledValues(now);
        this.bgmEnvelope.gain.setValueAtTime(this.bgmEnvelope.gain.value, now);
        this.bgmEnvelope.gain.linearRampToValueAtTime(0, now + config.fadeMs / 1000);
        await wait(config.fadeMs);
      }
      if (!needed()) return;
      this.media.pause();
      this.current = undefined;
      this.media.src = this.blobs.get(asset.id)!;
      this.media.playbackRate = 1; // Fleeting成品已1.5×处理，绝不再加速。
      this.media.loop = this.stage !== 'techno';
      this.bgmEnvelope.gain.cancelScheduledValues(this.context.currentTime);
      this.bgmEnvelope.gain.setValueAtTime(0, this.context.currentTime);
      await this.media.play();
      if (!needed()) return;
      this.current = track; this.musicStarts++;
      this.failed.delete(asset.id); this.failed.delete('bgm-playback');
      this.bgmEnvelope.gain.linearRampToValueAtTime(1, this.context.currentTime + config.fadeMs / 1000);
      this.hooks.music?.(track);
      // Techno交替的下一首只在本首已开始后排队，仍用同一串行加载队列。
      if (this.stage === 'techno') {
        const following = manifest.entries.find(item => item.id === config.tracks[nextTrack(this.stage, track)].asset)!;
        void this.queue.load(following, () => this.stage === 'techno').catch(() => this.markFailed(following.id));
      }
    } catch {
      if (needed()) { this.media?.pause(); this.current = undefined; this.markFailed(asset.id); }
    } finally { this.endLoad(); }
  }
  event(event: SoundEvent): void {
    if (!this.started) return;
    if (event === 'sfx.ui.focus') {
      if (performance.now() - this.lastFocus < 40) return;
      this.lastFocus = performance.now();
    }
    this.pending.push(event);
    if (this.eventScheduled) return;
    this.eventScheduled = true;
    queueMicrotask(() => {
      this.eventScheduled = false;
      const candidates = this.pending; this.pending = [];
      const best = candidates.sort((a, b) => config.events[b].priority - config.events[a].priority)[0];
      if (best) {
        try { this.playEvent(best); } catch { this.markFailed('sfx-playback'); }
      }
    });
  }
  // 维护路径的独立成功／失败是新反馈，快速连续时从头播放而不叠同一音效。
  retrigger(event: SoundEvent): void {
    for (const voice of this.voices) if (voice.event === event) this.stopVoice(voice);
    this.event(event);
  }
  private playEvent(event: SoundEvent): void {
    const alias = event === 'sfx.ui.back' ? 'sfx.ui.confirm' : event;
    const buffer = this.buffers.get(alias);
    const settings = this.settings();
    if (!buffer || !this.context || !this.sfxVolume || settings.muted || settings.sfx === 0) return;
    if ([...this.voices].some(voice => voice.event === event)) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const length = event === 'sfx.machine.clean' ? Math.min(2, buffer.duration) : buffer.duration;
    this.startVoice(source, event, config.events[event].priority, 1, length);
  }
  private startVoice(source: AudioScheduledSourceNode, event: string, priority: number, volume: number, length: number): void {
    if (!this.context || !this.sfxVolume) return;
    if (this.voices.size >= config.maxSfxVoices) {
      const lowest = [...this.voices].sort((a, b) => a.priority - b.priority)[0];
      if (lowest.priority > priority) return;
      this.stopVoice(lowest);
    }
    const gain = this.context.createGain(), now = this.context.currentTime;
    gain.gain.setValueAtTime(volume, now);
    if (event === 'text') gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    source.connect(gain).connect(this.sfxVolume);
    const voice = { source, gain, event, priority };
    this.voices.add(voice);
    source.onended = () => { this.voices.delete(voice); source.disconnect(); gain.disconnect(); this.notify(); };
    source.start(now); source.stop(now + length);
    this.notify();
  }
  private stopVoice(voice: Voice): void {
    this.voices.delete(voice);
    try { voice.source.stop(); } catch { /* 已结束亦可安全关闭。 */ }
  }
  stopMachine(): void {
    this.pending = this.pending.filter(event => event !== 'sfx.machine.clean');
    for (const voice of this.voices) if (voice.event === 'sfx.machine.clean') this.stopVoice(voice);
  }
  text(speaker: string, character: string): void {
    if (!this.context || /\s/.test(character) || performance.now() - this.lastText < config.textIntervalMs) return;
    this.lastText = performance.now();
    this.playText(speaker);
  }
  bootLine(warning: boolean): void {
    if (warning) this.retrigger('sfx.error.input');
    else this.playText('pruto');
  }
  private playText(speaker: string): void {
    if (!this.context) return;
    const settings = this.settings();
    if (settings.muted || settings.sfx === 0) return;
    try {
      const source = this.context.createOscillator();
      source.type = 'sine';
      source.frequency.value = speaker === 'karo' ? 540 : speaker === 'merin' ? 320 : 700;
      this.startVoice(source, 'text', 0, 0.10, 0.018);
    } catch { this.markFailed('text-playback'); }
  }
}
