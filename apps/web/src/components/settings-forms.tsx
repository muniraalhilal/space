'use client';
import { useEffect, useState } from 'react';
import { DEPT_THEMES, type DeptTheme } from '@space/shared';
import { Button, Field, Input, Select, Textarea } from '@/components/ui/primitives';

export const THEME_LABEL: Record<DeptTheme, string> = { development: 'Development', design: 'Design', marketing: 'Marketing', hr: 'People / HR', finance: 'Finance', operations: 'Operations', product: 'Product', general: 'General' };

export function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#7c83e8'} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-surface p-1 disabled:cursor-default" />
        <Input value={value} disabled={disabled} maxLength={7} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
    </Field>
  );
}


export function DepartmentForm({
  initial,
  disabled,
  onSubmit,
  submitLabel,
  pending,
}: {
  initial: { name: string; description: string; theme: DeptTheme; color: string; floor: number };
  disabled?: boolean;
  onSubmit: (v: { name: string; description: string; theme: DeptTheme; color: string; floor: number }) => void;
  submitLabel: string;
  pending?: boolean;
}) {
  const [f, setF] = useState(initial);
  useEffect(() => setF(initial), [initial]);
  const valid = f.name.trim().length >= 2 && /^#[0-9a-f]{6}$/i.test(f.color) && f.floor >= 1 && f.floor <= 20;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ ...f, name: f.name.trim(), description: f.description.trim() });
      }}
    >
      <Field label="Name">
        <Input value={f.name} maxLength={60} disabled={disabled} onChange={(e) => setF({ ...f, name: e.target.value })} required />
      </Field>
      <Field label="Description">
        <Textarea value={f.description} maxLength={500} disabled={disabled} rows={2} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <div className="grid grid-cols-[1fr_1fr_110px] gap-3">
        <Field label="Room style">
          <Select value={f.theme} disabled={disabled} onValueChange={(v) => setF({ ...f, theme: v as DeptTheme })} options={DEPT_THEMES.map((t) => ({ value: t, label: THEME_LABEL[t] }))} />
        </Field>
        <ColorField label="Colour" value={f.color} disabled={disabled} onChange={(v) => setF({ ...f, color: v })} />
        <Field label="Floor">
          <Input type="number" min={1} max={20} value={f.floor} disabled={disabled} onChange={(e) => setF({ ...f, floor: Math.max(1, Math.min(20, parseInt(e.target.value || '1', 10))) })} />
        </Field>
      </div>
      {!disabled && (
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!valid || pending}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

