/** Small floating note shown while exploring the no-account demo. */
import { useState } from 'react';
import { X } from 'lucide-react';
import { resetDemo } from './demo';

export function DemoBar() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="fixed bottom-3 left-1/2 z-[60] flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-3 rounded-full border border-line bg-surface/95 py-1.5 pl-4 pr-1.5 text-[12.5px] shadow-[var(--shadow-md,0_8px_24px_rgba(0,0,0,.12))] backdrop-blur">
      <span className="truncate text-muted">
        <b className="text-ink">Demo</b> · changes stay in this browser
      </span>
      <button className="shrink-0 cursor-pointer font-semibold text-muted hover:text-ink" onClick={() => confirm('Start the demo over? Your changes will be cleared.') && resetDemo()}>
        Reset
      </button>
      <a href="?signin" className="shrink-0 rounded-full bg-brand px-3 py-1 font-semibold text-white">
        Create free account
      </a>
      <button aria-label="Hide" className="shrink-0 cursor-pointer rounded-full p-1 text-muted hover:bg-bg-soft" onClick={() => setOpen(false)}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
