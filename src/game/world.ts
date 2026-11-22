import Phaser from 'phaser';
import { FRAMES } from './frame-catalog.ts';
import ui from '../content/text/ui.json' with { type: 'json' };
import { facingOf, moveVector, nearest, type Facing } from '../core/world-geometry.ts';
import type { GameState } from '../core/state.ts';
import { getRoom, safeRoom, blocked, doorLock, exitAt, objectVisible, interactionTargets, type StationRoom, type WorldObject } from './station-map.ts';
import { drawRoom, drawProp, objectLabel } from './station-renderer.ts';
import { loadCharacters, registerCharacters, createCharacter, animateCharacter } from './characters.ts';
import { KaroMotion, type KaroPresence } from '../core/karo-motion.ts';
import type { Branch } from '../core/state.ts';

export type { WorldObject } from './station-map.ts';
export interface WorldHost {
  state: () => GameState;
  active: () => boolean;
  ready: () => void;
  target: (object?: WorldObject) => void;
  meetKaro: () => void;
  failed: () => void;
  roomChanged?: (id: string) => void;
  exitPublic?: () => boolean;
}
export class StationScene extends Phaser.Scene {
  keys = new Set<string>();
  private host: WorldHost;
  private player?: Phaser.GameObjects.Sprite;
  private shadow?: Phaser.GameObjects.Ellipse;
  private highlight?: Phaser.GameObjects.Rectangle;
  private room: StationRoom = getRoom('arrival');
  private objectImages = new Map<string, Phaser.GameObjects.Container>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private gates: { image: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
  private started = false;
  private facing: Facing = 'down';
  private lastTarget = '';
  private failure = false;
  private lateOutline?: Phaser.GameObjects.Rectangle;
  private lateProp?: Phaser.GameObjects.Container;
  private repaired?: Phaser.GameObjects.Text;
  private changing = false;
  private karoMotion = new KaroMotion();
  private karo?: Phaser.GameObjects.Sprite;
  private karoShadow?: Phaser.GameObjects.Ellipse;
  private karoLabel?: Phaser.GameObjects.Text;
  private karoPresence?: KaroPresence;
  get changingRoom(): boolean { return this.changing; }
  karoIsHere(): boolean { return this.karoPresence?.room === this.room.id && !this.karoPresence.moving; }
  startKaroDeparture(branch: Branch): void { this.karoMotion.depart(branch); }
  showStableKaro(): void { this.startKaroFollow(this.facing); }
  constructor(host: WorldHost) { super('station'); this.host = host; }
  preload(): void {
    this.failure = false;
    this.load.image('steel-objects', '/assets/tilesets/steel-soldier/floor-objects.png');
    this.load.image('steel-walls', '/assets/tilesets/steel-soldier/walls-roofs.png');
    this.load.image('garden-furniture', '/assets/tilesets/sierrassets/garden-furniture.png');
    loadCharacters(this);
    this.load.on('loaderror', () => { this.failure = true; this.host.failed(); });
  }
  create(): void {
    if (this.failure) return;
    for (const [name, frame] of Object.entries(FRAMES)) {
      this.textures.get(frame.texture).add(name, 0, frame.x, frame.y, frame.w, frame.h);
    }
    registerCharacters(this);
    this.started = true;
    this.drawWorld(false);
    this.host.ready();
  }
  drawWorld(stable: boolean): void {
    if (!this.started) return;
    this.karoMotion.reset(this.host.state());
    const app = document.getElementById('app');
    if (app) app.dataset.roomTransition = 'idle';
    this.enterRoom(safeRoom(this.host.state(), stable));
  }
  protected enterRoom(id: string, entry?: string, from?: string, preserveMovement = false): void {
    if (id === 'junction' && from === this.host.state().branch) this.karoMotion.returnFromPartner(this.host.state());
    this.room = getRoom(id);
    this.children.removeAll(true);
    this.objectImages.clear(); this.labels.clear(); this.gates = [];
    this.lastTarget = ''; this.host.target();
    if (!preserveMovement) this.keys.clear();
    this.lateOutline = undefined; this.lateProp = undefined;
    drawRoom(this, this.room);
    for (const prop of this.room.decorations) {
      const image = drawProp(this, prop);
      if (prop.lateAnomaly) {
        this.lateProp = image;
        const frame = FRAMES[prop.frame];
        this.lateOutline = this.add.rectangle(prop.x, prop.y - frame.h, frame.w * 2, frame.h * 2)
          .setStrokeStyle(2, 0x8ac9d2).setFillStyle(0, 0).setDepth(prop.y).setVisible(false);
      }
    }
    for (const object of this.room.objects) {
      if (['karo', 'karo-stable'].includes(object.id)) continue;
      this.objectImages.set(object.id, drawProp(this, object));
      this.labels.set(object.id, objectLabel(this, object));
    }
    for (const object of this.room.inspections) this.labels.set(object.id, objectLabel(this, object));
    for (const door of this.room.doors) {
      const x = door.side === 'west' ? this.room.room.x - 16 : this.room.room.x + this.room.room.w + 16;
      this.gates.push({
        image: this.add.rectangle(x, door.y + 32, 6, 64, 0xf1ad8e).setDepth(900),
        label: this.add.text(x, door.y + 66, '', {
          fontFamily: 'OrbitPixel', fontSize: '10px', color: '#f1cfaa', backgroundColor: '#162432',
        }).setOrigin(0.5, 0).setDepth(1001),
      });
    }
    this.repaired = this.add.text(480, 474, ui.station.repaired, {
      fontFamily: 'OrbitPixel', fontSize: '10px', color: '#b1e4cf',
    }).setOrigin(0.5).setDepth(1000);
    let { x, y } = this.room.spawn;
    if (entry) {
      const door = this.room.doors.find(item => item.side === entry && (!from || item.to === from));
      if (door) {
        x = entry === 'west' ? this.room.room.x + 40 : this.room.room.x + this.room.room.w - 40;
        y = door.y + 32;
      }
    }
    this.shadow = this.add.ellipse(x, y + 2, 24, 8, 0x080d17, 0.5).setDepth(y - 1);
    this.player = createCharacter(this, 'pruto', x, y);
    this.karoMotion.leaveFollow();
    const state = this.host.state();
    if (state.registered && (state.phase === 'stable' || state.phase === 'revisit')) {
      this.startKaroFollow(entry === 'west' ? 'right' : entry === 'east' ? 'left' : 'down');
    }
    this.karo = createCharacter(this, 'karo', 0, 0).setVisible(false);
    this.karoShadow = this.add.ellipse(0, 0, 20, 6, 0x080d17, 0.45).setVisible(false);
    this.karoLabel = this.add.text(0, 0, '', {
      fontFamily: 'OrbitPixel', fontSize: '10px', color: '#d9e7e1', backgroundColor: '#0d2534',
    }).setOrigin(0.5, 0).setDepth(1000).setVisible(false);
    this.highlight = this.add.rectangle(0, 0, 72, 28).setStrokeStyle(2, 0xffffff)
      .setFillStyle(0, 0).setDepth(1100).setVisible(false);
    this.cameras.main.stopFollow();
    this.cameras.main.setBounds(0, 0, 960, 540).centerOn(480, 270);
    this.host.roomChanged?.(id);
  }
  private startKaroFollow(facing: Facing): void {
    if (!this.player) return;
    const state = this.host.state();
    this.karoMotion.followFrom(this.room.id, this.player, facing, (x, y) =>
      blocked(this.room, x, y, state, ['karo', 'karo-stable']));
  }
  private changeRoom(id: string, entry?: string): void {
    if (this.changing) return;
    this.changing = true;
    const from = this.room.id;
    const app = document.getElementById('app');
    if (app) app.dataset.roomTransition = 'out';
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.enterRoom(id, entry, from, true);
      if (app) app.dataset.roomTransition = 'in';
      this.cameras.main.once('camerafadeincomplete', () => {
        this.changing = false;
        if (app) app.dataset.roomTransition = 'idle';
      });
      this.cameras.main.fadeIn(500, 0, 0, 0);
    });
    this.cameras.main.fadeOut(500, 0, 0, 0);
  }
  private karoTarget(): WorldObject | undefined {
    if (!this.karoIsHere() || !this.karoPresence) return;
    if (this.karoMotion.following && this.room.id !== 'stable') return;
    const { x, y } = this.karoPresence;
    const id = this.room.id === 'stable' ? 'karo-stable' : 'karo';
    const original = getRoom(id === 'karo-stable' ? 'stable' : 'junction').objects.find(object => object.id === id)!;
    return {
      ...original, room: this.room.id, x, y,
      footprint: { x: x - 12, y: y - 12, w: 24, h: 12 },
    };
  }
  private blockedAt(x: number, y: number): boolean {
    const karo = this.karoTarget();
    // 玩家可穿过行动中的Karo；若恰好在停点相遇，先允许走离，不能在停下那帧困住玩家。
    const solid = this.karoPresence && this.karoMotion.blocksPlayer(this.karoPresence, this.player);
    return blocked(this.room, x, y, this.host.state(), ['karo', 'karo-stable'], karo && solid ? [karo] : []);
  }
  update(_time: number, delta: number): void {
    if (!this.player) return;
    const state = this.host.state();
    if (this.host.active() && !this.changing) this.karoMotion.advance(Math.min(delta, 50) / 1000);
    this.karoPresence = this.karoMotion.presence(state);
    for (const [index, door] of this.room.doors.entries()) {
      const lock = doorLock(this.room, door, state);
      this.gates[index].image.setVisible(Boolean(lock));
      this.gates[index].label.setText(lock ?? '').setVisible(Boolean(lock));
    }
    for (const object of this.room.objects) this.objectImages.get(object.id)?.setVisible(objectVisible(object, state));
    const late = !state.entranceFound && state.experiment.discovered.length === 4 && state.evidence.includes('storage');
    this.lateProp?.setVisible(!late);
    this.lateOutline?.setVisible(late);
    this.repaired?.setVisible(state.phase === 'revisit');
    const active = this.host.active() && !this.changing;
    if (!this.host.active()) this.keys.clear();
    const movement = active ? moveVector(this.keys, Math.min(delta, 50) / 1000) : { x: 0, y: 0 };
    if (!this.blockedAt(this.player.x + movement.x, this.player.y)) this.player.x += movement.x;
    if (!this.blockedAt(this.player.x, this.player.y + movement.y)) this.player.y += movement.y;
    this.karoPresence = this.karoMotion.trackLeader(this.player) ?? this.karoPresence;
    const here = this.karoPresence?.room === this.room.id;
    this.karo?.setVisible(here); this.karoShadow?.setVisible(here);
    if (here && this.karoPresence && this.karo) {
      const { x, y, facing, moving } = this.karoPresence;
      this.karo.setPosition(x, y).setDepth(y);
      this.karoShadow?.setPosition(x, y + 2).setDepth(y - 1);
      animateCharacter(this.karo, 'karo', facing, moving);
    }
    if (movement.x || movement.y) {
      this.facing = facingOf(movement.x, movement.y);
    }
    animateCharacter(this.player, 'pruto', this.facing, Boolean(movement.x || movement.y));
    this.player.setDepth(this.player.y);
    this.shadow?.setPosition(this.player.x, this.player.y + 2).setDepth(this.player.y - 1);
    const karo = this.karoTarget();
    const targets = interactionTargets(this.room, state).filter(item => !['karo', 'karo-stable'].includes(item.id));
    if (karo && !this.karoMotion.following) targets.push(karo);
    const target = active ? nearest(this.player.x, this.player.y, targets)
      ?? (karo && this.karoMotion.following ? nearest(this.player.x, this.player.y, [karo]) : undefined) : undefined;
    this.karoLabel?.setVisible(target?.id === karo?.id && Boolean(karo));
    if (karo) this.karoLabel?.setText(karo.label).setPosition(karo.x, karo.y + 6);
    this.highlight?.setVisible(Boolean(target));
    if (target) {
      const frame = FRAMES[target.frame];
      if (target.id.startsWith('inspect-gate-')) this.highlight?.setSize(16, 64).setPosition(target.x, target.y);
      else if (frame && target.render !== false) {
        const anchor = frame.anchor ?? { x: frame.w / 2, y: frame.h };
        this.highlight?.setSize(frame.w * 2 + 8, frame.h * 2 + 8).setPosition(
          target.x + (frame.w / 2 - anchor.x) * 2,
          target.y + (target.offsetY ?? 0) + (frame.h / 2 - anchor.y) * 2);
      } else this.highlight?.setSize(32, 32).setPosition(target.x, target.y - 8);
    }
    for (const [id, label] of this.labels) label.setVisible(id === target?.id);
    if ((target?.id ?? '') !== this.lastTarget) {
      this.lastTarget = target?.id ?? '';
      this.host.target(target);
    }
    const app = document.getElementById('app');
    if (app) {
      app.dataset.room = this.room.id;
      app.dataset.playerX = this.player.x.toFixed(2);
      app.dataset.playerY = this.player.y.toFixed(2);
      app.dataset.target = target?.id ?? '';
      app.dataset.facing = this.facing;
      app.dataset.characterTexture = this.player.texture.key;
      app.dataset.characterFrame = String(this.player.frame.name);
      app.dataset.characterFlipX = String(this.player.flipX);
      app.dataset.karoRoom = this.karoPresence?.room ?? '';
      app.dataset.karoX = String(this.karoPresence?.x ?? '');
      app.dataset.karoY = String(this.karoPresence?.y ?? '');
      app.dataset.karoMoving = String(this.karoPresence?.moving ?? false);
      app.dataset.karoTexture = here ? this.karo?.texture.key ?? '' : '';
    }
    if (!active) return;
    if (this.room.id === 'junction' && !state.evidence.includes('met-karo')) {
      this.host.meetKaro(); return;
    }
    const exit = exitAt(this.room, this.player.x, this.player.y);
    if (exit && !doorLock(this.room, exit, state)) {
      if (this.room.id === 'public' && this.host.exitPublic?.()) {
        // 退回走廊内侧；未看完证据时，不让同一次触门每帧重复弹出。
        this.player.x += exit.side === 'west' ? 32 : -32;
        this.keys.clear(); return;
      }
      this.changeRoom(exit.to, exit.entry);
    }
  }
}
