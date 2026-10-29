'use client';
import * as THREE from 'three';
import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import type { MapControls as MapControlsImpl } from 'three-stdlib';
import type { DeptTheme } from '@space/shared';
import { Room, type RoomPerson, type RoomAgent } from './Room';
import { Atrium } from './Atrium';
import { Plant } from './furniture';
import { Prefab, G } from './lib/prefab';
import { mat, glass, P } from './lib/materials';
import { floorTexture } from './lib/textures';

export interface SceneRoom {
  id: string;
  name: string;
  theme: DeptTheme;
  color: string;
  memberCount: number;
  x: number;
  z: number;
  w: number;
  d: number;
  people: RoomPerson[];
  agents: RoomAgent[];
}

export interface SceneProps {
  rooms: SceneRoom[];
  floor: number;
  orgName: string;
  brand: string;
  focus: boolean;
  animate: boolean;
  selectedDept: string | null;
  selectedEntityId: string | null;
  centralAgents: RoomAgent[];
  onSelectDept: (id: string | null) => void;
  onSelectEntity: (kind: 'member' | 'agent', id: string, screen: { x: number; y: number }) => void;
  onHover: (h: { kind: 'member' | 'agent'; id: string; name: string } | null) => void;
  zoomCommand: { n: number; dir: 1 | -1 | 0 } | null;
  /** DOM layer holding the department/reception labels; positioned every rendered frame. */
  labelLayer: React.RefObject<HTMLDivElement | null>;
}

const ISO_DIR = new THREE.Vector3(1, 0.86, 1).normalize();
const CAM_DIST = 60;

/** Bounds of all rooms + atrium on the floor. */
function boundsOf(rooms: SceneRoom[]) {
  const b = new THREE.Box2(new THREE.Vector2(-4, -3.6), new THREE.Vector2(4, 3.6));
  for (const r of rooms) {
    b.expandByPoint(new THREE.Vector2(r.x - r.w / 2, r.z - r.d / 2));
    b.expandByPoint(new THREE.Vector2(r.x + r.w / 2, r.z + r.d / 2));
  }
  return b;
}

const _right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), ISO_DIR).normalize().negate();
const _up = new THREE.Vector3().crossVectors(ISO_DIR, _right).normalize().negate();

/** Fit a floor rectangle (plus wall height) into the viewport: returns zoom and the look-at target. */
function fitView(minX: number, minZ: number, maxX: number, maxZ: number, vw: number, vh: number, pad = 1.04, height = 2.7) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const x of [minX, maxX])
    for (const z of [minZ, maxZ])
      for (const y of [0, height]) {
        const p = new THREE.Vector3(x, y, z);
        const sx = p.dot(_right),
          sy = p.dot(_up);
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      }
  const zoom = Math.min(vw / ((x1 - x0) * pad), vh / ((y1 - y0) * pad));
  const target = _right.clone().multiplyScalar((x0 + x1) / 2).addScaledVector(_up, (y0 + y1) / 2);
  return { zoom, target };
}

function CameraRig({ rooms, selectedDept, zoomCommand }: { rooms: SceneRoom[]; selectedDept: string | null; zoomCommand: SceneProps['zoomCommand'] }) {
  const controls = useRef<MapControlsImpl>(null);
  const { camera, size, invalidate } = useThree();
  const bounds = useMemo(() => boundsOf(rooms), [rooms]);
  const goal = useRef<{ target: THREE.Vector3; zoom: number } | null>(null);
  const overview = useMemo(() => fitView(bounds.min.x, bounds.min.y, bounds.max.x, bounds.max.y, size.width, size.height), [bounds, size.width, size.height]);
  const overviewZoom = overview.zoom * 1.45;

  // Initial framing + whenever the selection changes.
  useEffect(() => {
    let target = overview.target;
    let zoom = overviewZoom;
    if (selectedDept) {
      const r = rooms.find((x) => x.id === selectedDept);
      if (r) ({ target, zoom } = fitView(r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2, size.width, size.height, 1.1, 1.8));
    }
    goal.current = { target: target.clone(), zoom };
    invalidate();
  }, [selectedDept, rooms, overview, size.width, size.height, invalidate]);

  useEffect(() => {
    if (!zoomCommand || !controls.current) return;
    const cam = camera as THREE.OrthographicCamera;
    if (zoomCommand.dir === 0) {
      goal.current = { target: overview.target.clone(), zoom: overview.zoom };
    } else {
      goal.current = { target: controls.current.target.clone(), zoom: THREE.MathUtils.clamp(cam.zoom * (zoomCommand.dir > 0 ? 1.35 : 1 / 1.35), overview.zoom * 0.9, overviewZoom * 6) };
    }
    invalidate();
  }, [zoomCommand, camera, overview, overviewZoom, invalidate]);

  useFrame((_, dt) => {
    const ctl = controls.current;
    if (!ctl) return;
    const cam = camera as THREE.OrthographicCamera;
    if (goal.current) {
      const k = 1 - Math.pow(0.0015, dt); // frame-rate independent easing
      ctl.target.lerp(goal.current.target, k);
      cam.zoom = THREE.MathUtils.lerp(cam.zoom, goal.current.zoom, k);
      cam.position.copy(ctl.target).addScaledVector(ISO_DIR, CAM_DIST);
      cam.updateProjectionMatrix();
      if (ctl.target.distanceTo(goal.current.target) < 0.01 && Math.abs(cam.zoom - goal.current.zoom) < 0.05) goal.current = null;
      invalidate();
    }
    // keep the camera inside the building
    const minX = bounds.min.x - 6,
      maxX = bounds.max.x + 6,
      minZ = bounds.min.y - 6,
      maxZ = bounds.max.y + 6;
    const t = ctl.target;
    const cx = THREE.MathUtils.clamp(t.x, minX, maxX);
    const cz = THREE.MathUtils.clamp(t.z, minZ, maxZ);
    if (cx !== t.x || cz !== t.z) {
      const dx = cx - t.x,
        dz = cz - t.z;
      t.set(cx, t.y, cz);
      cam.position.x += dx;
      cam.position.z += dz;
    }
  });

  return (
    <MapControls
      ref={controls as never}
      makeDefault
      enableRotate={false}
      enableDamping
      dampingFactor={0.12}
      screenSpacePanning
      minZoom={overview.zoom * 0.9}
      maxZoom={overviewZoom * 7}
      zoomSpeed={0.8}
      onStart={() => (goal.current = null)}
    />
  );
}

export const CELL_X = 8;
export const CELL_Z = 7.2;

/** Floor plate follows the occupied grid cells (rooms + central atrium), with curtain walls on the far edges. */
function Building({ rooms, focus }: { rooms: SceneRoom[]; focus: boolean }) {
  const cells = useMemo(() => {
    const set = new Map<string, { cx: number; cz: number }>();
    const add = (x: number, z: number) => {
      const cx = Math.round(x / CELL_X),
        cz = Math.round(z / CELL_Z);
      set.set(`${cx},${cz}`, { cx, cz });
    };
    add(0, 0);
    rooms.forEach((r) => add(r.x, r.z));
    return [...set.values()];
  }, [rooms]);
  const has = (cx: number, cz: number) => cells.some((c) => c.cx === cx && c.cz === cz);
  const tex = useMemo(() => {
    const t = floorTexture('#f4e2d4', '#ead2c1', 64).clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(CELL_X / 2.4, CELL_Z / 2.4);
    t.needsUpdate = true;
    return t;
  }, []);
  const frame = mat('#e8e2db', { roughness: 0.4, metalness: 0.15 });
  return (
    <group>
      {cells.map(({ cx, cz }) => {
        const x = cx * CELL_X,
          z = cz * CELL_Z;
        return (
          <group key={`${cx},${cz}`} position={[x, 0, z]}>
            <mesh position={[0, -0.18, 0]} receiveShadow material={mat('#e7ddd2', { roughness: 0.9 })}>
              <boxGeometry args={[CELL_X + 0.02, 0.36, CELL_Z + 0.02]} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]} receiveShadow material={mat('#ffffff', { map: tex, roughness: 0.85 })}>
              <planeGeometry args={[CELL_X, CELL_Z]} />
            </mesh>
            {/* far-side curtain walls */}
            {!has(cx, cz - 1) && (
              <group position={[0, 0, -CELL_Z / 2]}>
                <mesh position={[0, 1.35, 0]} material={glass('#dbe8f2', 0.24)} renderOrder={1}>
                  <planeGeometry args={[CELL_X, 2.7]} />
                </mesh>
                <Prefab
                  k={`cw-x|${CELL_X}`}
                  build={() => [
                    { g: G.box(CELL_X, 0.07, 0.08), m: frame, p: [0, 2.7, 0] },
                    { g: G.box(CELL_X, 0.12, 0.12), m: frame, p: [0, 0.06, 0] },
                    ...[-0.5, -0.1667, 0.1667, 0.5].map((f) => ({ g: G.box(0.05, 2.7, 0.08), m: frame, p: [f * CELL_X, 1.35, 0] as [number, number, number] })),
                  ]}
                />
              </group>
            )}
            {!has(cx - 1, cz) && (
              <group position={[-CELL_X / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
                <mesh position={[0, 1.35, 0]} material={glass('#dbe8f2', 0.24)} renderOrder={1}>
                  <planeGeometry args={[CELL_Z, 2.7]} />
                </mesh>
                <Prefab
                  k={`cw-z|${CELL_Z}`}
                  build={() => [
                    { g: G.box(CELL_Z, 0.07, 0.08), m: frame, p: [0, 2.7, 0] },
                    { g: G.box(CELL_Z, 0.12, 0.12), m: frame, p: [0, 0.06, 0] },
                    ...[-0.5, -0.1667, 0.1667, 0.5].map((f) => ({ g: G.box(0.05, 2.7, 0.08), m: frame, p: [f * CELL_Z, 1.35, 0] as [number, number, number] })),
                  ]}
                />
              </group>
            )}
            {/* open edges toward the camera get a soft trim */}
            {!has(cx, cz + 1) && <mesh position={[0, 0.03, CELL_Z / 2 - 0.04]} material={mat('#efe7de')}><boxGeometry args={[CELL_X, 0.06, 0.08]} /></mesh>}
            {!has(cx + 1, cz) && <mesh position={[CELL_X / 2 - 0.04, 0.03, 0]} material={mat('#efe7de')}><boxGeometry args={[0.08, 0.06, CELL_Z]} /></mesh>}
            {!focus && !has(cx, cz + 1) && !has(cx + 1, cz) && <Plant kind="palm" position={[CELL_X / 2 - 0.45, 0, CELL_Z / 2 - 0.45]} seed={cx + cz + 9} scale={1.1} pot="terracotta" />}
          </group>
        );
      })}
    </group>
  );
}

export const OfficeScene = memo(function OfficeScene(props: SceneProps) {
  const { rooms, floor, orgName, brand, focus, animate, selectedDept, selectedEntityId } = props;
  const onEntity = (kind: 'member' | 'agent') => (id: string, e: ThreeEvent<MouseEvent>) => props.onSelectEntity(kind, id, { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  return (
    <>
      <CameraRig rooms={rooms} selectedDept={selectedDept} zoomCommand={props.zoomCommand} />
      <hemisphereLight args={['#fff6ec', '#e6d2bf', focus ? 1.1 : 0.95]} />
      <directionalLight
        position={[-13, 22, 7]}
        intensity={focus ? 1.6 : 3.1}
        color="#ffe9d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={4}
        onUpdate={(l: THREE.DirectionalLight) => l.shadow.camera.updateProjectionMatrix()}
      />
      <directionalLight position={[12, 10, 8]} intensity={0.85} color="#fff0e0" />
      <Building rooms={rooms} focus={focus} />
      <Atrium
        floor={floor}
        orgName={orgName}
        brand={brand}
        focus={focus}
        agents={props.centralAgents}
        onSelectAgent={onEntity('agent')}
        animate={animate}
      />
      {rooms.map((r, i) => (
        <group key={r.id} position={[r.x, 0, r.z]}>
          <Room
            theme={r.theme}
            color={r.color}
            w={r.w}
            d={r.d}
            people={r.people}
            agents={r.agents}
            focus={focus}
            seed={i * 3 + 1}
            highlighted={selectedDept === r.id}
            onSelectRoom={() => props.onSelectDept(r.id)}
            onSelectPerson={onEntity('member')}
            onSelectAgent={onEntity('agent')}
            onHover={props.onHover}
            selectedEntityId={selectedEntityId}
            animate={animate}
          />
        </group>
      ))}
      <LabelProjector rooms={rooms} floor={floor} layer={props.labelLayer} />
    </>
  );
});

/** World anchor for a department's label (top-left corner area of the room). */
export function roomLabelAnchor(r: { x: number; z: number; w: number; d: number }): [number, number, number] {
  return [r.x - r.w / 2 + 1.4, 1.75, r.z - r.d / 2 + 1.0];
}
export const RECEPTION_ANCHOR: [number, number, number] = [1.9, 1.35, 1.7];

/**
 * Projects label anchors to screen space and moves plain DOM labels that live outside the canvas.
 * (Replaces drei <Html>, which mounts a separate React root per label and warns on unmount.)
 */
function LabelProjector({ rooms, floor, layer }: { rooms: SceneRoom[]; floor: number; layer: React.RefObject<HTMLDivElement | null> }) {
  const anchors = useMemo(() => {
    const a = rooms.map((r) => ({ id: r.id, pos: new THREE.Vector3(...roomLabelAnchor(r)) }));
    if (floor === 1) a.push({ id: 'reception', pos: new THREE.Vector3(...RECEPTION_ANCHOR) });
    return a;
  }, [rooms, floor]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const root = layer.current;
    if (!root) return;
    for (const a of anchors) {
      const el = root.querySelector<HTMLElement>(`[data-anchor="${a.id}"]`);
      if (!el) continue;
      v.copy(a.pos).project(camera);
      // keep labels fully on screen and clear of the right-hand control rail (72px)
      const hw = el.offsetWidth / 2;
      const hh = el.offsetHeight / 2;
      const x = Math.min(Math.max(((v.x + 1) / 2) * size.width, hw + 12), size.width - hw - 76);
      const y = Math.min(Math.max(((1 - v.y) / 2) * size.height, hh + 12), size.height - hh - 64);
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      el.style.opacity = '1';
    }
  });
  return null;
}

export { P };
