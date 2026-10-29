'use client';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { memo, type ComponentProps } from 'react';

/**
 * Prefab system: a furniture piece is described as a list of primitive parts. Parts are merged into
 * ONE geometry per material and cached per prefab key, so a detailed desk renders in 2–3 draw calls
 * and every instance of it shares the same GPU buffers.
 */
export interface Part {
  g: THREE.BufferGeometry;
  m: THREE.Material;
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number] | number;
  shadow?: boolean;
}

export interface BuiltPrefab {
  meshes: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material; castShadow: boolean }>;
}

const prefabCache = new Map<string, BuiltPrefab>();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function prepare(part: Part): THREE.BufferGeometry {
  let g = part.g.index ? part.g.toNonIndexed() : part.g.clone();
  // Ensure all merged geometries share the same attribute set.
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute('position').count) * 2), 2));
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  const s = part.s === undefined ? [1, 1, 1] : typeof part.s === 'number' ? [part.s, part.s, part.s] : part.s;
  _e.set(...(part.r ?? [0, 0, 0]));
  _q.setFromEuler(_e);
  _m.compose(new THREE.Vector3(...(part.p ?? [0, 0, 0])), _q, new THREE.Vector3(...(s as [number, number, number])));
  g.applyMatrix4(_m);
  return g;
}

export function buildPrefab(key: string, build: () => Part[]): BuiltPrefab {
  const hit = prefabCache.get(key);
  if (hit) return hit;
  const parts = build();
  const groups = new Map<string, { m: THREE.Material; gs: THREE.BufferGeometry[]; shadow: boolean }>();
  for (const part of parts) {
    const k = part.m.uuid + (part.shadow === false ? '|ns' : '');
    if (!groups.has(k)) groups.set(k, { m: part.m, gs: [], shadow: part.shadow !== false });
    groups.get(k)!.gs.push(prepare(part));
  }
  const built: BuiltPrefab = {
    meshes: [...groups.values()].map(({ m, gs, shadow }) => {
      const merged = mergeGeometries(gs, false)!;
      merged.computeBoundingSphere();
      return { geometry: merged, material: m, castShadow: shadow };
    }),
  };
  prefabCache.set(key, built);
  return built;
}

export const Prefab = memo(function Prefab({ k, build, shadows = true, ...props }: { k: string; build: () => Part[]; shadows?: boolean } & ComponentProps<'group'>) {
  const pf = buildPrefab(k, build);
  return (
    <group {...props}>
      {pf.meshes.map((m, i) => (
        <mesh key={i} geometry={m.geometry} material={m.material} castShadow={shadows && m.castShadow} receiveShadow />
      ))}
    </group>
  );
});

/* ------------------------------------------------------------------ primitive geometry cache */
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export const G = {
  rbox: (w: number, h: number, d: number, r = 0.02, seg = 2) => cached(`rbox|${w}|${h}|${d}|${r}|${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4))),
  box: (w: number, h: number, d: number) => cached(`box|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)),
  cyl: (rt: number, rb: number, h: number, seg = 20, open = false, thetaStart = 0, thetaLength = Math.PI * 2) =>
    cached(`cyl|${rt}|${rb}|${h}|${seg}|${open}|${thetaStart}|${thetaLength}`, () => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, thetaStart, thetaLength)),
  sphere: (r: number, ws = 24, hs = 16, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0, thetaLength = Math.PI) =>
    cached(`sph|${r}|${ws}|${hs}|${phiStart}|${phiLength}|${thetaStart}|${thetaLength}`, () => new THREE.SphereGeometry(r, ws, hs, phiStart, phiLength, thetaStart, thetaLength)),
  torus: (r: number, tube: number, rs = 10, ts = 28, arc = Math.PI * 2) => cached(`tor|${r}|${tube}|${rs}|${ts}|${arc}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc)),
  capsule: (r: number, len: number, cs = 6, rs = 14) => cached(`cap|${r}|${len}|${cs}|${rs}`, () => new THREE.CapsuleGeometry(r, len, cs, rs)),
  cone: (r: number, h: number, seg = 16) => cached(`cone|${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  plane: (w: number, h: number) => cached(`plane|${w}|${h}`, () => new THREE.PlaneGeometry(w, h)),
  circle: (r: number, seg = 40) => cached(`circle|${r}|${seg}`, () => new THREE.CircleGeometry(r, seg)),
  lathe: (key: string, pts: Array<[number, number]>, seg = 32, phiStart = 0, phiLength = Math.PI * 2) =>
    cached(`lathe|${key}|${seg}|${phiStart}|${phiLength}`, () => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg, phiStart, phiLength)),
  /** Ring sector extruded upward (curved desks, curved sofas). */
  arc: (inner: number, outer: number, height: number, start: number, length: number, seg = 32) =>
    cached(`arc|${inner}|${outer}|${height}|${start}|${length}|${seg}`, () => {
      const s = new THREE.Shape();
      s.absarc(0, 0, outer, start, start + length, false);
      s.absarc(0, 0, inner, start + length, start, true);
      const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: seg });
      g.rotateX(-Math.PI / 2);
      return g;
    }),
  /** Smooth bent leaf blade (length along +Y), used by all plants. */
  leaf: (len: number, width: number, bend = 0.25, shape: 'long' | 'round' = 'long') =>
    cached(`leaf|${len}|${width}|${bend}|${shape}`, () => {
      const g = new THREE.PlaneGeometry(width, len, 4, 8);
      const pos = g.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i) + len / 2; // 0..len
        const t = Math.min(1, Math.max(0, y / len));
        const taper = shape === 'round' ? Math.max(0, Math.sin(Math.PI * Math.min(1, t * 1.05))) ** 0.7 : Math.max(0, Math.sin(Math.PI * t)) ** 0.9 * (1 - t * 0.35);
        const nx = x * taper;
        const z = bend * len * t * t - Math.abs(nx) * 0.35; // droop + slight V-fold
        pos.setXYZ(i, nx, y, z);
      }
      g.computeVertexNormals();
      return g;
    }),
};
