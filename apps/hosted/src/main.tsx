import { createRoot } from 'react-dom/client';
import { Suspense, lazy, useEffect, useState } from 'react';
import { Providers } from '@/app/providers';
import { SpaceLogo } from '@/components/brand';
import { Routes } from './routes';
import { restoreLocation } from './shims/router';
import { loadCaps, caps } from './backend/caps';
import { store } from './backend/store';
import { loadIdentity } from './backend/identity';
import { sweepStaleRuns } from './backend/agents';
import { installDownloadHandler } from './downloads';
import './index.css';

type Boot = 'loading' | 'ready' | 'unavailable' | 'signin';
const DemoBar = import.meta.env.VITE_TARGET === 'web' ? lazy(() => import('./web/demo-bar').then((m) => ({ default: m.DemoBar }))) : () => null;
const AuthScreen = import.meta.env.VITE_TARGET === 'web' ? lazy(() => import('./web/auth').then((m) => ({ default: m.AuthScreen }))) : () => null;

function App() {
  const [boot, setBoot] = useState<Boot>('loading');
  useEffect(() => {
    (async () => {
      await loadCaps();
      if (caps.platform === 'web' && !caps.db) return setBoot('signin');
      await store.connect(caps.db);
      await store.ready();
      if (store.status === 'unavailable') return setBoot('unavailable');
      await loadIdentity();
      restoreLocation();
      installDownloadHandler();
      // Local test harness hook (never set in production).
      if ((window as any).__SPACE_TEST__) (window as any).__spaceApi = (await import('./backend/router')).handle;
      setBoot('ready');
      void sweepStaleRuns();
    })();
  }, []);
  if (boot === 'loading')
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <div className="animate-pulse">
          <SpaceLogo size={44} />
        </div>
        <p className="text-[13px] text-muted">Opening your Space…</p>
      </div>
    );
  if (boot === 'signin')
    return (
      <Suspense fallback={null}>
        <AuthScreen />
      </Suspense>
    );
  if (boot === 'unavailable')
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <SpaceLogo size={44} />
        <p className="text-[18px] font-bold">Space couldn’t connect</p>
        <p className="max-w-[440px] text-[13.5px] text-muted">Your companies, tasks and messages couldn’t be loaded. Check your connection and open the link again.</p>
      </div>
    );
  return (
    <Providers>
      <Routes />
      {caps.platform === 'demo' && (
        <Suspense fallback={null}>
          <DemoBar />
        </Suspense>
      )}
    </Providers>
  );
}

createRoot(document.getElementById('space-root')!).render(<App />);
