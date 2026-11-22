import Phaser from 'phaser';
import ui from '../content/text/ui.json' with { type: 'json' };
import story from '../content/text/exploration.json';
import inspections from '../content/text/decoration.json' with { type: 'json' };
import { browserStorage, SaveSession, loadSettings, saveSettings, type Settings } from '../core/storage.ts';
import { addLog, canDivide, hasStartedExperiment, nextHint } from '../core/rules.ts';
import { type Evidence, type HintStage } from '../core/state.ts';
import { StationScene, type WorldObject } from './world.ts';
import { Audio } from '../audio/game-audio.ts';
import { musicStage, type Track } from '../audio/audio-policy.ts';
import audioConfig from '../content/assets/audio-playback.json' with { type: 'json' };
import { dialogueSpeaker, type DialogueLine } from '../content/text/line.ts';
import { casualCallIndex, hasNewCasualCall, finishCasualCall, rollGoatCall } from '../core/casual-calls.ts';
import { playWorldEntry, type WorldEntryMode } from '../ui/world-entry.ts';
import { CycleVisit } from './cycle-visit.ts';

const { exploration: explorationUi } = ui;
type View = 'entry' | 'title' | 'boot' | 'world' | 'dialogue' | 'menu' | 'log' | 'settings' | 'puzzle';
interface Screen { view: View; render: () => void; key: (key: string) => void; audioScope?: 'cleaner' }
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
  private resourceFailed = false;
  private toastTimer?: number;
  private typeTimer?: number;
  private stopWorldEntry?: () => void;
  private bgmToastTimer?: number;
  private explorationStarted = false;
  private pointerButton?: Element;
  private swapping = false;
  private cycle = new CycleVisit(this);
  leaveDesktop?: () => void;
  puzzleHandler?: (id: string) => void;
  collectionHandler?: (id: string) => void;
  menuProvider?: (back: () => void) => MenuItem[];
  titleProvider?: () => MenuItem[];
  hintProvider?: (stage: HintStage, level: number) => readonly DialogueLine[];
  resumeHandler?: () => boolean;
  extraLogs: Record<string, string> = {};
  constructor() {
    for (const id of ['title', 'subtitle', 'stage', 'status'] as const) document.getElementById(id)!.textContent = ui.app[id];
    this.settings = loadSettings(this.storage);
    this.audio = new Audio(() => this.settings, {
      music: track => this.showMusic(track), status: () => this.updateAudioStatus(),
    });
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
        document.getElementById('target')!.textContent = object ? `${explorationUi.interact} ${object.label}` : '';
      },
      meetKaro: () => {
        this.observe('met-karo');
        this.dialogue(story.dialogue['meet-karo'], () => this.world(), true);
      },
      failed: () => {
        this.resourceFailed = true;
        this.renderReady = false;
        this.status.textContent = ui.app.error;
        this.actionButton(explorationUi.retry, () => location.reload(), this.status);
      },
      roomChanged: id => {
        if (id !== 'arrival') this.explorationStarted = true;
        this.syncAudio();
      },
      exitPublic: () => this.cycle.exitPublic(),
    });
    try {
      new Phaser.Game({
        type: Phaser.AUTO, parent: 'game', width: 960, height: 540, backgroundColor: '#080f1b', pixelArt: true,
        // 整个960×540界面由外层CSS统一缩放，Phaser不能再按已变换的父容器二次FIT。
        audio: { noAudio: true }, scale: { mode: Phaser.Scale.NONE, autoCenter: Phaser.Scale.NO_CENTER }, scene: this.scene,
      });
    } catch (error) { this.status.textContent = ui.app.error; console.error(error); }
    document.getElementById('hud-controls')!.textContent = explorationUi.controls;
    document.getElementById('hud-log')!.textContent = explorationUi.logShortcut;
    document.getElementById('hud-menu')!.textContent = explorationUi.menuShortcut;
    document.getElementById('hud-log')!.addEventListener('click', () => this.openLog());
    document.getElementById('hud-menu')!.addEventListener('click', () => this.openMenu());
    window.addEventListener('keydown', event => this.keyDown(event));
    window.addEventListener('keyup', event => this.scene.keys.delete(this.normalize(event.key)));
    window.addEventListener('blur', () => this.scene.keys.clear());
    window.addEventListener('pointermove', event => {
      if (!event.movementX && !event.movementY) return;
      const button = (event.target as HTMLElement).closest?.('button');
      if (button && button !== this.pointerButton) this.audio.event('sfx.ui.focus');
      this.pointerButton = button ?? undefined;
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.syncAudio();
    window.setTimeout(() => {
      if (!this.renderReady && !this.resourceFailed) this.status.textContent = explorationUi.slow;
    }, 15000);
  }
  get state() { return this.session.state; }
  private syncAudio(): void {
    this.audio.setStage(musicStage(this.state, this.explorationStarted));
  }
  private showMusic(track: Track): void {
    const toast = document.getElementById('bgm-toast')!;
    const music = audioConfig.tracks[track];
    toast.textContent = ui.audio.bgmToast.replace('{author}', music.author).replace('{title}', music.title);
    if (this.bgmToastTimer !== undefined) clearTimeout(this.bgmToastTimer);
    toast.hidden = false; toast.classList.remove('leaving');
    toast.style.animation = 'none'; void toast.offsetWidth; toast.style.animation = '';
    this.bgmToastTimer = window.setTimeout(() => {
      toast.classList.add('leaving');
      this.bgmToastTimer = window.setTimeout(() => { toast.hidden = true; }, 180);
    }, 3180);
    this.updateAudioStatus();
  }
  private updateAudioStatus(): void {
    const app = document.getElementById('app')!;
    const { current, musicStarts, ducked } = this.audio.playback;
    app.dataset.audioBgm = current;
    app.dataset.audioStatus = this.audio.status;
    app.dataset.audioStarts = String(musicStarts);
    app.dataset.audioDucked = String(ducked);
    const status = document.getElementById('audio-status');
    if (status) status.hidden = !this.audio.hasFailures;
    const retry = document.getElementById('audio-retry');
    if (retry) retry.hidden = !this.audio.hasFailures;
  }
  private normalize(key: string): string { return key.length === 1 ? key.toLowerCase() : key; }
  private resize(): void {
    const app = document.getElementById('app')!;
    const available = Math.min(innerWidth / 960, innerHeight / 540);
    app.style.setProperty('--scale', String(available));
    document.getElementById('small-window')!.textContent = explorationUi.small;
    document.getElementById('small-window')!.hidden = innerWidth >= 960 && innerHeight >= 540;
  }
  private keyDown(event: KeyboardEvent): void {
    if (this.swapping) { event.preventDefault(); return; }
    if ((event.target instanceof HTMLInputElement && !['range', 'checkbox'].includes(event.target.type)) || event.target instanceof HTMLTextAreaElement
      || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
    const key = this.normalize(event.key);
    if (this.view === 'boot') {
      if (['j', 'c', 'Enter', 'z', 'x', 'Shift', 'Tab', ' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(key)) event.preventDefault();
      return;
    }
    const movement = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'];
    if (movement.includes(key)) {
      event.preventDefault();
      if (this.view === 'world') this.scene.keys.add(key);
    }
    if (this.scene.changingRoom) {
      if (['j', 'c', 'Enter', 'z', 'x', 'Shift'].includes(key)) event.preventDefault();
      return;
    }
    if (this.view === 'log' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(key)) {
      event.preventDefault(); this.screen?.key(key); return;
    }
    if (event.repeat) return;
    if (this.view === 'entry') {
      if (key === 'Enter' && this.renderReady) {
        event.preventDefault();
        this.entered = true;
        this.audio.unlock();
        this.diamondSwap(() => this.showTitle());
      }
      return;
    }
    if (['j', 'c', 'Enter', 'z', 'x', 'Shift', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)
      || (key === 'Escape' && this.view === 'dialogue')) event.preventDefault();
    if (['world', 'puzzle'].includes(this.view) && key === 'j') { this.openLog(); return; }
    if (['world', 'puzzle'].includes(this.view) && key === 'c') { this.openMenu(); return; }
    if (this.view === 'world' && isConfirm(key)) {
      if (this.target) { this.audio.event('sfx.ui.confirm'); this.interact(this.target.id); } return;
    }
    if (this.view !== 'dialogue' && isConfirm(key)) this.audio.event('sfx.ui.confirm');
    if (this.view !== 'dialogue' && isBack(key)) this.audio.event('sfx.ui.back');
    this.screen?.key(key);
  }
  private activate(screen: Screen): void {
    this.stopWorldEntry?.();
    this.stopWorldEntry = undefined;
    if (this.typeTimer !== undefined) clearInterval(this.typeTimer);
    this.typeTimer = undefined;
    this.screen = screen;
    this.view = screen.view;
    if (screen.view !== 'dialogue' && !(screen.view === 'puzzle' && screen.audioScope === 'cleaner')) this.audio.stopMachine();
    this.audio.setDialogue(screen.view === 'dialogue');
    this.syncAudio();
    document.getElementById('app')!.dataset.view = screen.view;
    this.scene.keys.clear();
    this.panel.hidden = screen.view !== 'title' && screen.view !== 'entry';
    this.panel.inert = false;
    this.hud.hidden = ['title', 'entry', 'boot'].includes(screen.view);
    const controls = document.getElementById('hud-controls')!;
    controls.hidden = screen.view === 'dialogue';
    controls.textContent = screen.view === 'world' ? explorationUi.controls : explorationUi.back;
    this.root.replaceChildren();
    screen.render();
  }
  world(): void {
    // 普通继续和安定区快捷入口均补齐Nep原话；复用原去重/保存失败提示，不写新存档字段。
    if (this.state.phase !== 'cycle') this.log('a-note');
    this.activate({ view: 'world', render: () => {}, key: () => {} });
  }
  play(): void {
    const isNew = !this.state.evidence.includes('arrival-intro') && this.state.phase === 'arrival';
    this.session.save();
    const stable = ['stable-intro', 'stable', 'registration', 'reunion'].includes(this.state.phase);
    this.scene.drawWorld(stable);
    if (isNew) {
      this.boot('init', () => {
        this.log('a-note');
        this.dialogue(story.dialogue.arrival, () => {
          this.observe('arrival-intro'); this.world();
        }, true);
      });
      return;
    }
    this.world();
    if (this.resumeHandler?.()) return;
  }
  showTitle(message?: string): void {
    this.cycle.prepareTitle();
    this.activate({
      view: 'title',
      render: () => {
        this.actions.replaceChildren();
        this.status.textContent = message ?? (this.session.blocked ? ui.app.invalid : ui.app.ready);
        const items: MenuItem[] = [];
        if (!this.session.blocked) items.push({
          label: this.session.loadStatus === 'ok' ? ui.app.continue : ui.app.start,
          action: () => {
            this.leaveDesktop?.();
            if (!this.cycle.enterFromTitle()) this.diamondSwap(() => this.play());
          },
        });
        if (this.session.blocked || this.session.loadStatus === 'ok') items.push({ label: ui.app.restart, action: () => this.restartDialog() });
        items.push({ label: explorationUi.settings, action: () => this.openSettings(() => this.showTitle()) });
        if (this.titleProvider) items.push(...this.titleProvider());
        for (const item of items) this.actionButton(item.label, item.action, this.actions);
        (this.actions.firstElementChild as HTMLElement)?.focus();
      },
      key: key => {
        const buttons = [...this.actions.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          this.audio.event('sfx.ui.focus');
          buttons[(index + (key === 'ArrowLeft' ? buttons.length - 1 : 1)) % buttons.length]?.focus();
        }
        if (isConfirm(key)) (document.activeElement as HTMLButtonElement)?.click();
      },
    });
    this.cycle.title();
  }
  titleDialogue(lines: readonly DialogueLine[], done: () => void): void {
    this.dialogue(lines, done, true);
    this.panel.hidden = false;
    this.panel.inert = true;
    this.hud.hidden = true;
  }
  diamondSwap(done: () => void): void {
    if (this.swapping) return;
    this.swapping = true;
    this.scene.keys.clear();
    const veil = node('div', undefined, 'diamond-swap');
    document.getElementById('app')!.append(veil);
    window.setTimeout(() => { done(); }, 180);
    window.setTimeout(() => { veil.remove(); this.swapping = false; }, 370);
  }
  endCard(text: string, back: string, light = false): void {
    this.activate({ view: 'menu', render: () => {
      this.hud.hidden = true;
      const card = node('section', undefined, 'cycle-end');
      if (light) card.classList.add('cycle-end-light');
      card.append(node('h1', text));
      this.actionButton(back, () => this.showTitle(), card);
      this.root.append(card);
    }, key: key => { if (isBack(key) || isConfirm(key)) this.showTitle(); } });
  }
  private restartDialog(): void {
    this.choice(ui.app.restartQuestion, [
      { label: ui.app.cancel, action: () => this.showTitle() },
      { label: ui.app.confirm, action: () => {
        this.leaveDesktop?.(); this.session.restart(true); this.explorationStarted = false;
        this.audio.setStage('intro', true); this.play();
      } },
    ], () => this.showTitle());
  }
  actionButton(label: string, action: () => void, parent: HTMLElement): HTMLButtonElement {
    const button = node('button', label);
    button.addEventListener('click', () => { this.audio.unlock(); this.audio.event('sfx.ui.confirm'); action(); });
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
        window.append(list, node('small', explorationUi.back));
        this.root.append(window);
        (list.children[focus] as HTMLElement)?.focus();
      },
      key: key => {
        if (isBack(key)) { back(); return; }
        const previous = horizontal ? 'ArrowLeft' : 'ArrowUp';
        const next = horizontal ? 'ArrowRight' : 'ArrowDown';
        if ([previous, next].includes(key)) {
          this.audio.event('sfx.ui.focus');
          focus = (focus + (key === previous ? items.length - 1 : 1)) % items.length;
          this.activate(screen);
        } else if (isConfirm(key)) items[focus]?.action();
      },
    };
    this.activate(screen);
  }
  dialogue(lines: readonly DialogueLine[], done: (completed?: boolean) => void = () => this.world(), necessary = false,
    onLine?: (line: DialogueLine, layer: HTMLElement) => void): void {
    let index = -1;
    let complete = true;
    let reveal = () => {};
    const history = node('div', undefined, 'chat-history');
    const shell = node('section', undefined, 'chat-shell');
    shell.append(history);
    const advance = () => {
      if (!complete) return;
      index++;
      if (index >= lines.length) { done(true); return; }
      const line = lines[index];
      const speaker = dialogueSpeaker(line);
      const message = node('div', undefined, 'message');
      const avatar = node('div', speaker.name.slice(0, 1), `avatar avatar-${line.speaker}`);
      avatar.setAttribute('aria-hidden', 'true');
      if (speaker.portrait) {
        const image = node('img');
        image.alt = '';
        image.addEventListener('load', () => {
          avatar.classList.add('has-portrait'); avatar.replaceChildren(image);
        }, { once: true });
        image.src = speaker.portrait;
      }
      const bubble = node('div', undefined, 'bubble');
      bubble.append(node('strong', speaker.name));
      const text = node('p');
      text.style.color = line.color ?? speaker.color;
      bubble.append(text);
      message.append(avatar, bubble);
      history.append(message);
      onLine?.(line, this.root);
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
        if (isBack(key)) { if (!complete) reveal(); }
        else if (key === 'Escape' && !necessary) done(false);
        else if (isConfirm(key) && complete) advance();
      },
    };
    this.activate(screen);
  }
  phone(lines: readonly DialogueLine[], done: (completed?: boolean) => void, necessary = false,
    onLine?: (line: DialogueLine, layer: HTMLElement) => void): void {
    this.audio.event('sfx.phone.connect');
    this.dialogue(lines, completed => {
      this.audio.event('sfx.phone.disconnect'); done(completed);
    }, necessary, onLine);
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
    toast.textContent = explorationUi.updated;
    toast.hidden = false;
    this.audio.event('sfx.result.basic');
    this.syncAudio();
    if (this.toastTimer !== undefined) clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2000);
  }
  openLog(): void {
    if (!['world', 'puzzle'].includes(this.view) || !this.screen || this.scene.changingRoom) return;
    const previous = this.screen;
    const list = node('div', undefined, 'log-list');
    this.activate({
      view: 'log',
      render: () => {
        const window = node('section', undefined, 'window');
        window.append(node('h2', explorationUi.log));
        if (!this.state.log.length) list.append(node('p', explorationUi.emptyLog));
        const logs: Record<string, string> = { ...story.logs, ...this.extraLogs };
        for (const id of this.state.log) list.append(node('p', logs[id] ?? id));
        window.append(list, node('small', explorationUi.logControls));
        this.root.append(window);
      },
      key: key => {
        if (isBack(key)) { this.activate(previous); return; }
        const line = 30, page = Math.max(line, list.clientHeight - line);
        if (key === 'ArrowUp') list.scrollTop -= line;
        if (key === 'ArrowDown') list.scrollTop += line;
        if (['ArrowLeft', 'PageUp'].includes(key)) list.scrollTop -= page;
        if (['ArrowRight', 'PageDown'].includes(key)) list.scrollTop += page;
      },
    });
  }
  hintStage(): HintStage {
    return this.state.phase === 'branch' ? ((this.state.branch === 'symbols' && !this.state.puzzles.mappingDone)
      || (this.state.branch === 'objects' && !this.state.phones.second) ? 'mapping' : 'ordering')
      : this.state.phase === 'entrance' ? 'calibration' : 'experiment';
  }
  openMenu(): void {
    if (!['world', 'puzzle'].includes(this.view) || !this.screen || this.scene.changingRoom) return;
    const previous = this.screen;
    const restore = () => this.activate(previous);
    const showGoat = rollGoatCall();
    const menu = () => {
      const items: MenuItem[] = [];
      if (this.state.branch && !hasStartedExperiment(this.state)) {
        if (this.menuProvider) items.push(...this.menuProvider(menu));
        for (const id of ['greet', 'patterns', 'flirt'] as const) items.push({
          label: (hasNewCasualCall(this.state, id) ? explorationUi.newCall : '') + explorationUi[id],
          action: () => {
            const episode = story.calls[id].episodes[casualCallIndex(this.state, id)];
            this.phone(episode.lines, completed => {
              if (completed && finishCasualCall(this.state, id)) this.session.save();
              menu();
            });
          },
        });
      }
      if (showGoat) items.push({
        label: explorationUi.goat,
        action: () => this.phone(story.calls.goat.episodes[0].lines, menu),
      });
      if (this.state.phase === 'branch' || this.state.phase === 'maintenance' || this.state.phase === 'entrance') {
        const stage = this.hintStage();
        items.push({
          label: explorationUi.think[Math.min(2, this.state.hints[stage])],
          action: () => {
            const level = nextHint(this.state, stage); this.session.save();
            const lines = this.hintProvider?.(stage, level);
            if (lines) this.dialogue(lines, menu);
          },
        });
      }
      items.push(
        { label: explorationUi.settings, action: () => this.openSettings(menu) },
        { label: ui.app.back, action: () => { const saved = this.session.save(); this.diamondSwap(() => this.showTitle(saved ? ui.app.saved : undefined)); } },
      );
      this.choice(explorationUi.menu, items, restore, false);
    };
    menu();
  }
  puzzle(title: string, render: (container: HTMLElement) => void, key: (key: string) => void, audioScope?: 'cleaner'): () => void {
    const screen: Screen = {
      view: 'puzzle',
      audioScope,
      render: () => {
        const window = node('section', undefined, 'window');
        window.append(node('h2', title));
        render(window);
        window.append(node('small', explorationUi.back));
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
    const persist = () => { this.audio.updateSettings(); if (!saveSettings(this.storage, this.settings)) {
      const warning = document.getElementById('save-warning')!;
      warning.textContent = ui.app.saveFailure; warning.hidden = false;
    } };
    const screen: Screen = {
      view: 'settings',
      render: () => {
        const window = node('section', undefined, 'window');
        window.append(node('h2', explorationUi.settings));
        ['bgm', 'sfx'].forEach((key, index) => {
          const id = key as 'bgm' | 'sfx';
          const label = node('label', `${explorationUi[id]} ${this.settings[id]}%`, 'volume-row');
          const input = node('input');
          input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '10'; input.value = String(this.settings[id]);
          input.setAttribute('aria-label', explorationUi[id]);
          input.addEventListener('focus', () => { focus = index; });
          input.addEventListener('input', () => {
            this.settings[id] = Number(input.value); persist();
            this.audio.event('sfx.ui.confirm');
            label.firstChild!.textContent = `${explorationUi[id]} ${this.settings[id]}%`;
          });
          label.append(input); window.append(label);
        });
        const mute = this.actionButton(this.settings.muted ? explorationUi.muted : explorationUi.mute, () => {
          this.settings.muted = !this.settings.muted; persist(); this.activate(screen);
        }, window);
        mute.addEventListener('focus', () => { focus = 2; });
        const audioStatus = node('p', ui.audio.failed); audioStatus.id = 'audio-status';
        audioStatus.hidden = !this.audio.hasFailures;
        audioStatus.setAttribute('role', 'status'); window.append(audioStatus);
        const retry = this.actionButton(ui.audio.retry, () => {
          this.audio.retry(); focus = 2; mute.focus();
        }, window);
        retry.id = 'audio-retry'; retry.hidden = !this.audio.hasFailures;
        retry.addEventListener('focus', () => { focus = 3; });
        window.append(node('small', explorationUi.back));
        this.root.append(window);
        (window.querySelectorAll<HTMLElement>('input,button:not([hidden])')[focus])?.focus();
      },
      key: key => {
        if (isBack(key)) { back(); return; }
        if (['ArrowUp', 'ArrowDown'].includes(key)) {
          const count = this.audio.hasFailures ? 4 : 3;
          this.audio.event('sfx.ui.focus');
          focus = (focus + (key === 'ArrowUp' ? count - 1 : 1)) % count; this.activate(screen);
        }
        if (focus < 2 && ['ArrowLeft', 'ArrowRight'].includes(key)) {
          const id = focus === 0 ? 'bgm' : 'sfx';
          this.settings[id] = Phaser.Math.Clamp(this.settings[id] + (key === 'ArrowRight' ? 10 : -10), 0, 100);
          persist(); this.activate(screen);
        }
        if (focus === 2 && isConfirm(key)) { this.settings.muted = !this.settings.muted; persist(); this.activate(screen); }
        if (focus === 3 && isConfirm(key)) { this.audio.retry(); focus = 2; this.activate(screen); }
      },
    };
    this.activate(screen);
  }
  whiteTransition(atWhite: () => void, done: () => void): void {
    const halfMs = 250;
    this.activate({
      view: 'boot',
      render: () => {
        const veil = node('div', undefined, 'white-swap');
        veil.dataset.stage = 'in';
        this.root.append(veil);
        const fade = (from: number, to: number) =>
          veil.animate([{ opacity: from }, { opacity: to }], { duration: halfMs, fill: 'forwards' }).finished;
        void fade(0, 1).then(() => {
          if (!veil.isConnected) return;
          atWhite();
          veil.dataset.stage = 'out';
          return fade(1, 0).then(() => { if (veil.isConnected) done(); });
        });
      },
      key: () => {},
    });
  }
  boot(mode: WorldEntryMode, done: () => void, beforeReveal?: () => void): void {
    this.activate({
      view: 'boot',
      render: () => {
        this.stopWorldEntry = playWorldEntry(this.root, mode, warning => this.audio.bootLine(warning), done, beforeReveal);
      },
      key: () => {},
    });
  }
  interact(id: string): void {
    if (this.cycle.interact(id)) return;
    if (this.target?.id === id && this.target.inspectionId) {
      if (this.target.inspectionId === 'junction-bench' && !this.state.registered && this.scene.karoIsHere()) {
        this.dialogue(inspections.dialogue['junction-bench']); return;
      }
      const lines = inspections.lines[this.target.inspectionId as keyof typeof inspections.lines];
      this.dialogue(lines);
      return;
    }
    if (this.state.phase === 'revisit' && ['p01', 'merin', 'cleaner'].includes(id) && this.collectionHandler) {
      this.collectionHandler(id); return;
    }
    if (this.puzzleHandler && (['symbol-terminal', 'object-terminal', 'cleaner', 'register', 'rest', 'art', 'karo-stable'].includes(id) || id.startsWith('base-'))) {
      this.puzzleHandler(id); return;
    }
    if (id === 'karo') {
      if (this.state.branch) {
        const lines = this.state.phase === 'entrance' ? story.dialogue['karo-entrance']
          : this.state.evidence.includes('experiment-intro') ? story.dialogue['karo-experiment']
          : story.dialogue['karo-maintenance'];
        this.dialogue(lines); return;
      }
      if (!canDivide(this.state)) {
        const needed = this.state.evidence.includes('p01') ? 'need-note' : 'need-p01';
        this.dialogue(story.dialogue[needed]); return;
      }
      this.dialogue(story.dialogue.gate, () => this.choice(explorationUi.branchQuestion, [
        ...(['symbols', 'objects'] as const).map(branch => ({
          label: branch === 'symbols' ? explorationUi.chooseSymbols : explorationUi.chooseObjects,
          action: () => {
            this.state.branch = branch;
            this.state.phase = 'branch';
            this.audio.event('sfx.gate.activate');
            this.session.save();
            this.scene.startKaroDeparture(branch);
            this.world();
          },
        })),
        { label: explorationUi.cancel, action: () => this.world() },
      ], () => this.world()), true);
      return;
    }
    const dialogues: Readonly<Partial<Record<string, readonly DialogueLine[]>>> = story.dialogue;
    if (id === 'merin' && this.state.experiment.discovered.length === 4 && this.state.evidence.includes('storage')) {
      this.dialogue(story.dialogue['merin-late']); return;
    }
    if (dialogues[id]) {
      this.dialogue(dialogues[id], completed => {
        if (completed) {
          if (id === 'merin') this.log(id);
          else if (['p01', 'old-note', 'range', 'diagnosis'].includes(id)) {
            this.observe(id as Evidence);
            this.log(id);
          }
        }
        this.world();
      });
    }
  }
}
