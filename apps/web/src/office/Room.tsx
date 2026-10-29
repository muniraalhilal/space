'use client';
import * as THREE from 'three';
import { memo, useMemo, useState } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { presenceGroup, type DeptTheme, type PresenceStatus, type PresenceGroup } from '@space/shared';
import { Billboard } from '@react-three/drei';
import {
  Desk,
  Monitor,
  Keyboard,
  Laptop,
  Mug,
  Chair,
  Stool,
  Sofa,
  Armchair,
  RoundTable,
  CoffeeTable,
  Plant,
  Bookshelf,
  Cabinet,
  WallBoard,
  ArtFrame,
  Whiteboard,
  Rug,
  FloorLamp,
  GlassPanel,
  Wall,
  Planter,
  DESK_D,
} from './furniture';
import { RobotModel, type RobotStatus } from './Robot';
import { mat, basic, P } from './lib/materials';
import { woodTexture, type ScreenKind } from './lib/textures';
import type { RobotConfig } from '@space/shared';

export interface RoomPerson {
  id: string;
  name: string;
  presence: PresenceStatus;
}
export interface RoomAgent {
  id: string;
  name: string;
  robot: RobotConfig;
  status: RobotStatus;
}

interface ThemeSpec {
  floor: string;
  wall: string;
  chair: string;
  rug: string;
  screens: ScreenKind[];
  pots: Array<'white' | 'terracotta' | 'sage' | 'blush'>;
  deskTop: 'white' | 'wood';
}

function mix(a: string, b: string, t: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

export function themeSpec(theme: DeptTheme, color: string): ThemeSpec {
  const wall = mix('#f6e2d8', color, 0.3);
  const base: ThemeSpec = { floor: mix('#efd9c4', color, 0.12), wall, chair: P.charcoal, rug: mix('#ffffff', color, 0.5), screens: ['docs', 'sheet'], pots: ['white', 'terracotta'], deskTop: 'white' };
  switch (theme) {
    case 'development':
      return { ...base, screens: ['code', 'code', 'dashboard'], chair: P.charcoal };
    case 'design':
      return { ...base, screens: ['design', 'design', 'video'], chair: '#efc3cf', pots: ['blush', 'white'], deskTop: 'wood' };
    case 'marketing':
      return { ...base, screens: ['campaign', 'chart', 'video'], chair: '#f2c7a6', pots: ['terracotta', 'white'], deskTop: 'wood' };
    case 'hr':
      return { ...base, screens: ['docs', 'sheet'], chair: '#e8b9b9', pots: ['blush', 'sage'] };
    case 'finance':
      return { ...base, screens: ['chart', 'sheet', 'dashboard'], chair: '#4a5a50', pots: ['sage', 'white'] };
    case 'operations':
      return { ...base, screens: ['kanban', 'dashboard', 'sheet'], chair: '#4c4660', pots: ['white', 'sage'] };
    case 'product':
      return { ...base, screens: ['kanban', 'design', 'docs'], chair: '#9fc9bf', pots: ['sage', 'terracotta'], deskTop: 'wood' };
    default:
      return base;
  }
}

/** Pin colours for the four presence buckets (matches the Team Presence legend). */
export const PRESENCE_PIN: Record<PresenceGroup, string> = { in_office: '#3fb27a', remote: '#7b83eb', away: '#f2b23e', offline: '#b9b5c2' };

/** A small map-style marker above a desk telling you where its owner is right now. */
const PresencePin = memo(function PresencePin({ group, position, selected }: { group: PresenceGroup; position: [number, number, number]; selected: boolean }) {
  const c = PRESENCE_PIN[group];
  return (
    <group position={position}>
      <mesh position={[0, 0.14, 0]} material={basic('#ffffff', { toneMapped: false })}>
        <cylinderGeometry args={[0.012, 0.004, 0.28, 6]} />
      </mesh>
      <Billboard position={[0, 0.38, 0]}>
        <mesh material={basic('#ffffff', { toneMapped: false })}>
          <circleGeometry args={[selected ? 0.17 : 0.135, 28]} />
        </mesh>
        <mesh position={[0, 0, 0.002]} material={basic(c, { toneMapped: false })}>
          <circleGeometry args={[selected ? 0.12 : 0.09, 28]} />
        </mesh>
      </Billboard>
    </group>
  );
});

/**
 * Desk positions by headcount, all facing the camera so every screen is readable.
 * Local room coordinates (room centre = 0,0). Rows of up to four desks.
 */
export function seatLayout(n: number) {
  const count = Math.max(1, Math.min(12, n));
  const rows = count <= 4 ? [-0.6] : count <= 8 ? [-1.5, 0.05] : [-2.05, -0.65, 0.75];
  const seats: Array<{ desk: [number, number]; chair: [number, number] }> = [];
  for (const z of rows) {
    const left = count - seats.length;
    const inRow = Math.min(4, Math.ceil(left / (rows.length - rows.indexOf(z))));
    for (let i = 0; i < inRow; i++) {
      const x = 0.25 + (i - (inRow - 1) / 2) * 1.32;
      seats.push({ desk: [x, z], chair: [x, z + DESK_D / 2 + 0.5] });
    }
  }
  return seats;
}

/** Screen content that reads as a bright, light UI when the desk is in use. */
const LIGHT_SCREENS: ScreenKind[] = ['docs', 'sheet', 'dashboard', 'chart', 'kanban', 'design', 'campaign'];
function lightScreen(k: ScreenKind, i: number): ScreenKind {
  return LIGHT_SCREENS.includes(k) ? k : LIGHT_SCREENS[i % 3];
}

export const Room = memo(function Room({
  theme,
  color,
  w,
  d,
  people,
  agents,
  focus,
  seed,
  highlighted,
  onSelectRoom,
  onSelectPerson,
  onSelectAgent,
  onHover,
  selectedEntityId,
  animate,
}: {
  theme: DeptTheme;
  color: string;
  w: number;
  d: number;
  people: RoomPerson[];
  agents: RoomAgent[];
  focus: boolean;
  seed: number;
  highlighted: boolean;
  onSelectRoom: () => void;
  onSelectPerson: (id: string, e: ThreeEvent<MouseEvent>) => void;
  onSelectAgent: (id: string, e: ThreeEvent<MouseEvent>) => void;
  onHover: (h: { kind: 'member' | 'agent'; id: string; name: string } | null) => void;
  selectedEntityId: string | null;
  animate: boolean;
}) {
  const spec = useMemo(() => themeSpec(theme, color), [theme, color]);
  const hw = w / 2;
  const hd = d / 2;
  // Every member owns a desk (stable order). Empty rooms still show a couple of unused desks.
  const owners = useMemo(() => [...people].sort((a, b) => a.id.localeCompare(b.id)).slice(0, 12), [people]);
  const seats = useMemo(() => seatLayout(Math.max(2, owners.length)), [owners.length]);
  const rowsFront = seats.length > 0 ? Math.max(...seats.map((s) => s.desk[1])) : 0;
  const floorTex = useMemo(() => {
    const t = woodTexture(spec.floor).clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(w / 3, d / 3);
    t.needsUpdate = true;
    return t;
  }, [spec.floor, w, d]);

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelectRoom();
  };

  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow onClick={click} material={mat('#ffffff', { map: floorTex, roughness: 0.8 })}>
        <planeGeometry args={[w - 0.1, d - 0.1]} />
      </mesh>
      {highlighted && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={basic(color, { transparent: true, opacity: 0.16 })}>
          <planeGeometry args={[w - 0.1, d - 0.1]} />
        </mesh>
      )}

      {/* walls: solid at the back (−z) and left (−x); low glass towards the camera */}
      <Wall length={w} color={spec.wall} position={[0, 0, -hd]} />
      <Wall length={d} color={spec.wall} position={[-hw, 0, 0]} rotation={[0, Math.PI / 2, 0]} />
      <GlassPanel length={hw - 0.7} position={[-hw / 2 - 0.35, 0, hd]} />
      <GlassPanel length={hw - 0.7} position={[hw / 2 + 0.35, 0, hd]} />
      <GlassPanel length={hd - 0.7} position={[hw, 0, -hd / 2 - 0.35]} rotation={[0, Math.PI / 2, 0]} />
      <GlassPanel length={hd - 0.7} position={[hw, 0, hd / 2 + 0.35]} rotation={[0, Math.PI / 2, 0]} />

      {/* back-wall decor */}
      <ThemeWall theme={theme} color={color} spec={spec} hw={hw} hd={hd} seed={seed} focus={focus} />

      {/* rug under the desks */}
      <Rug w={w * 0.74} d={Math.min(d - 1.2, rowsFront - (seats[0]?.desk[1] ?? 0) + 2.4)} color={spec.rug} position={[0.25, 0, ((seats[0]?.desk[1] ?? 0) + rowsFront) / 2 + 0.25]} />

      {/* desks — one per member; the pin above each desk shows whether its owner is in, remote, away or offline */}
      {seats.map((s, i) => {
        const owner = owners[i];
        const group = owner ? presenceGroup(owner.presence) : null;
        const selected = !!owner && selectedEntityId === owner.id;
        const kind = lightScreen(spec.screens[i % spec.screens.length], i);
        return (
          <group
            key={owner?.id ?? `empty-${i}`}
            onClick={
              owner
                ? (e) => {
                    e.stopPropagation();
                    onSelectPerson(owner.id, e);
                  }
                : click
            }
            onPointerOver={
              owner
                ? (e) => {
                    e.stopPropagation();
                    onHover({ kind: 'member', id: owner.id, name: owner.name });
                    document.body.style.cursor = 'pointer';
                  }
                : undefined
            }
            onPointerOut={
              owner
                ? () => {
                    onHover(null);
                    document.body.style.cursor = '';
                  }
                : undefined
            }
          >
            <group position={[s.desk[0], 0, s.desk[1]]}>
              <Desk top={spec.deskTop} />
              <Monitor kind={kind} accent={color} seed={seed + i} highlight={selected} position={[-0.08, 0.645, -0.17]} wide={theme === 'development'} />
              <Keyboard position={[-0.08, 0.655, 0.12]} />
              {i % 3 === 1 && <Mug position={[0.42, 0.645, 0.08]} color={i % 2 ? '#f6dbe2' : '#f6f1ea'} />}
              {i % 2 === 0 && !focus && <Plant kind="small" position={[0.5, 0.645, -0.2]} seed={i} pot={spec.pots[i % 2]} />}
            </group>
            <group position={[s.chair[0], 0, s.chair[1]]} rotation={[0, Math.PI, 0]}>
              <Chair color={spec.chair} position={[0, 0, -0.06]} />
            </group>
            {group && <PresencePin group={group} position={[s.desk[0] - 0.08, 0.95, s.desk[1] - 0.17]} selected={selected} />}
            {selected && (
              <group position={[s.desk[0], 0, s.desk[1] + 0.35]}>
                <SelectionRing color={color} r={0.78} />
              </group>
            )}
          </group>
        );
      })}

      {/* meeting / lounge corner (only when the room has space for it) */}
      {seats.length <= 8 && <ThemeCorner theme={theme} spec={spec} hw={hw} hd={hd} focus={focus} />}

      {/* AI agents of this department */}
      {agents.map((a, i) => (
        <group
          key={a.id}
          position={[hw - 1.0 - i * 0.85, 0, hd - 0.75]}
          rotation={[0, -0.35, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectAgent(a.id, e);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover({ kind: 'agent', id: a.id, name: a.name });
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            onHover(null);
            document.body.style.cursor = '';
          }}
        >
          <group scale={0.95}>
            <RobotModel config={a.robot} status={a.status} animate={animate} seed={i + seed} />
          </group>
          {selectedEntityId === a.id && <SelectionRing color={color} />}
        </group>
      ))}

      {/* greenery: lush but kept out of walkways; Focus Mode keeps only a few */}
      <Plant kind="palm" position={[hw - 0.55, 0, -hd + 0.55]} seed={seed} pot={spec.pots[0]} scale={1.6} />
      <Plant kind="bush" position={[-hw + 0.5, 0, -hd + 0.5]} seed={seed + 2} pot={spec.pots[0]} scale={1.5} />
      {!focus && (
        <>
          <Plant kind="tall" position={[-hw + 0.45, 0, 0.9]} seed={seed + 3} pot={spec.pots[1]} scale={1.35} />
          <Plant kind="palm" position={[hw - 0.45, 0, 0.2]} seed={seed + 4} pot="white" scale={1.2} />
          <Plant kind="bush" position={[-hw + 0.5, 0, hd - 0.45]} seed={seed + 12} pot="white" scale={1.2} />
          <Plant kind="small" position={[hw - 0.15, 1.06, -1.6]} seed={seed + 7} pot="white" />
          <Plant kind="small" position={[-2.2, 1.06, hd - 0.02]} seed={seed + 9} pot="sage" />
          <Plant kind="small" position={[2.1, 1.06, hd - 0.02]} seed={seed + 10} pot="white" />
        </>
      )}
    </group>
  );
});

function SelectionRing({ color, r = 0.4 }: { color: string; r?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} material={basic(color, { transparent: true, opacity: 0.55 })}>
      <ringGeometry args={[r - 0.05, r + 0.04, 48]} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ themed set dressing */

function ThemeWall({ theme, color, spec, hw, hd, seed, focus }: { theme: DeptTheme; color: string; spec: ThemeSpec; hw: number; hd: number; seed: number; focus: boolean }) {
  const z = -hd + 0.08;
  const x = -hw + 0.08;
  const left = (
    <group position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <Bookshelf w={1.4} h={1.3} seed={seed} position={[-1.55, 0, 0.18]} plants={!focus} />
      {!focus && <ArtFrame seed={seed} position={[0.45, 1.05, 0.02]} />}
      <Cabinet w={1.0} position={[1.5, 0, 0.26]} color={P.offWhite} />
    </group>
  );
  let back: React.ReactNode = null;
  switch (theme) {
    case 'development':
      back = (
        <>
          <WallBoard screen="dashboard" accent={color} w={1.7} h={0.9} position={[-0.6, 0.98, z]} seed={seed} />
          <WallBoard screen="code" accent={color} w={0.9} h={0.55} position={[1.3, 1.06, z]} seed={seed + 2} />
          {!focus && <ArtFrame seed={seed + 2} position={[2.55, 1.0, z]} />}
        </>
      );
      break;
    case 'design':
      back = (
        <>
          <WallBoard board="mood" w={1.9} h={1.05} position={[-0.4, 0.98, z]} seed={seed} frame="#f7ecef" />
          {!focus && <ArtFrame seed={seed + 3} position={[1.5, 1.05, z]} frame="#f2c9d4" />}
          {!focus && <ArtFrame seed={seed + 4} w={0.34} h={0.44} position={[2.3, 1.0, z]} frame="#f2c9d4" />}
        </>
      );
      break;
    case 'marketing':
      back = (
        <>
          <WallBoard board="sticky" w={1.8} h={0.95} position={[-0.4, 0.98, z]} seed={seed} />
          <WallBoard screen="campaign" accent={color} w={1.0} h={0.6} position={[1.6, 1.05, z]} seed={seed + 1} />
        </>
      );
      break;
    case 'hr':
      back = (
        <>
          <WallBoard board="people" w={1.6} h={0.9} position={[-0.4, 1.0, z]} seed={seed} />
          {!focus && <ArtFrame seed={seed + 5} position={[1.3, 1.05, z]} />}
          {!focus && <ArtFrame seed={seed + 6} w={0.34} h={0.34} position={[1.9, 1.15, z]} />}
        </>
      );
      break;
    case 'finance':
      back = (
        <>
          <WallBoard board="finance" w={1.6} h={0.9} position={[-0.4, 1.0, z]} seed={seed} />
          <WallBoard screen="chart" accent={color} w={0.9} h={0.55} position={[1.4, 1.06, z]} seed={seed + 3} />
        </>
      );
      break;
    case 'operations':
      back = (
        <>
          <WallBoard screen="kanban" accent={color} w={1.8} h={0.95} position={[-0.4, 0.98, z]} seed={seed} />
          <WallBoard screen="dashboard" accent={color} w={0.9} h={0.55} position={[1.5, 1.06, z]} seed={seed + 1} />
        </>
      );
      break;
    case 'product':
      back = (
        <>
          <WallBoard board="roadmap" w={2.0} h={1.0} position={[-0.3, 0.98, z]} seed={seed} />
          {!focus && <ArtFrame seed={seed + 2} position={[1.7, 1.05, z]} />}
        </>
      );
      break;
    default:
      back = (
        <>
          <WallBoard board="sticky" w={1.4} h={0.8} position={[-0.4, 1.02, z]} seed={seed} />
          {!focus && <ArtFrame seed={seed} position={[1.3, 1.05, z]} />}
        </>
      );
  }
  return (
    <>
      {back}
      {left}
    </>
  );
}

function ThemeCorner({ theme, spec, hw, hd, focus }: { theme: DeptTheme; spec: ThemeSpec; hw: number; hd: number; focus: boolean }) {
  const cx = -hw + 1.6;
  const cz = hd - 1.25;
  switch (theme) {
    case 'design':
    case 'product':
      return (
        <group position={[cx, 0, cz]}>
          <Rug w={2.2} color={theme === 'design' ? '#f3d3dc' : '#d4e9e2'} round position={[0, 0, 0]} />
          <Sofa color={theme === 'design' ? '#f1c6d2' : '#bfdcd3'} pillow="#fff3e8" seats={2} position={[0, 0, -0.75]} />
          <CoffeeTable position={[0, 0, 0.15]} />
          {!focus && <Plant kind="bush" position={[1.05, 0, -0.75]} pot="blush" />}
          {theme === 'product' && <Whiteboard position={[-0.95, 0, 0.3]} rotation={[0, Math.PI / 2, 0]} />}
        </group>
      );
    case 'hr':
      return (
        <group position={[cx, 0, cz]}>
          <Rug w={2.2} color="#f2dcdc" round />
          <Armchair color="#f0cfc4" position={[-0.55, 0, -0.35]} rotation={[0, 0.6, 0]} />
          <Armchair color="#e3d6ef" position={[0.55, 0, -0.35]} rotation={[0, -0.6, 0]} />
          <CoffeeTable position={[0, 0, 0.25]} />
          {!focus && <FloorLamp position={[1.1, 0, -0.7]} />}
        </group>
      );
    case 'marketing':
      return (
        <group position={[cx, 0, cz]}>
          <RoundTable r={0.6} position={[0, 0, 0]} top={P.woodLight} />
          {[0, 1, 2, 3].map((i) => (
            <Stool key={i} color="#f3cdb2" position={[Math.cos((i / 4) * Math.PI * 2 + 0.4) * 0.9, 0, Math.sin((i / 4) * Math.PI * 2 + 0.4) * 0.9]} />
          ))}
          <Laptop position={[0.1, 0.64, 0.05]} rotation={[0, -0.4, 0]} kind="campaign" />
        </group>
      );
    case 'finance':
    case 'operations':
      return (
        <group position={[cx, 0, cz]}>
          <RoundTable r={0.55} position={[0, 0, 0]} />
          {[0, 1, 2].map((i) => (
            <Chair key={i} color={spec.chair} position={[Math.cos((i / 3) * Math.PI * 2 + 0.3) * 0.95, 0, Math.sin((i / 3) * Math.PI * 2 + 0.3) * 0.95]} rotation={[0, -((i / 3) * Math.PI * 2 + 0.3) - Math.PI / 2, 0]} />
          ))}
          <Laptop position={[0, 0.64, 0]} kind={theme === 'finance' ? 'sheet' : 'kanban'} />
        </group>
      );
    case 'development':
      return (
        <group position={[cx, 0, cz]}>
          <Rug w={2.0} color="#dbe6f6" round />
          <Sofa color="#cdd9ec" pillow="#f6e3cf" seats={2} position={[0, 0, -0.65]} />
          <CoffeeTable position={[0, 0, 0.2]} r={0.36} />
          <Laptop position={[0.05, 0.345, 0.2]} kind="code" />
        </group>
      );
    default:
      return (
        <group position={[cx, 0, cz]}>
          <Rug w={2.0} color={spec.rug} round />
          <Armchair color="#e6dccf" position={[-0.45, 0, -0.3]} rotation={[0, 0.5, 0]} />
          <CoffeeTable position={[0.25, 0, 0.25]} r={0.34} />
          {!focus && <Planter length={1.2} position={[0.2, 0, -1.0]} />}
        </group>
      );
  }
}
