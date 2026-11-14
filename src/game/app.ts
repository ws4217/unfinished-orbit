import Phaser from 'phaser';
import ui from '../content/text/ui.ts';
import story from '../content/text/exploration.json';
import { browserStorage, SaveSession, loadSettings, saveSettings, type Settings } from '../core/storage.ts';
import { requestFullscreen } from '../core/fullscreen.ts';
import { addLog, canDivide, nextHint } from '../core/rules.ts';
import { type Evidence, type HintStage } from '../core/state.ts';
import { StationScene, type WorldObject } from './world.ts';
import { Audio } from '../audio/synth-audio.ts';

type Speaker = keyof typeof ui.speakers;
export interface Line { speaker: Speaker; text: string; color?: string; spans?: { text: string; color?: string }[] }
type View = 'entry' | 'title' | 'world' | 'dialogue' | 'menu' | 'log' | 'settings' | 'puzzle';
interface Screen { view: View; render: () => void; key: (key: string) => void }
interface MenuItem { label: string; action: () => void }
const isBack = (key: string) => ['Shift', 'x'].includes(key);
const isConfirm = (key: string) => ['Enter', 'z'].includes(key);
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};

export class App {
  readonly session: SaveSession;
  readonly audio: Audio;
  readonly scene: StationScene;
  settings: Settings;
  private storage = browserStorage();
  private screen?: Screen;
  private view: View = 'entry';
  private root = document.getElementById('screen')!;
  private panel = document.querySelector<HTMLElement>('.panel')!;
  private actions = document.getElementById('actions')!;
  private status = document.getElementById('status')!;
  private hud = document.getElementById('hud')!;
  private target?: WorldObject;
  private entered = false;
  private renderReady = false;
  private toastTimer?: number;
  private typeTimer?: number;
  // T03+ attach real module entry points; no production skip/complete buttons.
  puzzleHandler?: (id: string) => void;
  collectionHandler?: (id: string) => void;
  menuProvider?: (back: () => void) => MenuItem[];
  titleProvider?: () => MenuItem[];
  hintProvider?: (stage: HintStage, level: number) => Line[];
  resumeHandler?: () => boolean;
  extraLogs: Record<string, string> = {};
  constructor() {
    for (const id of ['title', 'subtitle', 'stage', 'status'] as const) document.getElementById(id)!.textContent = ui.app[id];
    this.settings = loadSettings(this.storage);
    this.audio = new Audio(() => this.settings);
    this.session = new SaveSession(this.storage, () => {
      const warning = document.getElementById('save-warning')!;
      warning.textContent = ui.app.saveFailure;
      warning.hidden = false;
    });
    this.scene = new StationScene({
      state: () => this.session.state,
      active: () => this.view === 'world',
      ready: () => {
        this.renderReady = true;
        document.getElementById('app')!.dataset.ready = 'true';
        if (!this.entered) this.status.textContent = ui.app.enter;
      },
      target: object => {
        this.target = object;
        document.getElementById('target')!.textContent = object ? story.ui.interact + object.label : '';
      },
      meetKaro: () => {
        this.observe('met-karo');
        this.dialogue(story.dialogue['meet-karo'] as Line[], () => this.world(), true);
      },
      failed: () => { this.status.textContent = ui.app.error; },
    });
    try {
      new Phaser.Game({
        type: Phaser.AUTO, parent: 'game', width: 960, height: 540, backgroundColor: '#080f1b', pixelArt: true,
        audio: { noAudio: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: this.scene,
      });
    } catch (error) { this.status.textContent = ui.app.error; console.error(error); }
    document.getElementById('hud-controls')!.textContent = story.ui.controls;
    document.getElementById('hud-log')!.textContent = story.ui.logShortcut;
    document.getElementById('hud-menu')!.textContent = story.ui.menuShortcut;
    document.getElementById('hud-log')!.addEventListener('click', () => this.openLog());
    document.getElementById('hud-menu')!.addEventListener('click', () => this.openMenu());
    window.addEventListener('keydown', event => this.keyDown(event));
    window.addEventListener('keyup', event => this.scene.keys.delete(this.normalize(event.key)));
    window.addEventListener('blur', () => this.scene.keys.clear());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    window.setTimeout(() => {
      if (!this.renderReady) this.status.textContent = story.ui.slow;
    }, 15000);
  }
  get state() { return this.session.state; }
  private normalize(key: string): string { return key.length === 1 ? key.toLowerCase() : key; }
  private resize(): void {
    const app = document.getElementById('app')!;
    const available = Math.min(innerWidth / 960, innerHeight / 540);
    app.style.setProperty('--scale', String(available >= 1 ? Math.floor(available) : available));
    document.getElementById('small-window')!.textContent = story.ui.small;
    document.getElementById('small-window')!.hidden = innerWidth >= 960 && innerHeight >= 540;
  }
  private keyDown(event: KeyboardEvent): void {
    if ((event.target instanceof HTMLInputElement && !['range', 'checkbox'].includes(event.target.type)) || event.target instanceof HTMLTextAreaElement
      || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
    const key = this.normalize(event.key);
    const movement = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'];
    if (movement.includes(key)) {
      event.preventDefault();
      if (this.view === 'world') this.scene.keys.add(key);
    }
    if (event.repeat) return;
    if (this.view === 'entry') {
      if (key === 'Enter' && this.renderReady) {
        event.preventDefault();
        this.entered = true;
        this.audio.unlock();
        void requestFullscreen(document.documentElement);
        this.showTitle();
      }
      return;
    }
    if (['j', 'c', 'Enter', 'z', 'x', 'Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) event.preventDefault();
    if (['world', 'puzzle'].includes(this.view) && key === 'j') { this.openLog(); return; }
    if (['world', 'puzzle'].includes(this.view) && key === 'c') { this.openMenu(); return; }
    if (this.view === 'world' && isConfirm(key)) { if (this.target) this.interact(this.target.id); return; }
    this.screen?.key(key);
  }
  private activate(screen: Screen): void {
    if (this.typeTimer !== undefined) clearInterval(this.typeTimer);
    this.typeTimer = undefined;
    this.screen = screen;
    this.view = screen.view;
    document.getElementById('app')!.dataset.view = screen.view;
    this.scene.keys.clear();
    this.panel.hidden = screen.view !== 'title' && screen.view !== 'entry';
    this.hud.hidden = ['title', 'entry'].includes(screen.view);
    document.getElementById('hud-controls')!.textContent = screen.view === 'dialogue' ? story.ui.next
      : screen.view === 'world' ? story.ui.controls : story.ui.back;
    this.root.replaceChildren();
    screen.render();
  }
  world(): void {
    this.activate({ view: 'world', render: () => {}, key: () => {} });
  }
  play(): void {
    const isNew = !this.state.evidence.includes('arrival-intro') && this.state.phase === 'arrival';
    this.session.save();
    const stable = ['stable', 'registration', 'reunion'].includes(this.state.phase);
    this.scene.drawWorld(stable);
    this.world();
    if (this.resumeHandler?.()) return;
    if (isNew) this.dialogue(story.dialogue.arrival as Line[], () => { this.observe('arrival-intro'); this.world(); }, true);
  }
  showTitle(message?: string): void {
    this.activate({
      view: 'title',
      render: () => {
        this.actions.replaceChildren();
        this.status.textContent = message ?? (this.session.blocked ? ui.app.invalid : ui.app.ready);
        const items: MenuItem[] = [];
        if (!this.session.blocked) items.push({
          label: this.session.loadStatus === 'ok' ? ui.app.continue : ui.app.start,
          action: () => this.play(),
        });
        if (this.session.blocked || this.session.loadStatus === 'ok') items.push({ label: ui.app.restart, action: () => this.restartDialog() });
        items.push({ label: story.ui.settings, action: () => this.openSettings(() => this.showTitle()) });
        if (this.titleProvider) items.push(...this.titleProvider());
        for (const item of items) this.actionButton(item.label, item.action, this.actions);
        (this.actions.firstElementChild as HTMLElement)?.focus();
      },
      key: key => {
        const buttons = [...this.actions.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (key === 'ArrowLeft' || key === 'ArrowRight') buttons[(index + (key === 'ArrowLeft' ? buttons.length - 1 : 1)) % buttons.length]?.focus();
        if (isConfirm(key)) (document.activeElement as HTMLButtonElement)?.click();
      },
    });
  }
  private restartDialog(): void {
    this.choice(ui.app.restartQuestion, [
      { label: ui.app.cancel, action: () => this.showTitle() },
      { label: ui.app.confirm, action: () => { this.session.restart(true); this.play(); } },
    ], () => this.showTitle());
  }
  actionButton(label: string, action: () => void, parent: HTMLElement): HTMLButtonElement {
    const button = node('button', label);
    button.addEventListener('click', () => { this.audio.unlock(); action(); });
    parent.append(button);
    return button;
  }
  choice(title: string, items: MenuItem[], back: () => void, horizontal = true, view: View = 'menu'): void {
    let focus = 0;
    const screen: Screen = {
      view,
      render: () => {
        const window = node('section', undefined, 'window');
        window.append(node('h2', title));
        const list = node('div', undefined, horizontal ? 'choices' : 'menu-list');
        items.forEach((item, index) => {
          const button = this.actionButton(item.label, item.action, list);
          button.dataset.focus = String(focus === index);
          button.addEventListener('focus', () => { focus = index; });
        });
        window.append(list, node('small', story.ui.back));
        this.root.append(window);
        (list.children[focus] as HTMLElement)?.focus();
      },
      key: key => {
        if (isBack(key)) { back(); return; }
        const previous = horizontal ? 'ArrowLeft' : 'ArrowUp';
        const next = horizontal ? 'ArrowRight' : 'ArrowDown';
        if ([previous, next].includes(key)) {
          focus = (focus + (key === previous ? items.length - 1 : 1)) % items.length;
          this.activate(screen);
        } else if (isConfirm(key)) items[focus]?.action();
      },
    };
    this.activate(screen);
  }
  dialogue(lines: Line[], done: (completed?: boolean) => void = () => this.world(), necessary = false): void {
    let index = -1;
    let complete = true;
    let reveal = () => {};
    const history = node('div', undefined, 'chat-history');
    const shell = node('section', undefined, 'chat-shell');
    const controls = node('small', story.ui.next, 'chat-controls');
    shell.append(history, controls);
    const advance = () => {
      if (!complete) return;
      index++;
      if (index >= lines.length) { done(true); return; }
      const line = lines[index];
      const speaker = ui.speakers[line.speaker];
      const message = node('div', undefined, 'message');
      const avatar = node('div', speaker.name.slice(0, 1), `avatar avatar-${line.speaker}`);
      avatar.setAttribute('aria-hidden', 'true');
      const bubble = node('div', undefined, 'bubble');
      bubble.append(node('strong', speaker.name));
      const text = node('p');
      text.style.color = line.color ?? speaker.color;
      bubble.append(text);
      message.append(avatar, bubble);
      history.append(message);
      const segments = line.spans ?? [{ text: line.text, color: line.color }];
      const total = segments.reduce((sum, part) => sum + Array.from(part.text).length, 0);
      let count = 0;
      complete = false;
      const paint = () => {
        text.replaceChildren();
        let remaining = count;
        for (const part of segments) {
          const span = node('span', Array.from(part.text).slice(0, Math.max(0, remaining)).join(''));
          if (part.color) span.style.color = part.color;
          text.append(span);
          remaining -= Array.from(part.text).length;
        }
        history.scrollTop = history.scrollHeight;
      };
      reveal = () => {
        clearInterval(this.typeTimer);
        this.typeTimer = undefined;
        count = total;
        complete = true;
        paint();
      };
      this.typeTimer = window.setInterval(() => {
        count++;
        const character = Array.from(segments.map(part => part.text).join(''))[count - 1] ?? '';
        this.audio.text(line.speaker, character);
        paint();
        if (count >= total) {
          complete = true;
          clearInterval(this.typeTimer);
          this.typeTimer = undefined;
        }
      }, 1000 / 30);
    };
    const screen: Screen = {
      view: 'dialogue',
      render: () => { this.root.append(shell); advance(); },
      key: key => {
        if (isBack(key)) { if (!complete) reveal(); else if (!necessary) done(false); }
        else if (isConfirm(key) && complete) advance();
      },
    };
    this.activate(screen);
  }
  observe(evidence: Evidence): void {
    if (!this.state.evidence.includes(evidence)) {
      this.state.evidence.push(evidence);
      this.session.save();
    }
  }
  log(id: string): void {
    if (!addLog(this.state, id)) return;
    this.session.save();
    const toast = document.getElementById('toast')!;
    toast.textContent = story.ui.updated;
    toast.hidden = false;
    this.audio.tone(880, 0.1);
    if (this.toastTimer !== undefined) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2000);
  }
  openLog(): void {
    if (!['world', 'puzzle'].includes(this.view) || !this.screen) return;
    const previous = this.screen;
    this.activate({
      view: 'log',
      render: () => {
        const window = node('section', undefined, 'window');
        window.append(node('h2', story.ui.log));
        const list = node('div', undefined, 'log-list');
        if (!this.state.log.length) list.append(node('p', story.ui.emptyLog));
        const logs: Record<string, string> = { ...story.logs, ...this.extraLogs };
        for (const id of this.state.log) list.append(node('p', logs[id] ?? id));
        window.append(list, node('small', story.ui.back));
        this.root.append(window);
      },
      key: key => { if (isBack(key)) this.activate(previous); },
    });
  }
  hintStage(): HintStage {
    return this.state.phase === 'branch' ? ((this.state.branch === 'symbols' && !this.state.puzzles.mappingDone)
      || (this.state.branch === 'objects' && !this.state.phones.second) ? 'mapping' : 'ordering')
      : this.state.phase === 'entrance' ? 'calibration' : 'experiment';
  }
  openMenu(): void {
    if (!['world', 'puzzle'].includes(this.view) || !this.screen) return;
    const previous = this.screen;
    const restore = () => this.activate(previous);
    const menu = () => {
      const items: MenuItem[] = [];
      if (this.state.evidence.includes('met-karo')) {
        if (this.menuProvider) items.push(...this.menuProvider(menu));
        for (const id of ['greet', 'patterns', 'flirt'] as const) items.push({
          label: story.ui[id], action: () => this.dialogue(story.dialogue[id] as Line[], menu),
        });
      }
      if (this.state.phase === 'branch' || this.state.phase === 'maintenance' || this.state.phase === 'entrance') {
        const stage = this.hintStage();
        items.push({
          label: story.ui.think[Math.min(2, this.state.hints[stage])],
          action: () => {
            const level = nextHint(this.state, stage); this.session.save();
            this.dialogue(this.hintProvider?.(stage, level) ?? [{ speaker: 'pruto', text: story.ui.modulePending }], menu);
          },
        });
      }
      items.push(
        { label: story.ui.settings, action: () => this.openSettings(menu) },
        { label: ui.app.back, action: () => { const saved = this.session.save(); this.showTitle(saved ? ui.app.saved : undefined); } },
      );
      this.choice(story.ui.menu, items, restore, false);
    };
    menu();
  }
  puzzle(title: string, render: (container: HTMLElement) => void, key: (key: string) => void): () => void {
    const screen: Screen = {
      view: 'puzzle',
      render: () => {
        const window = node('section', undefined, 'window');
        window.append(node('h2', title));
        render(window);
        window.append(node('small', story.ui.back));
        this.root.append(window);
      },
      key,
    };
    const restore = () => this.activate(screen);
    restore();
    return restore;
  }
  private openSettings(back: () => void): void {
    let focus = 0;
    const persist = () => { if (!saveSettings(this.storage, this.settings)) {
      const warning = document.getElementById('save-warning')!;
      warning.textContent = ui.app.saveFailure; warning.hidden = false;
    } };
    const screen: Screen = {
      view: 'settings',
      render: () => {
        const window = node('section', undefined, 'window');
        window.append(node('h2', story.ui.settings));
        ['bgm', 'sfx'].forEach((key, index) => {
          const id = key as 'bgm' | 'sfx';
          const label = node('label', `${story.ui[id]} ${this.settings[id]}%`, 'volume-row');
          const input = node('input');
          input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '10'; input.value = String(this.settings[id]);
          input.setAttribute('aria-label', story.ui[id]);
          input.addEventListener('focus', () => { focus = index; });
          input.addEventListener('input', () => {
            this.settings[id] = Number(input.value); persist();
            label.firstChild!.textContent = `${story.ui[id]} ${this.settings[id]}%`;
          });
          label.append(input); window.append(label);
        });
        const mute = this.actionButton(this.settings.muted ? story.ui.muted : story.ui.mute, () => {
          this.settings.muted = !this.settings.muted; persist(); this.activate(screen);
        }, window);
        mute.addEventListener('focus', () => { focus = 2; });
        window.append(node('small', story.ui.back));
        this.root.append(window);
        (window.querySelectorAll<HTMLElement>('input,button')[focus])?.focus();
      },
      key: key => {
        if (isBack(key)) { back(); return; }
        if (['ArrowUp', 'ArrowDown'].includes(key)) { focus = (focus + (key === 'ArrowUp' ? 2 : 1)) % 3; this.activate(screen); }
        if (focus < 2 && ['ArrowLeft', 'ArrowRight'].includes(key)) {
          const id = focus === 0 ? 'bgm' : 'sfx';
          this.settings[id] = Phaser.Math.Clamp(this.settings[id] + (key === 'ArrowRight' ? 10 : -10), 0, 100);
          persist(); this.activate(screen);
        }
        if (focus === 2 && isConfirm(key)) { this.settings.muted = !this.settings.muted; persist(); this.activate(screen); }
      },
    };
    this.activate(screen);
  }
  transition(done: () => void): void {
    this.activate({
      view: 'dialogue',
      render: () => {
        const fade = node('div', undefined, 'fade');
        this.root.append(fade);
        window.setTimeout(done, 650);
      },
      key: () => {},
    });
  }
  interact(id: string): void {
    if (this.state.phase === 'revisit' && ['p01', 'merin', 'cleaner'].includes(id) && this.collectionHandler) {
      this.collectionHandler(id); return;
    }
    if (this.puzzleHandler && (['symbol-terminal', 'object-terminal', 'cleaner', 'register', 'rest', 'return', 'art', 'karo-stable'].includes(id) || id.startsWith('base-'))) {
      this.puzzleHandler(id); return;
    }
    if (id === 'karo') {
      if (this.state.branch) { this.dialogue(story.dialogue.greet as Line[]); return; }
      if (!canDivide(this.state)) {
        const needed = this.state.evidence.includes('p01') ? 'need-note' : 'need-p01';
        this.dialogue(story.dialogue[needed] as Line[]); return;
      }
      this.dialogue(story.dialogue.gate as Line[], () => this.choice(story.ui.branchQuestion, [
        ...(['symbols', 'objects'] as const).map(branch => ({
          label: branch === 'symbols' ? story.ui.chooseSymbols : story.ui.chooseObjects,
          action: () => {
            this.state.branch = branch;
            this.state.phase = 'branch';
            this.session.save();
            this.scene.resumeAtSafePoint();
            this.dialogue([{ speaker: 'pruto', text: story.ui.roomHint }], () => this.world(), true);
          },
        })),
        { label: story.ui.cancel, action: () => this.world() },
      ], () => this.world()), true);
      return;
    }
    const dialogues = story.dialogue as Record<string, Line[]>;
    if (dialogues[id]) {
      this.dialogue(dialogues[id], completed => {
        if (completed && ['p01', 'old-note', 'range', 'diagnosis'].includes(id)) {
          this.observe(id as Evidence);
          this.log(id);
        }
        this.world();
      });
    } else this.dialogue([{ speaker: 'pruto', text: story.ui.modulePending }]);
  }
}
