import Phaser from 'phaser';
import { FRAMES } from './frame-catalog.ts';
import ui from '../content/text/ui.json' with { type: 'json' };
import { type StationRoom, type Prop, type WorldObject, walkable } from './station-map.ts';
import type { Rect } from '../core/world-geometry.ts';
import { createCharacter } from './characters.ts';
import themes from '../content/maps/room-themes.json';

function tile(scene: Phaser.Scene, rect: Rect, name: string, depth: number): void {
  const frame = FRAMES[name];
  for (let y = rect.y; y < rect.y + rect.h; y += frame.h * 2) for (let x = rect.x; x < rect.x + rect.w; x += frame.w * 2) {
    scene.add.image(x, y, frame.texture, name).setOrigin(0).setScale(2).setDepth(depth);
  }
}
export function drawProp(scene: Phaser.Scene, prop: Prop): Phaser.GameObjects.Container {
  const container = scene.add.container(prop.x, prop.y).setDepth(prop.depth ?? prop.y);
  if (prop.render === false) return container;
  if (prop.frame === 'character-karo' || prop.frame === 'character-merin') {
    const id = prop.frame === 'character-karo' ? 'karo' : 'merin';
    container.add(scene.add.ellipse(0, 0, 20, 6, 0x080d17, 0.45));
    container.add(createCharacter(scene, id, 0, 0));
    return container;
  }
  const frame = FRAMES[prop.frame];
  const anchor = frame.anchor ?? { x: frame.w / 2, y: frame.h };
  if (prop.shadow !== false && !prop.frame.startsWith('garden-')) container.add(scene.add.ellipse(0, -3, frame.w * 1.6, 10, 0x080d17, 0.4));
  container.add(scene.add.image(0, prop.offsetY ?? 0, frame.texture, prop.frame)
    .setOrigin(anchor.x / frame.w, anchor.y / frame.h).setScale(2));
  return container;
}
export function drawRoom(scene: Phaser.Scene, room: StationRoom): void {
  const r = room.room;
  const theme = themes.rooms[room.id as keyof typeof themes.rooms];
  scene.add.rectangle(0, 0, 960, 540, 0x101722).setOrigin(0).setDepth(-100);
  if ('natural' in theme) {
    // 自然区无金属墙体：草木轮廓围合原活动范围，不改变主线安全点。
    tile(scene, { x: 64, y: 32, w: 800 + 32, h: 448 }, theme.floor, -90);
    for (let y = 64; y < 480; y += 32) for (let x = 96; x < 864; x += 32) {
      const column = (x - r.x + 32) / 32, row = (y - r.y + 32) / 32;
      if ((x < 192 || x > 768 || y < 128 || y > 448) && (column + row) % 5 === 0) tile(scene, { x, y, w: 32, h: 32 }, theme.panel, -89);
    }
    for (const patch of themes.stableGrassDetails) tile(scene, { ...patch, w: 32, h: 32 }, theme.panel, -89);
    for (const prop of themes.stableScenery) drawProp(scene, { ...prop, solid: false, shadow: false });
    scene.add.text(480, 20, room.label, {
      fontFamily: 'OrbitPixel', fontSize: '10px', color: '#c6d9be', backgroundColor: '#18251e',
    }).setOrigin(0.5, 0).setDepth(1000);
    scene.add.text(336, 156, ui.station.mark, {
      fontFamily: 'OrbitPixel', fontSize: '20px', color: '#b7e4d5',
    }).setOrigin(0.5).setDepth(210);
    return;
  }
  for (const floor of walkable(room)) tile(scene, floor, theme.floor, -90);
  if (!['junction', 'symbols', 'objects'].includes(room.id)) {
    for (const panel of room.panels) tile(scene, panel, theme.panel, -88);
  }
  if (room.id === 'public') {
    // 灰绿只作局部建筑接缝，不给整房贴图染色。
    scene.add.rectangle(r.x, r.y - 10, r.w, 4, theme.trim).setOrigin(0).setDepth(-37);
  }
  if (room.id === 'maintenance') {
    for (const x of [512, 608]) tile(scene, { x, y: 384, w: 64, h: 32 }, 'service-stripe', -86);
  }
  if (room.ground) {
    const { rect, columns, tiles } = room.ground;
    tiles.forEach((frame, index) => {
      tile(scene, { x: rect.x + index % columns * 32, y: rect.y + Math.floor(index / columns) * 32, w: 32, h: 32 }, frame, -85);
    });
    // 经确认的项目几何细金属边；不把示意线误登记为作者原图块。
    scene.add.rectangle(rect.x, rect.y, rect.w, rect.h).setOrigin(0)
      .setFillStyle(0, 0).setStrokeStyle(2, 0x889399).setDepth(-84);
    scene.add.rectangle(rect.x, rect.y + rect.h, rect.w, 2, 0x263039).setOrigin(0).setDepth(-83);
  }
  tile(scene, { x: r.x, y: r.y - 64, w: r.w, h: 32 }, theme.wall, -40);
  tile(scene, { x: r.x, y: r.y - 32, w: r.w, h: 32 }, theme.foot, -39);
  tile(scene, { x: r.x - 32, y: r.y - 96, w: r.w + 64, h: 32 }, theme.top, 30);
  scene.add.rectangle(r.x - 32, r.y - 66, r.w + 64, 2, theme.trim).setOrigin(0).setDepth(31);
  scene.add.rectangle(r.x, r.y - 2, r.w, 4, 0x080d17, 0.4).setOrigin(0).setDepth(-38);
  for (const side of ['west', 'east']) {
    const x = side === 'west' ? r.x - 32 : r.x + r.w;
    tile(scene, { x, y: r.y - 64, w: 32, h: 64 }, theme.side, 30);
    scene.add.rectangle(x + (side === 'west' ? 28 : 0), r.y - 64, 4, 64, theme.trim).setOrigin(0).setDepth(31);
    const doors = room.doors.filter(door => door.side === side).sort((a, b) => a.y - b.y);
    let y = r.y;
    for (const door of [...doors, { y: r.y + r.h }]) {
      if (door.y > y) {
        tile(scene, { x, y, w: 32, h: door.y - y }, theme.side, y + 32);
        scene.add.rectangle(x + (side === 'west' ? 28 : 0), y, 4, door.y - y, theme.trim).setOrigin(0).setDepth(y + 33);
      }
      y = door.y + 64;
    }
    for (const door of doors) {
      const start = side === 'west' ? 32 : x;
      const width = side === 'west' ? r.x - 32 : 928 - x;
      const destination = themes.rooms[door.to as keyof typeof themes.rooms];
      tile(scene, { x: start, y: door.y, w: width, h: 64 }, room.id === 'junction' ? destination.floor : theme.floor, -85);
      // 门洞附近也保留64高立面与32墙顶，不只沿地面描边。
      if (room.id !== 'public') {
        tile(scene, { x: side === 'west' ? 32 : x + 32, y: door.y - 64, w: width - 32, h: 32 }, theme.wall, -40);
        tile(scene, { x: side === 'west' ? 32 : x + 32, y: door.y - 32, w: width - 32, h: 32 }, theme.foot, -39);
      }
      tile(scene, { x: side === 'west' ? 32 : x + 32, y: door.y - (room.id === 'public' ? 32 : 96), w: width - 32, h: 32 }, theme.top, 30);
      tile(scene, { x: side === 'west' ? 32 : x + 32, y: door.y + 64, w: width - 32, h: 32 }, theme.top, door.y + 96);
      scene.add.rectangle(x + 15, door.y, 2, 64, 0x9faab3).setOrigin(0).setDepth(31);
      scene.add.rectangle(x + 9, door.y + 8, 4, 48, 0x75bcb5).setOrigin(0).setDepth(32);
      scene.add.text(side === 'west' ? r.x - 42 : r.x + r.w + 42, door.y + 20, door.label, {
        fontFamily: 'OrbitPixel', fontSize: '10px', color: '#d7e9e2', backgroundColor: '#102330',
      }).setOrigin(side === 'west' ? 1 : 0, 0).setDepth(1000);
    }
  }
  for (let x = r.x - 32; x < r.x + r.w + 32; x += 32) {
    scene.add.image(x, r.y + r.h, FRAMES[theme.lip].texture, theme.lip).setOrigin(0).setScale(2).setDepth(500);
  }
  scene.add.rectangle(r.x - 32, r.y + r.h, r.w + 64, 2, theme.trim).setOrigin(0).setDepth(501);
  scene.add.text(r.x + 8, r.y - 58, room.label, {
    fontFamily: 'OrbitPixel', fontSize: '10px', color: '#bcc8ce',
  }).setDepth(35);
}
export function objectLabel(scene: Phaser.Scene, object: WorldObject): Phaser.GameObjects.Text {
  return scene.add.text(object.x, object.y + 6, object.label, {
    fontFamily: 'OrbitPixel', fontSize: '10px', color: '#d9e7e1', backgroundColor: '#0d2534',
  }).setOrigin(0.5, 0).setDepth(1000).setVisible(false);
}
