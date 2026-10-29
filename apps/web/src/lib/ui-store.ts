'use client';
import { create } from 'zustand';

/** Client-only UI state. Persistent preferences are saved to the user's profile via the API. */
interface UiState {
  focusMode: boolean;
  /** User preference (in addition to the OS-level prefers-reduced-motion setting). */
  reducedMotion: boolean;
  view3d: boolean;
  floor: number;
  selectedDept: string | null;
  selectedEntity: { kind: 'member' | 'agent'; id: string; screen?: { x: number; y: number } } | null;
  setFocusMode: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
  setView3d: (v: boolean) => void;
  setFloor: (f: number) => void;
  selectDept: (id: string | null) => void;
  selectEntity: (e: UiState['selectedEntity']) => void;
}

export const useUi = create<UiState>((set) => ({
  focusMode: false,
  reducedMotion: false,
  view3d: true,
  floor: 1,
  selectedDept: null,
  selectedEntity: null,
  setFocusMode: (focusMode) => set({ focusMode }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setView3d: (view3d) => set({ view3d }),
  setFloor: (floor) => set({ floor, selectedDept: null, selectedEntity: null }),
  selectDept: (selectedDept) => set({ selectedDept, selectedEntity: null }),
  selectEntity: (selectedEntity) => set({ selectedEntity }),
}));
