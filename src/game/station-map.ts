import data from '../content/maps/station-world.json' with { type: 'json' };
import inspectionText from '../content/text/decoration.json' with { type: 'json' };
import ui from '../content/text/ui.json' with { type: 'json' };
import { footBlocked } from './room-geometry.ts';
import { inside, type Rect } from '../core/world-geometry.ts';
import type { GameState } from '../core/state.ts';

export interface Prop {
  id?: string; frame: string; x: number; y: number; footprint?: Rect;
  label?: string; textId?: string; stand?: { x: number; y: number };
  offsetY?: number; depth?: number; shadow?: boolean; solid?: boolean; render?: boolean; lateAnomaly?: boolean;
}
export interface WorldObject extends Prop { id: string; label: string; room: string; inspectionId?: string }
export interface Door { side: string; y: number; to: string; entry: string; label: string }
export interface StationRoom {
  id: string; label: string; room: Rect; spawn: { x: number; y: number };
  doors: Door[]; objects: WorldObject[]; decorations: Prop[]; panels: Rect[]; inspections: WorldObject[];
  ground?: { rect: Rect; columns: number; tiles: string[] };
}
export const STATION_ROOMS: StationRoom[] = data.rooms.map(room => {
  const decorations: Prop[] = room.decorations;
  const inspections: WorldObject[] = decorations.flatMap(prop => prop.id && prop.label && prop.textId
    ? [{ ...prop, id: prop.id, label: prop.label, room: room.id, inspectionId: prop.textId }] : []);
  // 已批准只替换安定区原休息点外观，锚点/ID/功能与原脚碰撞不变。
  const objects = room.objects.map(object => ({
    ...object, room: room.id, ...(object.id === 'rest' ? { frame: 'garden-sofa', footprint: footprint(object) } : {}),
  }));
  return { ...room, objects, decorations, inspections };
});
export function getRoom(id: string): StationRoom {
  const room = STATION_ROOMS.find(item => item.id === id);
  if (!room) throw new Error(`Unknown room: ${id}`);
  return room;
}
export function walkable(room: StationRoom): Rect[] {
  return [room.room, ...room.doors.map(door => ({
    x: door.side === 'west' ? 32 : room.room.x + room.room.w,
    y: door.y, w: door.side === 'west' ? room.room.x - 32 : 928 - room.room.x - room.room.w, h: 64,
  }))];
}
export function footprint(prop: Prop): Rect {
  if (prop.footprint) return prop.footprint;
  const w = prop.frame === 'console' ? 96 : prop.frame === 'projection' || prop.frame === 'bench' ? 64 : 24;
  return { x: prop.x - w / 2, y: prop.y - 16, w, h: 16 };
}
export function objectVisible(object: WorldObject, state: GameState): boolean {
  if (object.id === 'karo-stable') return state.registered;
  return object.id !== 'karo' || (state.evidence.includes('met-karo') && state.phase === 'arrival');
}
export function doorLock(room: StationRoom, door: Door, state: GameState): string | undefined {
  if (['symbols', 'objects'].includes(door.to)) {
    if (!state.branch) return ui.station.lockedBranch;
    if (state.branch !== door.to) return ui.station.otherBranch;
  }
  if (['symbols', 'objects'].includes(room.id) && state.phase === 'branch') return ui.station.sealed;
  if (door.to === 'maintenance' && !state.phones.third) return ui.station.maintenanceLocked;
}
export function blocked(room: StationRoom, x: number, y: number, state: GameState, ignored: readonly string[] = [], additional: Prop[] = []): boolean {
  const solids = [...room.decorations, ...room.objects.filter(item => objectVisible(item, state) && !ignored.includes(item.id)), ...additional]
    .filter(item => item.solid !== false).map(footprint);
  for (const door of room.doors) if (doorLock(room, door, state)) solids.push({
    x: door.side === 'west' ? room.room.x - 32 : room.room.x + room.room.w,
    y: door.y, w: 32, h: 64,
  });
  return footBlocked(x, y, walkable(room), solids);
}
export function gateTarget(room: StationRoom, door: Door): WorldObject {
  return {
    id: `inspect-gate-${room.id}-${door.to}`, label: inspectionText.ui.gate, room: room.id,
    frame: 'grass-base', solid: false, render: false, inspectionId: 'locked-gate',
    x: door.side === 'west' ? room.room.x - 16 : room.room.x + room.room.w + 16, y: door.y + 32,
    stand: { x: door.side === 'west' ? room.room.x + 16 : room.room.x + room.room.w - 16, y: door.y + 32 },
  };
}
export function interactionTargets(room: StationRoom, state: GameState): WorldObject[] {
  return [
    ...room.objects.filter(item => objectVisible(item, state)), ...room.inspections,
    ...room.doors.filter(door => doorLock(room, door, state)).map(door => gateTarget(room, door)),
  ];
}
export function safeRoom(state: GameState, stable: boolean): string {
  if (stable) return 'stable';
  if (['branch', 'report', 'phone3'].includes(state.phase)) return state.branch ?? 'junction';
  if (['maintenance', 'entrance'].includes(state.phase)) return 'maintenance';
  return state.phase === 'revisit' || state.phase === 'cycle' ? 'public' : 'arrival';
}
export function exitAt(room: StationRoom, x: number, y: number): Door | undefined {
  return room.doors.find(door => inside(x, y, {
    x: door.side === 'west' ? 32 : 900, y: door.y, w: 28, h: 64,
  }));
}
