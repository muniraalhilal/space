'use client';
import * as React from 'react';
import { type RobotConfig, ROBOT_THEME_COLORS, PRESENCE_LABEL, type PresenceStatus } from '@space/shared';
import { cn, shade, tint } from '@/lib/utils';

import { initials } from '@/lib/utils';

const AVATAR_TONES = [
  ['#e9e4fb', '#6b5bc4'],
  ['#e3edfb', '#3f6fc2'],
  ['#e2f0e6', '#3c8a5c'],
  ['#fbe6ec', '#c2577a'],
  ['#fdeadb', '#c26a2c'],
  ['#fbf2d5', '#a7801c'],
];

/**
 * People are shown as clean initials avatars (no character art). The colour is derived from the
 * name so a person keeps the same colour everywhere.
 */
export function AvatarPortrait({ name, size = 36, className, ring }: { name?: string | null; size?: number; className?: string; ring?: boolean }) {
  const n = name ?? '?';
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  const [bgc, fg] = AVATAR_TONES[h % AVATAR_TONES.length];
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold', ring && 'ring-2 ring-white', className)}
      style={{ width: size, height: size, background: bgc, color: fg, fontSize: Math.max(10, size * 0.38) }}
    >
      {initials(n)}
    </span>
  );
}

export function RobotPortrait({ config, size = 36, className, dim }: { config: Partial<RobotConfig> | undefined; size?: number; className?: string; dim?: boolean }) {
  const theme = (config?.theme ?? 'sky') as keyof typeof ROBOT_THEME_COLORS;
  const col = ROBOT_THEME_COLORS[theme];
  const ears = config?.ears ?? 'headphones';
  const face = config?.face ?? 'happy';
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={cn('shrink-0 rounded-full', dim && 'opacity-60 grayscale', className)} aria-hidden>
      <defs>
        <radialGradient id={`rb${uid}`} cx="0.4" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#e6e9f2" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="50" fill={tint(col, 0.7)} />
      <path d="M26 100 Q28 78 50 76 Q72 78 74 100 Z" fill={`url(#rb${uid})`} />
      <circle cx="50" cy="88" r="6" fill={col} />
      {ears === 'cat' && <path d="M24 34 L30 14 L42 28 Z M76 34 L70 14 L58 28 Z" fill={col} />}
      {ears === 'antenna' && (
        <>
          <path d="M50 22 L50 12" stroke="#c9cedb" strokeWidth="3" />
          <circle cx="50" cy="10" r="4.5" fill={col} />
        </>
      )}
      <ellipse cx="50" cy="46" rx="30" ry="27" fill={`url(#rb${uid})`} />
      {(ears === 'headphones' || ears === 'round') && (
        <>
          {ears === 'headphones' && <path d="M20 46 Q20 14 50 14 Q80 14 80 46" stroke={col} strokeWidth="4" fill="none" />}
          <ellipse cx="20" cy="47" rx="6" ry="10" fill={col} />
          <ellipse cx="80" cy="47" rx="6" ry="10" fill={col} />
        </>
      )}
      <rect x="29" y="31" width="42" height="30" rx="14" fill="#18203a" />
      <RobotEyes face={face} color={tint(col, 0.15)} />
    </svg>
  );
}

function RobotEyes({ face, color }: { face: string; color: string }) {
  if (face === 'happy') return <path d="M37 48 Q41 42 45 48 M55 48 Q59 42 63 48" stroke={color} strokeWidth="3.4" strokeLinecap="round" fill="none" />;
  if (face === 'wink')
    return (
      <>
        <path d="M37 47 Q41 42 45 47" stroke={color} strokeWidth="3.4" strokeLinecap="round" fill="none" />
        <path d="M55 46 L63 46" stroke={color} strokeWidth="3.4" strokeLinecap="round" />
      </>
    );
  if (face === 'focused')
    return (
      <>
        <rect x="36" y="42" width="9" height="7" rx="3" fill={color} />
        <rect x="55" y="42" width="9" height="7" rx="3" fill={color} />
      </>
    );
  return (
    <>
      <circle cx="41" cy="46" r="4.6" fill={color} />
      <circle cx="59" cy="46" r="4.6" fill={color} />
      <circle cx="42.5" cy="44.5" r="1.4" fill="#fff" />
      <circle cx="60.5" cy="44.5" r="1.4" fill="#fff" />
    </>
  );
}

/** Same four colours as the presence pins in the office: in office, remote, away, offline. */
const presenceColor: Record<PresenceStatus, string> = {
  available: '#3fb27a',
  working: '#3fb27a',
  in_meeting: '#3fb27a',
  focus: '#3fb27a',
  remote: '#7b83eb',
  away: '#f2b23e',
  on_break: '#f2b23e',
  offline: '#b9b5c2',
};
export function PresenceDot({ status, className }: { status: PresenceStatus; className?: string }) {
  return <span title={PRESENCE_LABEL[status]} className={cn('inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white', className)} style={{ background: presenceColor[status] }} />;
}
export function PresenceBadge({ status }: { status: PresenceStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 text-[11.5px] font-semibold text-ink-2">
      <span className="h-2 w-2 rounded-full" style={{ background: presenceColor[status] }} />
      {PRESENCE_LABEL[status]}
    </span>
  );
}
export { presenceColor };
