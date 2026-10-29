/**
 * Automatic office layout. Each floor is a grid of department rooms arranged around a central
 * atrium (reception + lounge on floor 1, collaboration hub on other floors).
 * Units are metres in the 3D scene. Company admins can override the stored layout.
 */
export interface RoomSlot {
  departmentId: string;
  x: number;
  z: number;
  w: number;
  d: number;
}

export const ROOM_W = 7.2;
export const ROOM_D = 6.4;
export const PITCH_X = 8;
export const PITCH_Z = 7.2;

/** Ring order around the centre: back row first, then sides, then front row (camera-facing). */
const SLOT_ORDER: Array<[number, number]> = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
  [-1, 1],
  [1, 1],
  // second ring for very large floors
  [-2, -1],
  [2, -1],
  [-2, 0],
  [2, 0],
  [-2, 1],
  [2, 1],
];

export const MAX_ROOMS_PER_FLOOR = SLOT_ORDER.length;

export function slotPosition(i: number): { x: number; z: number } {
  const [c, r] = SLOT_ORDER[i];
  return { x: c * PITCH_X, z: r * PITCH_Z };
}

/** Places departments that are missing from `existing`, keeping existing placements stable. */
export function placeRooms(existing: RoomSlot[], departmentIds: string[]): RoomSlot[] {
  const keep = existing.filter((r) => departmentIds.includes(r.departmentId));
  const used = new Set(keep.map((r) => `${r.x},${r.z}`));
  const out = [...keep];
  for (const id of departmentIds) {
    if (out.some((r) => r.departmentId === id)) continue;
    for (let i = 0; i < SLOT_ORDER.length; i++) {
      const p = slotPosition(i);
      if (!used.has(`${p.x},${p.z}`)) {
        used.add(`${p.x},${p.z}`);
        out.push({ departmentId: id, x: p.x, z: p.z, w: ROOM_W, d: ROOM_D });
        break;
      }
    }
  }
  return out;
}
