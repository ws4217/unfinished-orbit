import Phaser from 'phaser';
import atlas from '../../assets/source/tilesets/reodesuxz/pixel-sci-fi/spritesheet.json';
import map from '../content/maps/legacy-world.json';
import frames from '../content/assets/interior-frames.json';
import layout from '../content/maps/legacy-interior.json';
import assets from '../content/assets/runtime-assets.json';
import { inside, moveVector, nearest, type Rect } from '../core/world-geometry.ts';
import type { GameState } from '../core/state.ts';

const interior = { frames, decorations: layout.decorations };

export type WorldObject = typeof map.objects[number];
export interface WorldHost {
  state: () => GameState;
  active: () => boolean;
  ready: () => void;
  target: (object?: WorldObject) => void;
  meetKaro: () => void;
  failed: () => void;
}
export class StationScene extends Phaser.Scene {
  keys = new Set<string>();
  private host: WorldHost;
  private player?: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private highlight?: Phaser.GameObjects.Rectangle;
  private objects: WorldObject[] = [];
  private objectImages = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle>();
  private floors: Rect[] = [];
  private started = false;
  private stable = false;
  private lastTarget = '';
  private gates: Phaser.GameObjects.Rectangle[] = [];
  constructor(host: WorldHost) { super('station'); this.host = host; }
  preload(): void {
    this.load.image('station', assets.images.station);
    this.load.image('interior-tiles', assets.images['interior-tiles']);
    this.load.image('interior-props', assets.images['interior-props']);
    this.load.on('loaderror', () => this.host.failed());
  }
  create(): void {
    if (this.textures.exists('station')) {
      const texture = this.textures.get('station');
      for (const [name, frame] of Object.entries(atlas.frames)) {
        texture.add(name, 0, frame.x, frame.y, frame.w, frame.h);
      }
    }
    for (const [name, frame] of Object.entries(interior.frames)) {
      if (this.textures.exists(frame.texture)) {
        this.textures.get(frame.texture).add(name, 0, frame.x, frame.y, frame.w, frame.h);
      }
    }
    this.started = true;
    this.drawWorld(false);
    this.host.ready();
  }
  private sprite(x: number, y: number, name: string): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
    if (this.textures.exists('station') && this.textures.get('station').has(name)) {
      return this.add.image(x, y, 'station', name).setScale(2);
    }
    const frame = (interior.frames as Record<string, { texture: string }>)[name];
    if (frame && this.textures.exists(frame.texture)) return this.add.image(x, y, frame.texture, name);
    return this.add.rectangle(x, y, 28, 28, 0x55788c).setStrokeStyle(1, 0xa6b7cc);
  }
  private floor(rect: Rect, tile: string): void {
    for (let x = rect.x; x < rect.x + rect.w; x += 32) {
      for (let y = rect.y; y < rect.y + rect.h; y += 32) {
        const variant = tile.endsWith('_1') && (x / 32 + y / 32) % 5 === 0 ? tile.replace('_1', '_2') : tile;
        this.sprite(x + 16, y + 16, variant).setDepth(-2);
      }
    }
    this.add.rectangle(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w, rect.h)
      .setStrokeStyle(2, 0x55788c).setFillStyle(0, 0).setDepth(-1);
  }
  private walls(): void {
    const placed = new Set<string>();
    const wall = (x: number, y: number, side: boolean) => {
      const key = `${x}:${y}`;
      if (placed.has(key) || this.floors.some(rect => inside(x, y, rect))) return;
      placed.add(key);
      const tile = side ? (Math.floor(y / 32) % 4 === 0 ? 'cyan-wall' : 'white-wall') : 'wall_steel_face';
      this.sprite(x, y, tile).setDepth(-1);
    };
    for (const rect of this.floors) {
      for (let x = rect.x; x < rect.x + rect.w; x += 32) {
        wall(x + 16, rect.y - 16, false);
        wall(x + 16, rect.y + rect.h + 16, false);
      }
      for (let y = rect.y; y < rect.y + rect.h; y += 32) {
        wall(rect.x - 16, y + 16, true);
        wall(rect.x + rect.w + 16, y + 16, true);
      }
    }
  }
  drawWorld(stable: boolean): void {
    if (!this.started) return;
    this.stable = stable;
    this.children.removeAll(true);
    this.objectImages.clear();
    this.gates = [];
    this.lastTarget = '';
    this.host.target();
    if (stable) {
      this.floors = [map.stable.room];
      this.floor(map.stable.room, 'floor_holo_grid');
      this.objects = map.stable.objects;
    } else {
      this.floors = [...map.rooms, ...map.corridors];
      for (const room of map.rooms) {
        this.floor(room, room.floor);
        this.add.text(room.x + 12, room.y - 26, room.label, {
          fontFamily: 'OrbitPixel', fontSize: '20px', color: '#b5e6dc', backgroundColor: '#071d30',
          padding: { left: 8, right: 8, top: 2, bottom: 2 },
        }).setDepth(2);
      }
      for (const corridor of map.corridors) this.floor(corridor, 'floor_steel_1');
      this.objects = map.objects;
      // Decoration occupies no walkable path; gameplay collision is explicit below.
      for (const [x, y] of [[576, 896], [736, 896], [960, 896], [1056, 896]]) this.sprite(x, y, 'crate_blue');
      this.gates = [
        this.add.rectangle(576, 384, 6, 64, 0xf18989).setDepth(3),
        this.add.rectangle(1152, 384, 6, 64, 0xf18989).setDepth(3),
        this.add.rectangle(1248, 800, 6, 64, 0xf1c773).setDepth(3),
      ];
    }
    this.walls();
    for (const decoration of interior.decorations) {
      if ((decoration.room === 'stable') === stable) {
        this.sprite(decoration.x, decoration.y, decoration.sprite).setDepth(1);
      }
    }
    for (const object of this.objects) this.objectImages.set(object.id, this.sprite(object.x, object.y, object.sprite));
    this.player = this.sprite(256, 800, 'astronaut').setDepth(5);
    this.highlight = this.add.rectangle(0, 0, 38, 38).setStrokeStyle(2, 0xffffff).setFillStyle(0, 0).setDepth(6).setVisible(false);
    this.cameras.main.setBounds(0, 0, stable ? 960 : 1792, stable ? 540 : 1056);
    this.cameras.main.startFollow(this.player, true, 1, 1);
    this.resumeAtSafePoint();
  }
  resumeAtSafePoint(): void {
    if (!this.player) return;
    const state = this.host.state();
    let x = 256, y = 800;
    if (this.stable) { x = 480; y = 320; }
    else if (['branch', 'report', 'phone3'].includes(state.phase)) {
      x = state.branch === 'symbols' ? 352 : 1376; y = state.branch === 'symbols' ? 320 : 416;
    } else if (state.phase === 'maintenance' || state.phase === 'entrance') { x = 1408; y = 832; }
    else if (state.phase === 'revisit') { x = 832; y = 832; }
    this.player.setPosition(x, y);
    this.keys.clear();
    this.cameras.main.centerOn(x, y);
  }
  teleport(x: number, y: number): void {
    this.player?.setPosition(x, y);
    this.keys.clear();
    this.cameras.main.centerOn(x, y);
  }
  private visible(object: WorldObject): boolean {
    const state = this.host.state();
    if (object.id === 'karo-stable') return state.registered;
    return object.id !== 'karo' || (state.evidence.includes('met-karo') && !['branch', 'report', 'phone3'].includes(state.phase));
  }
  private blocked(x: number, y: number): boolean {
    const state = this.host.state();
    const radius = 9;
    if (![[x - radius, y - radius], [x + radius, y - radius], [x - radius, y + radius], [x + radius, y + radius]]
      .every(([cx, cy]) => this.floors.some(rect => inside(cx, cy, rect)))) return true;
    if (!this.stable) {
      if (!state.branch && (inside(x, y, map.rooms[3]) || inside(x, y, map.rooms[4]))) return true;
      if (state.branch === 'symbols' && inside(x, y, map.rooms[4])) return true;
      if (state.branch === 'objects' && inside(x, y, map.rooms[3])) return true;
      if (state.phase === 'branch' && state.branch) {
        const room = map.rooms[state.branch === 'symbols' ? 3 : 4];
        if (!inside(x - radius, y - radius, room) || !inside(x + radius, y + radius, room)) return true;
      }
      if (!state.phones.third && inside(x, y, map.rooms[5])) return true;
    }
    return this.objects.some(item => this.visible(item) && Math.abs(x - item.x) < 24 && Math.abs(y - item.y) < 24);
  }
  update(_time: number, delta: number): void {
    if (!this.player) return;
    const state = this.host.state();
    this.gates[0]?.setVisible(state.branch !== 'symbols' || state.phase === 'branch');
    this.gates[1]?.setVisible(state.branch !== 'objects' || state.phase === 'branch');
    this.gates[2]?.setVisible(!state.phones.third);
    for (const object of this.objects) this.objectImages.get(object.id)?.setVisible(this.visible(object));
    if (!this.host.active()) { this.keys.clear(); this.highlight?.setVisible(false); return; }
    const movement = moveVector(this.keys, Math.min(delta, 50) / 1000);
    const nextX = this.player.x + movement.x, nextY = this.player.y + movement.y;
    if (!this.blocked(nextX, this.player.y)) this.player.x = nextX;
    if (!this.blocked(this.player.x, nextY)) this.player.y = nextY;
    const target = nearest(this.player.x, this.player.y, this.objects.filter(item => this.visible(item)));
    if (target) this.highlight?.setPosition(target.x, target.y).setVisible(true);
    else this.highlight?.setVisible(false);
    if ((target?.id ?? '') !== this.lastTarget) {
      this.lastTarget = target?.id ?? '';
      this.host.target(target);
    }
    if (!this.stable && !this.host.state().evidence.includes('met-karo')
      && inside(this.player.x, this.player.y, map.rooms[2])) this.host.meetKaro();
  }
}
