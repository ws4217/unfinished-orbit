import type { Settings } from '../core/storage.ts';

export class Audio {
  private context?: AudioContext;
  private lastText = 0;
  private settings: () => Settings;
  constructor(settings: () => Settings) { this.settings = settings; }
  unlock(): void {
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch { /* Audio failure must never block play. */ }
  }
  tone(frequency = 660, length = 0.04): void {
    const settings = this.settings();
    if (!this.context || settings.muted || settings.sfx === 0) return;
    try {
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      const now = this.context.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(settings.sfx / 100 * 0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + length);
      oscillator.connect(gain).connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + length);
    } catch { /* No sound is a supported fallback. */ }
  }
  text(speaker: string, character: string): void {
    if (/\s/.test(character) || performance.now() - this.lastText < 100) return;
    this.lastText = performance.now();
    this.tone(speaker === 'karo' ? 540 : speaker === 'merin' ? 320 : 700, 0.018);
  }
}
