'use client';
import * as THREE from 'three';
import { memo, type ComponentProps } from 'react';
import { G, Prefab, type Part } from './lib/prefab';
import { mat, glossy, glass, basic, P } from './lib/materials';
import { wallpaperTexture, screenTexture, boardTexture, booksTexture, artTexture, rugTexture, type ScreenKind } from './lib/textures';

type GP = ComponentProps<'group'>;
const DS = THREE.DoubleSide;

/* ================================================================== desks & tech */

export const DESK_W = 1.3;
export const DESK_D = 0.68;
export const DESK_H = 0.62;

export const Desk = memo(function Desk({ top = 'white', ...p }: { top?: 'white' | 'wood' } & GP) {
  return (
    <Prefab
      k={`desk|${top}`}
      build={() => {
        const topM = top === 'wood' ? mat(P.woodLight, { roughness: 0.6 }) : mat(P.white, { roughness: 0.45 });
        const frame = mat(P.white, { roughness: 0.5 });
        const parts: Part[] = [
          { g: G.rbox(DESK_W, 0.045, DESK_D, 0.018), m: topM, p: [0, DESK_H, 0] },
          { g: G.rbox(0.04, DESK_H - 0.02, DESK_D - 0.06, 0.012), m: frame, p: [-DESK_W / 2 + 0.05, (DESK_H - 0.02) / 2, 0] },
          { g: G.rbox(0.04, DESK_H - 0.02, DESK_D - 0.06, 0.012), m: frame, p: [DESK_W / 2 - 0.05, (DESK_H - 0.02) / 2, 0] },
          { g: G.rbox(DESK_W - 0.12, 0.22, 0.02, 0.008), m: frame, p: [0, DESK_H - 0.16, -DESK_D / 2 + 0.06] },
          // drawer pedestal
          { g: G.rbox(0.34, 0.46, 0.46, 0.02), m: mat(P.offWhite, { roughness: 0.5 }), p: [DESK_W / 2 - 0.26, 0.24, -0.06] },
          { g: G.rbox(0.28, 0.012, 0.012, 0.004), m: mat(P.metal, { metalness: 0.5, roughness: 0.3 }), p: [DESK_W / 2 - 0.26, 0.4, 0.175] },
          { g: G.rbox(0.28, 0.012, 0.012, 0.004), m: mat(P.metal, { metalness: 0.5, roughness: 0.3 }), p: [DESK_W / 2 - 0.26, 0.24, 0.175] },
        ];
        return parts;
      }}
      {...p}
    />
  );
});

/**
 * Desk monitor. `on` = a bright white working screen (the person is at their desk);
 * `on={false}` = a black, switched-off screen (the person is away or offline).
 */
/** A slim black desk monitor with a calm desktop wallpaper. The screen does not encode presence. */
export const Monitor = memo(function Monitor({ kind: _kind, accent = '#8fb3e8', seed = 1, wide = false, highlight = false, ...p }: { kind?: ScreenKind; accent?: string; seed?: number; wide?: boolean; on?: boolean; highlight?: boolean } & GP) {
  const w = wide ? 0.66 : 0.54;
  const h = wide ? 0.34 : 0.32;
  const cy = 0.24 + h / 2 - 0.04;
  return (
    <group {...p}>
      <Prefab
        k={`monitor2|${wide}`}
        build={() => {
          const bezel = mat('#17181d', { roughness: 0.4, metalness: 0.15 });
          const back = mat('#2a2b31', { roughness: 0.55, metalness: 0.1 });
          return [
            { g: G.rbox(0.19, 0.012, 0.13, 0.006), m: back, p: [0, 0.006, -0.01] },
            { g: G.rbox(0.035, 0.22, 0.018, 0.008), m: back, p: [0, 0.12, -0.035] },
            { g: G.rbox(w, h, 0.018, 0.008), m: bezel, p: [0, cy, 0] },
            { g: G.rbox(w * 0.55, h * 0.5, 0.03, 0.01), m: back, p: [0, cy, -0.02] },
          ];
        }}
      />
      <mesh position={[0, cy, 0.0095]} material={basic('#d9dcea', { map: wallpaperTexture(accent, seed) })}>
        <planeGeometry args={[w - 0.022, h - 0.03]} />
      </mesh>
      {highlight && (
        <mesh position={[0, cy, 0.012]} material={basic('#ffffff', { transparent: true, opacity: 0.18, toneMapped: false })}>
          <planeGeometry args={[w - 0.022, h - 0.03]} />
        </mesh>
      )}
    </group>
  );
});

export const Keyboard = memo(function Keyboard(p: GP) {
  return (
    <Prefab
      k="keyboard"
      shadows={false}
      build={() => [
        { g: G.rbox(0.36, 0.015, 0.12, 0.006), m: mat('#f4f3f1', { roughness: 0.5 }) },
        { g: G.rbox(0.06, 0.02, 0.09, 0.01), m: mat('#f4f3f1', { roughness: 0.5 }), p: [0.27, 0, 0.01] },
      ]}
      {...p}
    />
  );
});

export const Laptop = memo(function Laptop({ open = true, color = '#d9dce2', kind = 'docs' as ScreenKind, ...p }: { open?: boolean; color?: string; kind?: ScreenKind } & GP) {
  return (
    <group {...p}>
      <Prefab k={`laptop-base|${color}`} build={() => [{ g: G.rbox(0.34, 0.016, 0.23, 0.006), m: glossy(color, { roughness: 0.3, metalness: 0.5 }) }]} />
      {open && (
        <group position={[0, 0.008, -0.11]} rotation={[-0.32, 0, 0]}>
          <Prefab k={`laptop-lid|${color}`} build={() => [{ g: G.rbox(0.34, 0.22, 0.012, 0.006), m: glossy(color, { roughness: 0.3, metalness: 0.5 }), p: [0, 0.11, 0] }]} />
          <mesh position={[0, 0.11, 0.0065]} material={basic('#ffffff', { map: screenTexture(kind, '#c3a6f0', 4), toneMapped: false })}>
            <planeGeometry args={[0.31, 0.19]} />
          </mesh>
        </group>
      )}
    </group>
  );
});

export const Mug = memo(function Mug({ color = '#f6f1ea', ...p }: { color?: string } & GP) {
  return (
    <Prefab
      k={`mug|${color}`}
      shadows={false}
      build={() => [
        { g: G.cyl(0.035, 0.03, 0.08, 16), m: glossy(color, { roughness: 0.3 }), p: [0, 0.04, 0] },
        { g: G.torus(0.022, 0.006, 6, 12), m: glossy(color, { roughness: 0.3 }), p: [0.04, 0.045, 0], r: [0, 0, Math.PI / 2] },
      ]}
      {...p}
    />
  );
});

/* ================================================================== seating */

export const Chair = memo(function Chair({ color = P.charcoal, ...p }: { color?: string } & GP) {
  return (
    <Prefab
      k={`chair|${color}`}
      build={() => {
        const fabric = mat(color, { roughness: 0.85 });
        const shell = mat(color === P.charcoal ? '#3a3840' : color, { roughness: 0.6 });
        const chrome = mat(P.chrome, { roughness: 0.25, metalness: 0.7 });
        const parts: Part[] = [
          { g: G.rbox(0.44, 0.075, 0.42, 0.035, 3), m: fabric, p: [0, 0.4, 0] },
          { g: G.rbox(0.42, 0.42, 0.06, 0.04, 3), m: fabric, p: [0, 0.68, -0.22], r: [-0.12, 0, 0] },
          { g: G.rbox(0.05, 0.3, 0.03, 0.012), m: shell, p: [0, 0.48, -0.22], r: [-0.12, 0, 0] },
          { g: G.cyl(0.022, 0.022, 0.26, 10), m: chrome, p: [0, 0.24, 0] },
          { g: G.rbox(0.04, 0.03, 0.22, 0.012), m: shell, p: [-0.23, 0.58, -0.02] },
          { g: G.rbox(0.04, 0.03, 0.22, 0.012), m: shell, p: [0.23, 0.58, -0.02] },
          { g: G.rbox(0.025, 0.16, 0.025, 0.01), m: shell, p: [-0.23, 0.5, -0.06] },
          { g: G.rbox(0.025, 0.16, 0.025, 0.01), m: shell, p: [0.23, 0.5, -0.06] },
        ];
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          parts.push({ g: G.rbox(0.03, 0.025, 0.26, 0.01), m: chrome, p: [Math.sin(a) * 0.12, 0.07, Math.cos(a) * 0.12], r: [0, a, 0] });
          parts.push({ g: G.sphere(0.025, 10, 8), m: mat(P.black, { roughness: 0.6 }), p: [Math.sin(a) * 0.24, 0.025, Math.cos(a) * 0.24] });
        }
        return parts;
      }}
      {...p}
    />
  );
});

export const Stool = memo(function Stool({ color = '#e8c9b0', ...p }: { color?: string } & GP) {
  return (
    <Prefab
      k={`stool|${color}`}
      build={() => [
        { g: G.cyl(0.18, 0.17, 0.08, 20), m: mat(color, { roughness: 0.85 }), p: [0, 0.44, 0] },
        { g: G.cyl(0.02, 0.02, 0.42, 8), m: mat(P.woodDark, { roughness: 0.5 }), p: [0, 0.21, 0] },
        { g: G.cyl(0.14, 0.16, 0.02, 20), m: mat(P.woodDark, { roughness: 0.5 }), p: [0, 0.01, 0] },
      ]}
      {...p}
    />
  );
});

export const Sofa = memo(function Sofa({ color = '#c9dccf', pillow = '#f3d7c2', seats = 3, ...p }: { color?: string; pillow?: string; seats?: number } & GP) {
  return (
    <Prefab
      k={`sofa|${color}|${pillow}|${seats}`}
      build={() => {
        const fab = mat(color, { roughness: 0.92 });
        const fabDark = mat(new THREE.Color(color).multiplyScalar(0.92).getStyle(), { roughness: 0.92 });
        const w = 0.62 * seats;
        const parts: Part[] = [
          { g: G.rbox(w + 0.3, 0.2, 0.85, 0.06, 3), m: fabDark, p: [0, 0.16, 0] },
          { g: G.rbox(w + 0.3, 0.5, 0.2, 0.08, 3), m: fab, p: [0, 0.48, -0.33] },
          { g: G.rbox(0.18, 0.42, 0.85, 0.07, 3), m: fab, p: [-w / 2 - 0.08, 0.36, 0] },
          { g: G.rbox(0.18, 0.42, 0.85, 0.07, 3), m: fab, p: [w / 2 + 0.08, 0.36, 0] },
          { g: G.cyl(0.025, 0.02, 0.08, 8), m: mat(P.woodDark), p: [-w / 2, 0.03, 0.32] },
          { g: G.cyl(0.025, 0.02, 0.08, 8), m: mat(P.woodDark), p: [w / 2, 0.03, 0.32] },
        ];
        for (let i = 0; i < seats; i++) {
          parts.push({ g: G.rbox(0.6, 0.13, 0.62, 0.06, 3), m: fab, p: [-w / 2 + 0.31 + i * 0.62, 0.32, 0.06] });
        }
        parts.push({ g: G.rbox(0.36, 0.3, 0.12, 0.06, 3), m: mat(pillow, { roughness: 0.95 }), p: [-w / 2 + 0.28, 0.5, -0.18], r: [-0.2, 0.25, 0.08] });
        if (seats > 1) parts.push({ g: G.rbox(0.34, 0.28, 0.12, 0.06, 3), m: mat('#ffffff', { roughness: 0.95 }), p: [w / 2 - 0.28, 0.5, -0.18], r: [-0.2, -0.25, -0.08] });
        return parts;
      }}
      {...p}
    />
  );
});

/** Curved lounge sofa following an arc (atrium). */
export const CurvedSofa = memo(function CurvedSofa({ radius = 2.2, start = 0, length = Math.PI * 0.7, color = '#cfe0d6', ...p }: { radius?: number; start?: number; length?: number; color?: string } & GP) {
  return (
    <Prefab
      k={`csofa|${radius}|${start}|${length}|${color}`}
      build={() => {
        const fab = mat(color, { roughness: 0.92 });
        const fabDark = mat(new THREE.Color(color).multiplyScalar(0.93).getStyle(), { roughness: 0.92 });
        const parts: Part[] = [
          { g: G.arc(radius - 0.42, radius + 0.42, 0.26, start, length, 40), m: fabDark, p: [0, 0.03, 0] },
          { g: G.arc(radius + 0.22, radius + 0.46, 0.62, start, length, 40), m: fab, p: [0, 0.05, 0] },
        ];
        const n = Math.max(2, Math.round((length * radius) / 0.7));
        for (let i = 0; i < n; i++) {
          const a0 = start + (i / n) * length + 0.012;
          parts.push({ g: G.arc(radius - 0.38, radius + 0.2, 0.12, a0, length / n - 0.024, 10), m: fab, p: [0, 0.3, 0] });
        }
        return parts;
      }}
      {...p}
    />
  );
});

export const Armchair = memo(function Armchair({ color = '#f2d4c8', ...p }: { color?: string } & GP) {
  return (
    <Prefab
      k={`armchair|${color}`}
      build={() => {
        const fab = mat(color, { roughness: 0.92 });
        return [
          { g: G.rbox(0.72, 0.2, 0.72, 0.08, 3), m: fab, p: [0, 0.2, 0] },
          { g: G.rbox(0.72, 0.42, 0.18, 0.08, 3), m: fab, p: [0, 0.46, -0.28] },
          { g: G.rbox(0.14, 0.3, 0.66, 0.06, 3), m: fab, p: [-0.31, 0.38, 0] },
          { g: G.rbox(0.14, 0.3, 0.66, 0.06, 3), m: fab, p: [0.31, 0.38, 0] },
          { g: G.rbox(0.5, 0.1, 0.52, 0.05, 3), m: fab, p: [0, 0.34, 0.06] },
          { g: G.cyl(0.02, 0.016, 0.1, 8), m: mat(P.woodDark), p: [-0.28, 0.05, 0.28] },
          { g: G.cyl(0.02, 0.016, 0.1, 8), m: mat(P.woodDark), p: [0.28, 0.05, 0.28] },
          { g: G.cyl(0.02, 0.016, 0.1, 8), m: mat(P.woodDark), p: [-0.28, 0.05, -0.28] },
          { g: G.cyl(0.02, 0.016, 0.1, 8), m: mat(P.woodDark), p: [0.28, 0.05, -0.28] },
        ];
      }}
      {...p}
    />
  );
});

/* ================================================================== tables */

export const RoundTable = memo(function RoundTable({ r = 0.55, h = 0.62, top = P.white, ...p }: { r?: number; h?: number; top?: string } & GP) {
  return (
    <Prefab
      k={`rtable|${r}|${h}|${top}`}
      build={() => [
        { g: G.cyl(r, r, 0.04, 40), m: mat(top, { roughness: 0.45 }), p: [0, h, 0] },
        { g: G.cyl(0.035, 0.035, h - 0.02, 12), m: mat(P.chrome, { metalness: 0.6, roughness: 0.3 }), p: [0, h / 2, 0] },
        { g: G.cyl(r * 0.45, r * 0.5, 0.025, 28), m: mat(P.chrome, { metalness: 0.6, roughness: 0.3 }), p: [0, 0.012, 0] },
      ]}
      {...p}
    />
  );
});

export const CoffeeTable = memo(function CoffeeTable({ r = 0.42, ...p }: { r?: number } & GP) {
  return (
    <Prefab
      k={`coffee|${r}`}
      build={() => [
        { g: G.cyl(r, r * 0.96, 0.05, 36), m: mat(P.wood, { roughness: 0.55 }), p: [0, 0.32, 0] },
        { g: G.cyl(r * 0.85, r * 0.85, 0.02, 36), m: mat(P.woodDark, { roughness: 0.55 }), p: [0, 0.06, 0] },
        { g: G.cyl(0.03, 0.03, 0.28, 8), m: mat(P.woodDark), p: [0, 0.18, 0] },
      ]}
      {...p}
    />
  );
});

export const MeetingTable = memo(function MeetingTable({ w = 2.2, d = 1.0, ...p }: { w?: number; d?: number } & GP) {
  return (
    <Prefab
      k={`mtable|${w}|${d}`}
      build={() => [
        { g: G.rbox(w, 0.05, d, 0.04, 3), m: mat(P.woodLight, { roughness: 0.5 }), p: [0, 0.62, 0] },
        { g: G.rbox(0.08, 0.6, d * 0.6, 0.03), m: mat(P.white), p: [-w / 2 + 0.3, 0.3, 0] },
        { g: G.rbox(0.08, 0.6, d * 0.6, 0.03), m: mat(P.white), p: [w / 2 - 0.3, 0.3, 0] },
      ]}
      {...p}
    />
  );
});

/* ================================================================== plants */

function leafRing(parts: Part[], opts: { n: number; y: number; len: number; width: number; tilt: number; bend: number; leafM: THREE.Material; leafM2: THREE.Material; seed: number; shape?: 'long' | 'round'; spread?: number }) {
  for (let i = 0; i < opts.n; i++) {
    const a = (i / opts.n) * Math.PI * 2 + opts.seed * 0.7 + (i % 2) * 0.3;
    const tilt = opts.tilt + ((i * 37) % 7) * 0.04;
    const ll = opts.len * (0.82 + ((i * 13) % 5) * 0.06);
    parts.push({
      g: G.leaf(ll, opts.width, opts.bend, opts.shape),
      m: i % 3 === 0 ? opts.leafM2 : opts.leafM,
      p: [Math.sin(a) * (opts.spread ?? 0.02), opts.y + ((i * 7) % 4) * 0.03, Math.cos(a) * (opts.spread ?? 0.02)],
      r: [tilt, a, 0],
    });
  }
}

export type PlantKind = 'palm' | 'bush' | 'tall' | 'snake' | 'small' | 'tree' | 'hanging';

export const Plant = memo(function Plant({ kind = 'palm', pot = 'white', scale = 1, seed = 1, ...p }: { kind?: PlantKind; pot?: 'white' | 'terracotta' | 'sage' | 'blush'; scale?: number; seed?: number } & GP) {
  return (
    <group scale={scale} {...p}>
      <Prefab
        k={`plant|${kind}|${pot}|${seed % 3}`}
        build={() => {
          const potColor = { white: P.pot, terracotta: P.potTerracotta, sage: '#cfe0d2', blush: '#f3d6dc' }[pot];
          const potM = glossy(potColor, { roughness: 0.45, clearcoat: 0.3 });
          const leafM = mat(P.leaf, { roughness: 0.6, side: DS });
          const leafM2 = mat(kind === 'snake' ? '#8fb86a' : P.leafDark, { roughness: 0.6, side: DS });
          const leafM3 = mat(P.leafLight, { roughness: 0.6, side: DS });
          const stem = mat('#6f8d4f', { roughness: 0.7 });
          const parts: Part[] = [];
          const big = kind === 'tree' || kind === 'tall';
          const pr = kind === 'small' ? 0.09 : big ? 0.24 : 0.17;
          const ph = kind === 'small' ? 0.12 : big ? 0.42 : 0.3;
          parts.push({ g: G.lathe(`pot${pr}${ph}`, [[0, 0], [pr * 0.78, 0], [pr * 0.86, ph * 0.1], [pr, ph * 0.85], [pr * 1.04, ph], [pr * 0.92, ph], [0, ph * 0.94]], 28), m: potM });
          parts.push({ g: G.cyl(pr * 0.9, pr * 0.9, 0.01, 24), m: mat(P.soil, { roughness: 1 }), p: [0, ph * 0.93, 0], shadow: false });
          const base = ph * 0.92;
          if (kind === 'palm') {
            leafRing(parts, { n: 12, y: base + 0.05, len: 0.66, width: 0.16, tilt: 0.8, bend: 0.42, leafM, leafM2, seed });
            leafRing(parts, { n: 9, y: base + 0.12, len: 0.6, width: 0.14, tilt: 0.42, bend: 0.38, leafM: leafM3, leafM2: leafM, seed: seed + 2 });
            leafRing(parts, { n: 4, y: base + 0.15, len: 0.5, width: 0.11, tilt: 0.12, bend: 0.25, leafM, leafM2: leafM3, seed: seed + 5 });
          } else if (kind === 'bush' || kind === 'small') {
            const s = kind === 'small' ? 0.55 : 1;
            leafRing(parts, { n: 14, y: base, len: 0.34 * s, width: 0.2 * s, tilt: 1.0, bend: 0.25, leafM, leafM2, seed, shape: 'round' });
            leafRing(parts, { n: 11, y: base + 0.05 * s, len: 0.33 * s, width: 0.2 * s, tilt: 0.6, bend: 0.25, leafM: leafM3, leafM2: leafM, seed: seed + 1, shape: 'round' });
            leafRing(parts, { n: 5, y: base + 0.08 * s, len: 0.26 * s, width: 0.15 * s, tilt: 0.2, bend: 0.2, leafM, leafM2: leafM3, seed: seed + 3, shape: 'round' });
          } else if (kind === 'snake') {
            leafRing(parts, { n: 9, y: base, len: 0.55, width: 0.07, tilt: 0.12, bend: 0.05, leafM: leafM2, leafM2: leafM, seed, spread: 0.05 });
          } else if (kind === 'tall') {
            parts.push({ g: G.cyl(0.018, 0.024, 1.1, 8), m: stem, p: [0, base + 0.55, 0] });
            for (let l = 0; l < 5; l++) {
              leafRing(parts, { n: 5, y: base + 0.35 + l * 0.18, len: 0.3, width: 0.2, tilt: 0.9 - l * 0.12, bend: 0.2, leafM: l % 2 ? leafM : leafM3, leafM2, seed: seed + l, shape: 'round', spread: 0.03 });
            }
          } else if (kind === 'tree') {
            parts.push({ g: G.cyl(0.04, 0.06, 1.4, 10), m: mat('#8a6a4f', { roughness: 0.9 }), p: [0, base + 0.7, 0] });
            for (let l = 0; l < 4; l++) {
              leafRing(parts, { n: 10, y: base + 1.05 + l * 0.15, len: 0.75 - l * 0.08, width: 0.16, tilt: 1.1 - l * 0.22, bend: 0.4, leafM: l % 2 ? leafM3 : leafM, leafM2, seed: seed + l * 3, spread: 0.04 });
            }
          } else if (kind === 'hanging') {
            leafRing(parts, { n: 12, y: base, len: 0.4, width: 0.09, tilt: 1.9, bend: 0.1, leafM, leafM2: leafM3, seed });
          }
          return parts;
        }}
      />
    </group>
  );
});

/** Planter box with a row of plants (used on glass partitions and along walls). */
export const Planter = memo(function Planter({ length = 1.4, ...p }: { length?: number } & GP) {
  const n = Math.max(2, Math.round(length / 0.45));
  return (
    <group {...p}>
      <Prefab k={`planter|${length}`} build={() => [{ g: G.rbox(length, 0.32, 0.36, 0.04), m: mat('#f1ebe4', { roughness: 0.6 }), p: [0, 0.16, 0] }]} />
      {Array.from({ length: n }).map((_, i) => (
        <Plant key={i} kind={i % 2 ? 'bush' : 'snake'} scale={0.8} position={[-length / 2 + (i + 0.5) * (length / n), 0.08, 0]} seed={i} />
      ))}
    </group>
  );
});

/* ================================================================== storage & walls */

export const Bookshelf = memo(function Bookshelf({ w = 1.2, h = 1.4, color = P.white, seed = 1, plants = true, ...p }: { w?: number; h?: number; color?: string; seed?: number; plants?: boolean } & GP) {
  const shelves = Math.max(2, Math.round(h / 0.38));
  return (
    <group {...p}>
      <Prefab
        k={`shelf|${w}|${h}|${color}`}
        build={() => {
          const m = mat(color, { roughness: 0.55 });
          const parts: Part[] = [
            { g: G.rbox(0.035, h, 0.32, 0.01), m, p: [-w / 2, h / 2, 0] },
            { g: G.rbox(0.035, h, 0.32, 0.01), m, p: [w / 2, h / 2, 0] },
            { g: G.rbox(w, h, 0.015, 0.005), m: mat(new THREE.Color(color).multiplyScalar(0.96).getStyle()), p: [0, h / 2, -0.15] },
          ];
          for (let i = 0; i <= shelves; i++) parts.push({ g: G.rbox(w, 0.03, 0.32, 0.008), m, p: [0, (i / shelves) * (h - 0.03) + 0.015, 0] });
          return parts;
        }}
      />
      {Array.from({ length: shelves }).map((_, i) => {
        const y = (i / shelves) * (h - 0.03) + 0.03;
        const show = (i + seed) % 3 !== 2;
        return show ? (
          <mesh key={i} position={[-w * 0.12, y + 0.14, 0.02]} material={basic('#ffffff', { map: booksTexture(seed * 5 + i), transparent: true })}>
            <planeGeometry args={[w * 0.7, 0.28]} />
          </mesh>
        ) : plants ? (
          <Plant key={i} kind="small" position={[w * 0.18, y, 0]} seed={i + seed} />
        ) : null;
      })}
      {plants && <Plant kind="small" position={[w * 0.32, (1 / shelves) * (h - 0.03) + 0.03, 0]} seed={seed + 2} pot="blush" />}
    </group>
  );
});

export const Cabinet = memo(function Cabinet({ w = 0.9, h = 0.75, color = P.offWhite, ...p }: { w?: number; h?: number; color?: string } & GP) {
  return (
    <Prefab
      k={`cabinet|${w}|${h}|${color}`}
      build={() => [
        { g: G.rbox(w, h, 0.42, 0.02), m: mat(color, { roughness: 0.5 }), p: [0, h / 2, 0] },
        { g: G.rbox(w - 0.04, 0.012, 0.01, 0.004), m: mat(P.wallShade), p: [0, h * 0.5, 0.212] },
        { g: G.rbox(0.12, 0.014, 0.02, 0.006), m: mat(P.metal, { metalness: 0.5, roughness: 0.3 }), p: [-w / 4, h * 0.75, 0.22] },
        { g: G.rbox(0.12, 0.014, 0.02, 0.006), m: mat(P.metal, { metalness: 0.5, roughness: 0.3 }), p: [-w / 4, h * 0.25, 0.22] },
        { g: G.rbox(0.12, 0.014, 0.02, 0.006), m: mat(P.metal, { metalness: 0.5, roughness: 0.3 }), p: [w / 4, h * 0.75, 0.22] },
        { g: G.rbox(0.12, 0.014, 0.02, 0.006), m: mat(P.metal, { metalness: 0.5, roughness: 0.3 }), p: [w / 4, h * 0.25, 0.22] },
      ]}
      {...p}
    />
  );
});

/** Wall-mounted board/screen. `kind` selects a painted texture. */
export const WallBoard = memo(function WallBoard({ w = 1.4, h = 0.85, board, screen, accent = '#8fb3e8', seed = 1, frame = P.white, ...p }: { w?: number; h?: number; board?: Parameters<typeof boardTexture>[0]; screen?: ScreenKind; accent?: string; seed?: number; frame?: string } & GP) {
  const tex = screen ? screenTexture(screen, accent, seed) : boardTexture(board ?? 'sticky', seed);
  return (
    <group {...p}>
      <Prefab k={`wboard|${w}|${h}|${screen ? 'dark' : frame}`} build={() => [{ g: G.rbox(w + 0.06, h + 0.06, 0.04, 0.02), m: mat(screen ? P.screenFrame : frame, { roughness: screen ? 0.3 : 0.5 }) }]} />
      <mesh position={[0, 0, 0.022]} material={basic('#ffffff', { map: tex, toneMapped: !screen })}>
        <planeGeometry args={[w, h]} />
      </mesh>
    </group>
  );
});

export const ArtFrame = memo(function ArtFrame({ seed = 1, w = 0.42, h = 0.54, frame = P.woodLight, ...p }: { seed?: number; w?: number; h?: number; frame?: string } & GP) {
  return (
    <group {...p}>
      <Prefab k={`art|${w}|${h}|${frame}`} shadows={false} build={() => [{ g: G.rbox(w, h, 0.03, 0.008), m: mat(frame, { roughness: 0.6 }) }]} />
      <mesh position={[0, 0, 0.017]} material={basic('#ffffff', { map: artTexture(seed) })}>
        <planeGeometry args={[w - 0.06, h - 0.06]} />
      </mesh>
    </group>
  );
});

export const Whiteboard = memo(function Whiteboard({ board = 'roadmap' as Parameters<typeof boardTexture>[0], seed = 2, ...p }: { board?: Parameters<typeof boardTexture>[0]; seed?: number } & GP) {
  return (
    <group {...p}>
      <Prefab
        k="whiteboard-stand"
        build={() => {
          const m = mat(P.metal, { metalness: 0.5, roughness: 0.3 });
          return [
            { g: G.rbox(0.03, 1.5, 0.03, 0.01), m, p: [-0.62, 0.75, 0] },
            { g: G.rbox(0.03, 1.5, 0.03, 0.01), m, p: [0.62, 0.75, 0] },
            { g: G.rbox(0.03, 0.03, 0.4, 0.01), m, p: [-0.62, 0.02, 0] },
            { g: G.rbox(0.03, 0.03, 0.4, 0.01), m, p: [0.62, 0.02, 0] },
          ];
        }}
      />
      <WallBoard w={1.2} h={0.8} board={board} seed={seed} position={[0, 1.05, 0]} />
    </group>
  );
});

export const Rug = memo(function Rug({ w = 2.4, d = 1.6, color = '#efe2f3', round = false, pattern = 'border' as 'border' | 'rings' | 'plain', ...p }: { w?: number; d?: number; color?: string; round?: boolean; pattern?: 'border' | 'rings' | 'plain' } & GP) {
  const m = mat('#ffffff', { roughness: 1, map: rugTexture(color, round ? 'rings' : pattern) });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} receiveShadow material={m} {...(p as any)}>
      {round ? <circleGeometry args={[w / 2, 48]} /> : <planeGeometry args={[w, d]} />}
    </mesh>
  );
});

export const FloorLamp = memo(function FloorLamp(p: GP) {
  return (
    <Prefab
      k="floorlamp"
      build={() => [
        { g: G.cyl(0.14, 0.15, 0.025, 20), m: mat(P.charcoal), p: [0, 0.012, 0] },
        { g: G.cyl(0.012, 0.012, 1.35, 8), m: mat(P.charcoal), p: [0, 0.68, 0] },
        { g: G.lathe('lampshade', [[0.08, 0], [0.2, 0.0], [0.15, 0.22], [0.07, 0.22]], 24), m: mat('#fff3e2', { roughness: 0.9, side: DS, emissive: '#ffe2b8', emissiveIntensity: 0.35 }), p: [0, 1.28, 0] },
      ]}
      {...p}
    />
  );
});

/* ================================================================== architecture */

export const GlassPanel = memo(function GlassPanel({ length, height = 1.05, frame = '#e9e4df', ...p }: { length: number; height?: number; frame?: string } & GP) {
  const posts = Math.max(1, Math.round(length / 2.6));
  return (
    <group {...p}>
      <Prefab
        k={`gframe|${length}|${height}|${frame}`}
        build={() => {
          const m = mat(frame, { roughness: 0.35, metalness: 0.3 });
          const parts: Part[] = [
            { g: G.rbox(length, 0.04, 0.06, 0.012), m, p: [0, height, 0] },
            { g: G.rbox(length, 0.06, 0.08, 0.012), m, p: [0, 0.03, 0] },
          ];
          for (let i = 0; i <= posts; i++) parts.push({ g: G.rbox(0.035, height, 0.05, 0.01), m, p: [-length / 2 + (i * length) / posts, height / 2, 0] });
          return parts;
        }}
      />
      <mesh position={[0, height / 2 + 0.02, 0]} material={glass('#d3e4f1', 0.3)} renderOrder={2}>
        <planeGeometry args={[length, height - 0.04]} />
      </mesh>
    </group>
  );
});

/** Solid partition wall with soft top trim. */
export const Wall = memo(function Wall({ length, height = 1.55, color = P.wall, thickness = 0.12, ...p }: { length: number; height?: number; color?: string; thickness?: number } & GP) {
  return (
    <Prefab
      k={`wall|${length}|${height}|${color}|${thickness}`}
      build={() => [
        { g: G.rbox(length, height, thickness, 0.03), m: mat(color, { roughness: 0.9 }), p: [0, height / 2, 0] },
        { g: G.rbox(length + 0.02, 0.04, thickness + 0.03, 0.015), m: mat('#ffffff', { roughness: 0.5 }), p: [0, height, 0] },
        { g: G.rbox(length, 0.08, thickness + 0.02, 0.01), m: mat(new THREE.Color(color).multiplyScalar(0.94).getStyle(), { roughness: 0.8 }), p: [0, 0.04, 0] },
      ]}
      {...p}
    />
  );
});

export const ReceptionDesk = memo(function ReceptionDesk({ brand = '#7c83e8', ...p }: { brand?: string } & GP) {
  return (
    <group {...p}>
      <Prefab
        k={`reception|${brand}`}
        build={() => [
          { g: G.arc(1.25, 1.65, 0.92, Math.PI * 0.18, Math.PI * 0.64, 48), m: mat(P.white, { roughness: 0.45 }) },
          { g: G.arc(1.2, 1.72, 0.05, Math.PI * 0.16, Math.PI * 0.68, 48), m: mat(P.woodLight, { roughness: 0.45 }), p: [0, 0.92, 0] },
          { g: G.arc(1.66, 1.69, 0.12, Math.PI * 0.2, Math.PI * 0.6, 48), m: mat(brand, { roughness: 0.4, emissive: brand, emissiveIntensity: 0.25 }), p: [0, 0.38, 0] },
        ]}
      />
    </group>
  );
});
