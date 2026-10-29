'use client';
import * as THREE from 'three';
import { memo, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { normalizeRobot, ROBOT_THEME_COLORS, type RobotConfig } from '@space/shared';
import { G, Prefab, type Part } from './lib/prefab';
import { mat, glossy, basic } from './lib/materials';

/**
 * Friendly AI robot. Visual state is driven ONLY by real agent status from the API:
 *  idle               → calm eyes, slow hover
 *  queued / running   → eyes animate, orbiting "thinking" ring
 *  awaiting_approval  → amber beacon
 *  disabled           → greyed out, eyes off
 */
export type RobotStatus = 'idle' | 'queued' | 'running' | 'awaiting_approval' | 'disabled';

const SHELL = '#f6f7fb';

function shellParts(theme: string, ears: RobotConfig['ears']): Part[] {
  const col = ROBOT_THEME_COLORS[theme as keyof typeof ROBOT_THEME_COLORS] ?? '#8fb6f0';
  const shell = glossy(SHELL, { roughness: 0.22, clearcoat: 1 });
  const accent = glossy(col, { roughness: 0.3, clearcoat: 0.8 });
  const joint = glossy('#d9dde8', { roughness: 0.35 });
  const visor = glossy('#141a30', { roughness: 0.08, clearcoat: 1 });
  const parts: Part[] = [
    // head
    { g: G.sphere(0.27, 40, 28), m: shell, p: [0, 0.78, 0], s: [1.12, 0.92, 0.98] },
    { g: G.sphere(1, 36, 24, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.26, Math.PI * 0.42), m: visor, p: [0, 0.78, 0.012], s: [0.292, 0.255, 0.272] },
    // neck + body
    { g: G.cyl(0.06, 0.07, 0.06, 16), m: joint, p: [0, 0.52, 0] },
    { g: G.sphere(0.2, 32, 22), m: shell, p: [0, 0.36, 0], s: [1, 1.05, 0.9] },
    { g: G.cyl(0.075, 0.075, 0.02, 24), m: accent, p: [0, 0.39, 0.175], r: [Math.PI / 2, 0, 0] },
    { g: G.torus(0.2, 0.016, 8, 36), m: accent, p: [0, 0.26, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1] },
    // hover base
    { g: G.sphere(0.12, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m: joint, p: [0, 0.2, 0], s: [1, 0.7, 1] },
  ];
  if (ears === 'headphones' || ears === 'round') {
    for (const sx of [-1, 1]) {
      parts.push({ g: G.cyl(0.085, 0.085, 0.06, 24), m: accent, p: [sx * 0.3, 0.79, 0], r: [0, 0, Math.PI / 2] });
      parts.push({ g: G.cyl(0.055, 0.055, 0.065, 20), m: shell, p: [sx * 0.315, 0.79, 0], r: [0, 0, Math.PI / 2] });
    }
    if (ears === 'headphones') parts.push({ g: G.torus(0.31, 0.022, 10, 36, Math.PI), m: accent, p: [0, 0.8, -0.01] });
  } else if (ears === 'cat') {
    for (const sx of [-1, 1]) {
      parts.push({ g: G.cone(0.08, 0.16, 20), m: accent, p: [sx * 0.17, 1.02, -0.02], r: [0, 0, -sx * 0.35] });
      parts.push({ g: G.cone(0.05, 0.1, 16), m: shell, p: [sx * 0.165, 1.0, 0.01], r: [0, 0, -sx * 0.35] });
    }
  } else {
    parts.push({ g: G.cyl(0.012, 0.012, 0.14, 8), m: joint, p: [0, 1.06, 0] });
  }
  return parts;
}

function eyesParts(face: RobotConfig['face'], col: string, dim: boolean): Part[] {
  const glow = basic(dim ? '#55607a' : new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.35).getStyle(), { toneMapped: false });
  const z = 0.275;
  const parts: Part[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * 0.095;
    if (face === 'happy' || (face === 'wink' && sx === -1)) parts.push({ g: G.torus(0.04, 0.013, 8, 18, Math.PI), m: glow, p: [x, 0.77, z], r: [0, sx * 0.3, 0] });
    else if (face === 'wink') parts.push({ g: G.capsule(0.012, 0.06, 4, 8), m: glow, p: [x, 0.78, z], r: [0, sx * 0.3, Math.PI / 2] });
    else if (face === 'focused') parts.push({ g: G.rbox(0.07, 0.045, 0.01, 0.018), m: glow, p: [x, 0.785, z], r: [0, sx * 0.3, 0] });
    else parts.push({ g: G.sphere(0.04, 16, 12), m: glow, p: [x, 0.785, z - 0.01], r: [0, sx * 0.3, 0], s: [1, 1.15, 0.4] });
  }
  if (!dim) parts.push({ g: G.torus(0.025, 0.007, 6, 12, Math.PI), m: glow, p: [0, 0.71, z + 0.005], r: [0, 0, Math.PI] });
  return parts;
}

export const RobotModel = memo(function RobotModel({ config, status = 'idle', animate = true, seed = 0 }: { config: Partial<RobotConfig>; status?: RobotStatus; animate?: boolean; seed?: number }) {
  const c = useMemo(() => normalizeRobot(config), [config]);
  const col = ROBOT_THEME_COLORS[c.theme];
  const root = useRef<THREE.Group>(null);
  const eyes = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const beacon = useRef<THREE.Mesh>(null);
  const dim = status === 'disabled';
  const busy = status === 'running' || status === 'queued';

  useFrame(({ clock }) => {
    if (!animate) return;
    const t = clock.elapsedTime + seed * 2.1;
    if (root.current) {
      root.current.position.y = dim ? 0 : 0.04 + Math.sin(t * (busy ? 2.4 : 1.3)) * 0.025;
      root.current.rotation.y = Math.sin(t * 0.4) * 0.18;
    }
    if (eyes.current) eyes.current.scale.y = !dim && t % 3.7 < 0.1 ? 0.15 : 1;
    if (ring.current) ring.current.rotation.y = t * 2.2;
    if (armL.current) armL.current.rotation.z = 0.5 + Math.sin(t * (busy ? 6 : 1.2)) * (busy ? 0.25 : 0.06);
    if (armR.current) armR.current.rotation.z = -0.5 - Math.sin(t * (busy ? 6 : 1.2) + 1) * (busy ? 0.25 : 0.06);
    if (beacon.current) (beacon.current.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(t * 4) * 0.35;
  });

  return (
    <group>
      {/* soft floor glow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]} material={basic(dim ? '#b8bcc8' : col, { transparent: true, opacity: dim ? 0.15 : 0.28 })}>
        <circleGeometry args={[0.26, 32]} />
      </mesh>
      <group ref={root}>
        <Prefab k={`robot|${c.theme}|${c.ears}`} build={() => shellParts(c.theme, c.ears)} />
        <group ref={eyes} position={[0, 0.78, 0]}>
          <group position={[0, -0.78, 0]}>
            <Prefab k={`robot-eyes|${c.face}|${c.theme}|${dim}`} shadows={false} build={() => eyesParts(c.face, col, dim)} />
          </group>
        </group>
        {c.ears === 'antenna' && (
          <mesh position={[0, 1.14, 0]} material={basic(dim ? '#9aa1b2' : col, { toneMapped: false })}>
            <sphereGeometry args={[0.04, 16, 12]} />
          </mesh>
        )}
        {[1, -1].map((sx) => (
          <group key={sx} ref={sx === 1 ? armL : armR} position={[sx * 0.2, 0.42, 0]} rotation={[0, 0, sx * 0.5]}>
            <Prefab
              k={`robot-arm|${c.theme}`}
              build={() => [
                { g: G.capsule(0.04, 0.12, 6, 12), m: glossy(SHELL, { roughness: 0.25, clearcoat: 1 }), p: [0, -0.1, 0] },
                { g: G.sphere(0.045, 16, 12), m: glossy(col, { roughness: 0.3 }), p: [0, -0.2, 0] },
              ]}
            />
          </group>
        ))}
        {busy && (
          <group ref={ring} position={[0, 0.78, 0]}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.42, 0.18, Math.sin((i / 3) * Math.PI * 2) * 0.42]} material={basic(col, { toneMapped: false })}>
                <sphereGeometry args={[0.03, 12, 8]} />
              </mesh>
            ))}
          </group>
        )}
        {status === 'awaiting_approval' && (
          <mesh ref={beacon} position={[0, 1.22, 0]} material={new THREE.MeshBasicMaterial({ color: '#f5b04a', transparent: true, opacity: 0.8, toneMapped: false })}>
            <sphereGeometry args={[0.055, 16, 12]} />
          </mesh>
        )}
      </group>
    </group>
  );
});
