import * as THREE from 'three';

/**
 * Shared material library. Materials are cached by key so the whole office reuses a small set of
 * GPU programs and uniforms — important for draw-call batching and memory.
 */
const cache = new Map<string, THREE.Material>();

export interface MatOpts {
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  map?: THREE.Texture | null;
  side?: THREE.Side;
  flatShading?: boolean;
  envMapIntensity?: number;
  depthWrite?: boolean;
}

export function mat(color: string, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `std|${color}|${JSON.stringify({ ...o, map: o.map?.uuid })}`;
  let m = cache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: o.roughness ?? 0.75,
      metalness: o.metalness ?? 0,
      emissive: o.emissive ? new THREE.Color(o.emissive) : new THREE.Color('#000000'),
      emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: o.transparent ?? false,
      opacity: o.opacity ?? 1,
      map: o.map ?? null,
      side: o.side ?? THREE.FrontSide,
      flatShading: o.flatShading ?? false,
      envMapIntensity: o.envMapIntensity ?? 0.6,
      depthWrite: o.depthWrite ?? true,
    });
    cache.set(key, m);
  }
  return m;
}

/** Physical material for glossy things (robot shells, ceramic, glass). */
export function glossy(color: string, o: { roughness?: number; clearcoat?: number; metalness?: number; envMapIntensity?: number } = {}): THREE.MeshPhysicalMaterial {
  const key = `phys|${color}|${JSON.stringify(o)}`;
  let m = cache.get(key) as THREE.MeshPhysicalMaterial | undefined;
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      roughness: o.roughness ?? 0.28,
      metalness: o.metalness ?? 0,
      clearcoat: o.clearcoat ?? 0.6,
      clearcoatRoughness: 0.25,
      envMapIntensity: o.envMapIntensity ?? 1,
    });
    cache.set(key, m);
  }
  return m;
}

export function glass(tintColor = '#dfeaf3', opacity = 0.22): THREE.MeshStandardMaterial {
  return mat(tintColor, { roughness: 0.08, metalness: 0.1, transparent: true, opacity, envMapIntensity: 1.2, depthWrite: false });
}

export function basic(color: string, o: { transparent?: boolean; opacity?: number; map?: THREE.Texture | null; toneMapped?: boolean } = {}) {
  const key = `basic|${color}|${o.opacity}|${o.map?.uuid}|${o.toneMapped}`;
  let m = cache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: o.transparent ?? false, opacity: o.opacity ?? 1, map: o.map ?? null, toneMapped: o.toneMapped ?? true });
    cache.set(key, m);
  }
  return m;
}

/** Common palette for the office (warm, soft, low-saturation). */
export const P = {
  floor: '#efe7de',
  floorTile: '#f3ece4',
  wall: '#f6f0ea',
  wallShade: '#ece3da',
  white: '#fbfaf8',
  offWhite: '#f2eee9',
  wood: '#d9b994',
  woodLight: '#e6cfb2',
  woodDark: '#a87c58',
  metal: '#c9ccd3',
  chrome: '#d7dae0',
  charcoal: '#2f2d35',
  black: '#1f1e24',
  screenFrame: '#25242b',
  leaf: '#7fae6b',
  leafDark: '#5f9256',
  leafLight: '#9cc480',
  pot: '#f4efe8',
  potTerracotta: '#d89a78',
  soil: '#6b5444',
  gold: '#cfaa6a',
};
