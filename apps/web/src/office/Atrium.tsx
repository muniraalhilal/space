'use client';
import { memo, type ComponentProps } from 'react';
import { CurvedSofa, CoffeeTable, Plant, ReceptionDesk, Rug, RoundTable, Stool, Sofa, Mug, FloorLamp } from './furniture';
import { Prefab } from './lib/prefab';
import { G } from './lib/prefab';
import { mat, basic, P } from './lib/materials';
import { signTexture, woodTexture } from './lib/textures';
import { RobotModel, type RobotStatus } from './Robot';
import type { RobotConfig } from '@space/shared';
import type { ThreeEvent } from '@react-three/fiber';

/** Company sign panel. */
export const Sign = memo(function Sign({ name, brand, ...p }: { name: string; brand: string } & ComponentProps<'group'>) {
  return (
    <group {...p}>
      <Prefab
        k="sign-panel"
        build={() => [
          { g: G.rbox(4.2, 1.5, 0.16, 0.06), m: mat('#fbf8f4', { roughness: 0.6 }), p: [0, 0.95, 0] },
          { g: G.rbox(4.3, 0.12, 0.3, 0.04), m: mat(P.woodLight, { roughness: 0.55 }), p: [0, 0.06, 0] },
        ]}
      />
      <mesh position={[0, 1.0, 0.085]} material={basic('#ffffff', { map: signTexture(name, brand), transparent: true })}>
        <planeGeometry args={[3.7, 0.92]} />
      </mesh>
    </group>
  );
});

export const Atrium = memo(function Atrium({
  floor,
  orgName,
  brand,
  focus,
  agents,
  onSelectAgent,
  animate,
}: {
  floor: number;
  orgName: string;
  brand: string;
  focus: boolean;
  agents: Array<{ id: string; name: string; robot: RobotConfig; status: RobotStatus }>;
  onSelectAgent: (id: string, e: ThreeEvent<MouseEvent>) => void;
  animate: boolean;
}) {
  const woodFloor = woodTexture('#efe1cf');
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow material={mat('#ffffff', { map: woodFloor, roughness: 0.75 })}>
        <circleGeometry args={[3.35, 64]} />
      </mesh>
      {floor === 1 ? (
        <>
          <Sign name={orgName} brand={brand} position={[-1.55, 0, -2.25]} rotation={[0, Math.PI / 4, 0]} scale={0.82} />
          <Rug w={3.6} color="#eee5f5" round position={[-0.5, 0, 0.35]} />
          <CurvedSofa radius={1.45} start={Math.PI * 0.95} length={Math.PI * 0.6} color="#cfe1d6" position={[-0.5, 0, 0.35]} />
          <CurvedSofa radius={1.45} start={Math.PI * 1.65} length={Math.PI * 0.42} color="#f0d5cc" position={[-0.5, 0, 0.35]} />
          <Prefab k="atrium-planter" build={() => [{ g: G.cyl(0.5, 0.54, 0.4, 40), m: mat('#f3ede6', { roughness: 0.55 }), p: [0, 0.2, 0] }]} position={[-0.5, 0, 0.35]} />
          <Plant kind="tree" position={[-0.5, 0.28, 0.35]} scale={1.1} seed={4} pot="white" />
          <CoffeeTable r={0.3} position={[-1.35, 0, 1.15]} />
          <Mug position={[-1.3, 0.345, 1.1]} />
          <ReceptionDesk brand={brand} position={[0.9, 0, 0.5]} rotation={[0, -2.07, 0]} />
          {!focus && (
            <>
              <Plant kind="palm" position={[2.9, 0, -2.6]} scale={1.15} seed={2} pot="terracotta" />
              <Plant kind="tall" position={[-3.2, 0, 2.6]} seed={6} />
              <FloorLamp position={[-2.6, 0, -1.6]} />
            </>
          )}
        </>
      ) : (
        <>
          <Sign name={orgName} brand={brand} position={[-1.6, 0, -2.3]} rotation={[0, Math.PI / 4, 0]} scale={0.7} />
          <Prefab
            k="cafe-counter"
            build={() => [
              { g: G.rbox(2.6, 0.95, 0.6, 0.04), m: mat(P.white, { roughness: 0.5 }), p: [0, 0.475, 0] },
              { g: G.rbox(2.7, 0.05, 0.7, 0.02), m: mat(P.woodLight, { roughness: 0.5 }), p: [0, 0.97, 0] },
              { g: G.rbox(0.36, 0.42, 0.3, 0.04), m: mat('#3a3840', { roughness: 0.4, metalness: 0.3 }), p: [-0.8, 1.2, -0.1] },
            ]}
            position={[1.2, 0, -2.4]}
          />
          {[-1.4, 0.3, 1.9].map((x, i) => (
            <group key={i} position={[x, 0, 0.4 + (i % 2) * 0.8]}>
              <RoundTable r={0.45} />
              {[0, 1, 2].map((j) => (
                <Stool key={j} color={['#f1d1c4', '#cfe0d6', '#e1d8f1'][j]} position={[Math.cos((j / 3) * Math.PI * 2 + i) * 0.72, 0, Math.sin((j / 3) * Math.PI * 2 + i) * 0.72]} />
              ))}
            </group>
          ))}
          <Sofa color="#d7e4f2" seats={3} position={[0, 0, 2.5]} rotation={[0, Math.PI, 0]} />
          {!focus && (
            <>
              <Plant kind="palm" position={[-3.2, 0, -2.6]} scale={1.2} seed={3} />
              <Plant kind="tall" position={[3.2, 0, -2.5]} seed={5} />
            </>
          )}
        </>
      )}

      {/* central AI agents wait by the reception */}
      {agents.map((a, i) => (
        <group
          key={a.id}
          position={[2.2 + i * 0.75, 0, 2.3 - i * 0.4]}
          rotation={[0, -0.5, 0]}
          onClick={(e) => {
            e.stopPropagation();
            onSelectAgent(a.id, e);
          }}
        >
          <group scale={0.82}>
            <RobotModel config={a.robot} status={a.status} animate={animate} seed={i} />
          </group>
        </group>
      ))}
    </group>
  );
});
