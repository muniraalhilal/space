'use client';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, ContactShadows, OrbitControls } from '@react-three/drei';
import { Suspense, type ReactNode } from 'react';

/** Soft studio lighting shared by previews (no network assets: the environment is built from light formers). */
export function StudioLights({ intensity = 1 }: { intensity?: number }) {
  return (
    <>
      <hemisphereLight args={['#fffaf4', '#e6ddd4', 0.9 * intensity]} />
      <directionalLight position={[3, 5, 4]} intensity={1.6 * intensity} color="#fff1e2" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} />
      <directionalLight position={[-4, 3, -2]} intensity={0.45 * intensity} color="#dfe7ff" />
      <Environment resolution={64}>
        <Lightformer form="rect" intensity={2.2} color="#fff6ec" position={[0, 4, 3]} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#e9eeff" position={[-4, 2, -2]} scale={[4, 2, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#ffe9f0" position={[4, 2, 0]} scale={2} />
      </Environment>
    </>
  );
}

export function Stage({ children, camera = { position: [0, 0.9, 3.2], fov: 30 }, target = [0, 0.6, 0], controls = false, className, shadowY = 0, dpr = [1, 2], frameloop = 'always' }: { children: ReactNode; camera?: { position: [number, number, number]; fov: number }; target?: [number, number, number]; controls?: boolean; className?: string; shadowY?: number; dpr?: [number, number]; frameloop?: 'always' | 'demand' }) {
  return (
    <Canvas
      className={className}
      shadows
      dpr={dpr}
      frameloop={frameloop}
      camera={camera}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onCreated={({ camera: c }) => c.lookAt(...target)}
    >
      <Suspense fallback={null}>
        <StudioLights />
        {children}
        <ContactShadows position={[0, shadowY + 0.001, 0]} opacity={0.35} scale={6} blur={2.4} far={2} />
        {controls && <OrbitControls target={target} enablePan={false} minDistance={1.6} maxDistance={6} minPolarAngle={0.6} maxPolarAngle={1.55} />}
      </Suspense>
    </Canvas>
  );
}
