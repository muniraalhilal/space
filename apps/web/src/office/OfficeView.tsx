'use client';
import * as THREE from 'three';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer, AdaptiveDpr } from '@react-three/drei';
import { EffectComposer, N8AO, SMAA, Bloom, Vignette, BrightnessContrast } from '@react-three/postprocessing';
import { Plus, Minus, Maximize2, Layers, Box, LayoutGrid, Search } from 'lucide-react';
import { presenceGroup, PRESENCE_GROUP_LABEL, PRESENCE_LABEL, AGENT_ROLE_LABEL, type DeptTheme, type PresenceGroup } from '@space/shared';
import { PRESENCE_PIN } from './Room';
import { DeptPill } from './labels';
import { AvatarPortrait, RobotPortrait } from '@/components/avatar';
import { ListTodo } from 'lucide-react';
import { OfficeScene, type SceneRoom } from './OfficeScene';
import type { RoomAgent, RoomPerson } from './Room';
import { useAgents, useMembers, useOffice, useOrg } from '@/lib/queries';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { DeptIcon } from '@/components/domain';
import { Tip, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { EntityPopup } from './EntityPopup';
import { Office2D } from './Office2D';

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Quality tier: post-processing only where the device can afford it. */
function useQuality() {
  const [q, setQ] = useState<'high' | 'low'>('high');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const forced = params.get('quality');
    if (forced === 'low' || forced === 'high') return setQ(forced);
    const cores = navigator.hardwareConcurrency ?? 4;
    const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
    setQ(cores <= 4 || mem <= 4 ? 'low' : 'high');
  }, []);
  return q;
}

export function OfficeView({ initialDept, compact = false, className }: { initialDept?: string; compact?: boolean; className?: string }) {
  const org = useOrg();
  const members = useMembers();
  const agents = useAgents();
  const office = useOffice();
  const { focusMode, view3d, setView3d, floor, setFloor, selectedDept, selectDept, selectedEntity, selectEntity } = useUi();
  const [hover, setHoverState] = useState<{ kind: 'member' | 'agent'; id: string; name: string } | null>(null);
  const pointer = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const labelLayer = useRef<HTMLDivElement>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const setHover = useCallback((h: { kind: 'member' | 'agent'; id: string; name: string } | null) => {
    setHoverState(h);
    setHoverPos(h ? { ...pointer.current } : null);
  }, []);
  const [zoomCmd, setZoomCmd] = useState<{ n: number; dir: 1 | -1 | 0 } | null>(null);
  const [gl, setGl] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [still, setStill] = useState(false);
  const quality = useQuality();

  useEffect(() => {
    setGl(webglAvailable());
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    setStill(new URLSearchParams(window.location.search).has('still'));
  }, []);

  // honour the department route
  useEffect(() => {
    if (initialDept) {
      const d = org.data?.departments.find((x) => x.id === initialDept);
      if (d && d.floor !== floor) setFloor(d.floor);
      selectDept(initialDept);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDept, org.data]);

  const depts = org.data?.departments ?? [];
  const floors = org.data?.floors ?? [1];
  const layout = office.data?.find((l) => l.floor === floor)?.rooms ?? [];

  const { rooms, centralAgents } = useMemo(() => {
    const ms = members.data ?? [];
    const as = agents.data ?? [];
    const toPerson = (m: (typeof ms)[number]): RoomPerson => ({ id: m.id, name: m.name, presence: m.presence });
    const toAgent = (a: (typeof as)[number]): RoomAgent => ({ id: a.id, name: a.name, robot: a.robot, status: a.status === 'disabled' ? 'disabled' : a.status });
    const placed = new Set<string>();
    const rs: SceneRoom[] = [];
    for (const slot of layout) {
      const d = depts.find((x) => x.id === slot.departmentId);
      if (!d) continue;
      // each person appears once: in their first department (stable by membership order)
      const people = ms
        .filter((m) => m.departments.some((x) => x.departmentId === d.id) && !placed.has(m.id))
        .sort((a, b) => a.id.localeCompare(b.id));
      people.forEach((p) => placed.add(p.id));
      rs.push({
        id: d.id,
        name: d.name,
        theme: d.theme as DeptTheme,
        color: d.color,
        memberCount: d.memberCount,
        ...slot,
        people: people.map(toPerson),
        agents: as.filter((a) => a.departmentId === d.id).map(toAgent),
      });
    }
    return { rooms: rs, centralAgents: floor === 1 ? as.filter((a) => !a.departmentId).map(toAgent) : [] };
  }, [layout, depts, members.data, agents.data, floor]);

  const loading = org.isLoading || members.isLoading || agents.isLoading || office.isLoading;
  const show3d = view3d && gl;
  const prefReducedMotion = useUi((s) => s.reducedMotion);
  const animate = !focusMode && !reducedMotion && !prefReducedMotion && !still;

  return (
    <div
      data-office
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        pointer.current = { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
      }}
      className={cn('relative overflow-hidden rounded-[22px] border border-line bg-[linear-gradient(170deg,#f6f1ec_0%,#f1ecf5_60%,#ecf1f6_100%)]', className)}>
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-[13px] text-muted">Preparing your office…</div>
      ) : show3d ? (
        <div className="absolute inset-0" style={{ filter: focusMode ? 'saturate(0.62) brightness(1.04) contrast(0.96)' : 'sepia(0.035) saturate(1.1) hue-rotate(-4deg) brightness(1.02)', transition: 'filter 500ms' }} role="img" aria-label="Interactive 3D office. Use the department list or the 2D view for keyboard navigation.">
          <Canvas
            orthographic
            shadows
            frameloop={animate ? 'always' : 'demand'}
            dpr={quality === 'high' ? [1, 1.75] : [1, 1.25]}
            camera={{ position: [40, 34, 40], zoom: 22, near: -200, far: 400 }}
            gl={{ antialias: quality === 'low', alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1, powerPreference: 'high-performance' }}
            onPointerMissed={() => {
              selectEntity(null);
            }}
          >
            <Suspense fallback={null}>
              <Environment resolution={64}>
                <Lightformer form="rect" intensity={2} color="#fff5ea" position={[10, 20, 10]} scale={[30, 10, 1]} />
                <Lightformer form="rect" intensity={0.8} color="#e8eeff" position={[-20, 10, -10]} scale={[20, 6, 1]} />
              </Environment>
              <OfficeScene
                rooms={rooms}
                floor={floor}
                orgName={org.data!.organization.name}
                brand={org.data!.organization.brandColor}
                focus={focusMode}
                animate={animate}
                selectedDept={selectedDept}
                selectedEntityId={selectedEntity?.id ?? null}
                centralAgents={centralAgents}
                onSelectDept={(id) => selectDept(id)}
                onSelectEntity={(kind, id, screen) => selectEntity({ kind, id, screen })}
                onHover={setHover}
                zoomCommand={zoomCmd}
                labelLayer={labelLayer}
              />
              {quality === 'high' && !focusMode && (
                <EffectComposer multisampling={0}>
                  <N8AO aoRadius={0.9} intensity={2.4} distanceFalloff={0.8} halfRes color="#5a3f35" />
                  <Bloom mipmapBlur intensity={0.3} luminanceThreshold={0.94} luminanceSmoothing={0.2} />
                  <BrightnessContrast brightness={0.02} contrast={0.06} />
                  <Vignette eskil={false} offset={0.32} darkness={0.28} />
                  <SMAA />
                </EffectComposer>
              )}
              <AdaptiveDpr pixelated={false} />
            </Suspense>
          </Canvas>
        </div>
      ) : (
        <Office2D rooms={rooms} />
      )}

      {/* department + reception labels (moved into place by the scene each frame) */}
      {show3d && !loading && (
        <div ref={labelLayer} className="pointer-events-none absolute inset-0 z-20 overflow-hidden" aria-hidden>
          {rooms.map((r) => (
            <div key={r.id} data-anchor={r.id} className="absolute left-0 top-0 opacity-0 will-change-transform">
              <DeptPill
                name={r.name}
                theme={r.theme}
                color={r.color}
                desks={r.people.length}
                inOffice={r.people.filter((p) => presenceGroup(p.presence) === 'in_office').length}
                remote={r.people.filter((p) => p.presence === 'remote').length}
                compact={focusMode}
                active={selectedDept === r.id}
              />
            </div>
          ))}
          {floor === 1 && (
            <div data-anchor="reception" className="absolute left-0 top-0 opacity-0 will-change-transform">
              <div className="rounded-lg bg-white/95 px-3 py-1.5 text-[12px] font-bold text-ink shadow-[var(--shadow-md)]">Reception</div>
            </div>
          )}
        </div>
      )}

      {/* hover card: who sits here, where they are, what they're working on */}
      {hover && show3d && hoverPos && <HoverCard hover={hover} pos={hoverPos} />}

      {/* team presence summary */}
      {show3d && !compact && <TeamPresence />}

      {/* department finder */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2">
        <DeptFinder onPick={(id, f) => {
          if (f !== floor) setFloor(f);
          setTimeout(() => selectDept(id), 0);
        }} />
      </div>

      {/* vertical control rail: floors, zoom, 2D/3D */}
      <div className="absolute right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-2xl bg-white/95 p-1.5 shadow-[var(--shadow-md)] ring-1 ring-black/[0.03]">
        <div className="flex flex-col gap-1" role="tablist" aria-label="Floors">
          {[...floors].sort((a, b) => b - a).map((f) => (
            <Tip key={f} label={`Floor ${f}`} side="left">
              <button role="tab" aria-selected={f === floor} onClick={() => setFloor(f)} className={cn('flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-[12px] font-bold', f === floor ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-bg')}>
                {f}F
              </button>
            </Tip>
          ))}
        </div>
        {show3d && (
          <>
            <div className="my-0.5 h-px w-6 bg-line" />
            <Tip label="Zoom in" side="left">
              <button aria-label="Zoom in" onClick={() => setZoomCmd({ n: Date.now(), dir: 1 })} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-[12px] font-bold text-ink-2 hover:bg-bg">
                <Plus className="h-4 w-4" />
              </button>
            </Tip>
            <Tip label="Zoom out" side="left">
              <button aria-label="Zoom out" onClick={() => setZoomCmd({ n: Date.now(), dir: -1 })} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-[12px] font-bold text-ink-2 hover:bg-bg">
                <Minus className="h-4 w-4" />
              </button>
            </Tip>
            <Tip label="Whole office" side="left">
              <button
                aria-label="Show whole office"
                onClick={() => {
                  selectDept(null);
                  setZoomCmd({ n: Date.now(), dir: 0 });
                }}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-[12px] font-bold text-ink-2 hover:bg-bg"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </Tip>
          </>
        )}
        <div className="my-0.5 h-px w-6 bg-line" />
        <Tip label={show3d ? 'Switch to 2D map' : 'Switch to 3D office'} side="left">
          <button aria-label={show3d ? 'Switch to 2D map' : 'Switch to 3D office'} disabled={!gl && !show3d} onClick={() => setView3d(!show3d)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-[12px] font-bold text-ink-2 hover:bg-bg disabled:opacity-40">
            {show3d ? <LayoutGrid className="h-4 w-4" /> : <Box className="h-4 w-4" />}
          </button>
        </Tip>
      </div>

      {selectedEntity && <EntityPopup entity={selectedEntity} onClose={() => selectEntity(null)} compact={compact} />}
    </div>
  );
}

function DeptFinder({ onPick }: { onPick: (id: string, floor: number) => void }) {
  const org = useOrg();
  const [q, setQ] = useState('');
  const list = (org.data?.departments ?? []).filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex h-[38px] cursor-pointer items-center gap-2 rounded-xl bg-white/95 px-3 text-[12.5px] font-semibold text-ink-2 shadow-[var(--shadow-md)] hover:text-ink" aria-label="Find a department">
          <Search className="h-3.5 w-3.5" /> Departments
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a department…" className="mb-1 h-9 w-full rounded-lg bg-bg px-3 text-[13px] outline-none" />
        <div className="max-h-64 overflow-y-auto">
          {list.map((d) => (
            <button key={d.id} onClick={() => onPick(d.id, d.floor)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-bg">
              <DeptIcon theme={d.theme} color={d.color} size={26} />
              <span className="flex-1 text-[13px] font-semibold">{d.name}</span>
              <span className="text-[11px] text-muted">F{d.floor}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function HoverCard({ hover, pos }: { hover: { kind: 'member' | 'agent'; id: string; name: string }; pos: { x: number; y: number; w: number; h: number } }) {
  const members = useMembers();
  const agents = useAgents();
  const W = 232;
  const left = Math.min(Math.max(8, pos.x + 18), pos.w - W - 8);
  const top = Math.min(Math.max(8, pos.y - 30), pos.h - 170);
  const style = { left, top, width: W };
  const shell = 'pointer-events-none absolute z-30 rounded-2xl bg-white p-3.5 shadow-[0_14px_40px_-12px_rgba(38,35,58,0.35)] ring-1 ring-black/[0.04]';
  if (hover.kind === 'agent') {
    const a = agents.data?.find((x) => x.id === hover.id);
    if (!a) return null;
    return (
      <div className={shell} style={style}>
        <div className="flex items-center gap-2.5">
          <RobotPortrait config={a.robot} size={36} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold text-ink">{a.name}</p>
            <p className="truncate text-[11.5px] text-muted">AI agent · {AGENT_ROLE_LABEL[a.role]}</p>
          </div>
        </div>
        <p className="mt-2.5 border-t border-line pt-2 text-[12px] capitalize text-ink-2">{a.status.replace('_', ' ')}</p>
      </div>
    );
  }
  const m = members.data?.find((x) => x.id === hover.id);
  if (!m) return null;
  const g = presenceGroup(m.presence);
  return (
    <div className={shell} style={style}>
      <div className="flex items-center gap-2.5">
        <AvatarPortrait name={m.name} size={36} />
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-bold text-ink">{m.name}</p>
          <p className="truncate text-[11.5px] text-muted">{m.title ?? 'Team member'}</p>
        </div>
      </div>
      <p className="mt-2.5 flex items-center gap-2 text-[12.5px] font-medium text-ink-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRESENCE_PIN[g] }} />
        {PRESENCE_GROUP_LABEL[g]}
        {(m.presence === 'in_meeting' || m.presence === 'focus' || m.presence === 'on_break') && <span className="text-muted">· {PRESENCE_LABEL[m.presence]}</span>}
      </p>
      {m.currentTask && (
        <div className="mt-2.5 flex gap-2 border-t border-line pt-2.5">
          <ListTodo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
          <p className="text-[12px] leading-snug text-muted">
            Working on
            <span className="block font-semibold text-ink-2">{m.currentTask.title}</span>
          </p>
        </div>
      )}
      <p className="mt-2.5 rounded-lg border border-line py-1.5 text-center text-[11.5px] font-semibold text-ink-2">Click to view profile</p>
    </div>
  );
}

function TeamPresence() {
  const members = useMembers();
  const counts: Record<PresenceGroup, number> = { in_office: 0, remote: 0, away: 0, offline: 0 };
  for (const m of members.data ?? []) counts[presenceGroup(m.presence)]++;
  return (
    <div className="absolute right-4 top-4 z-30 w-[188px] rounded-2xl bg-white/95 p-3.5 shadow-[var(--shadow-md)] ring-1 ring-black/[0.03]">
      <p className="mb-2 text-[13px] font-bold text-ink">Team Presence</p>
      {(Object.keys(counts) as PresenceGroup[]).map((g) => (
        <p key={g} className="flex items-center gap-2.5 py-[3px] text-[12.5px] text-ink-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: PRESENCE_PIN[g] }} />
          <span className="flex-1">{PRESENCE_GROUP_LABEL[g]}</span>
          <span className="font-semibold text-ink">{counts[g]}</span>
        </p>
      ))}
    </div>
  );
}
