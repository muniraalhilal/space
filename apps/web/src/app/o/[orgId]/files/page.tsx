'use client';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Upload, Download, Trash2, BookOpen, Bot, Lock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useFiles, useOrg } from '@/lib/queries';
import { useOrgId } from '@/lib/org-context';
import { api, errorMessage } from '@/lib/api';
import { Badge, Button, Card, Empty, PageHeader, Segmented, Select, Skeleton } from '@/components/ui/primitives';
import { DeptIcon } from '@/components/domain';
import { ago, bytes } from '@/lib/utils';

export default function FilesPage() {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const [dept, setDept] = useState('any');
  const [kind, setKind] = useState<'all' | 'knowledge'>('all');
  const [target, setTarget] = useState('');
  const [knowledge, setKnowledge] = useState(true);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const files = useFiles(dept === 'any' ? undefined : dept, kind === 'knowledge');
  const writable = (org.data?.departments ?? []).filter((d) => org.data?.me.role === 'company_admin' || (org.data?.me.role !== 'viewer' && d.myRole));
  const uploadTarget = target || (org.data?.me.role === 'company_admin' ? 'company' : writable[0]?.id ?? '');

  async function upload(f: File) {
    const fd = new FormData();
    fd.append('file', f);
    if (uploadTarget !== 'company') fd.append('departmentId', uploadTarget);
    fd.append('isKnowledge', String(knowledge));
    setBusy(true);
    try {
      await api.upload(`/orgs/${orgId}/files`, fd);
      qc.invalidateQueries({ queryKey: ['files', orgId] });
      toast.success(`${f.name} uploaded`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader icon={<FileText className="text-sage-ink" />} title="Files & Knowledge" subtitle="Private storage. Downloads are checked against your department access every time." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All files' }, { value: 'knowledge', label: 'Knowledge base' }]} />
            <Select className="h-9 w-48" value={dept} onValueChange={setDept} aria-label="Department" options={[{ value: 'any', label: 'All I can access' }, ...(org.data?.departments ?? []).filter((d) => d.canRead).map((d) => ({ value: d.id, label: d.name }))]} />
          </div>
          <Card className="overflow-hidden">
            {files.isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : !files.data?.length ? (
              <Empty icon={<FileText />} title="No files here yet" body="Upload documents your team and authorised agents can use." />
            ) : (
              <div className="divide-y divide-line">
                {files.data.map((f) => {
                  const d = org.data?.departments.find((x) => x.id === f.departmentId);
                  const canDelete = f.ownerMemberId === org.data?.me.memberId || org.data?.me.role === 'company_admin' || (d?.canAdmin ?? false);
                  return (
                    <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg text-muted">{f.ownerAgentId ? <Bot className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">{f.name}</p>
                        <p className="text-[11.5px] text-muted">
                          {f.ownerName ?? 'Unknown'}
                          {f.ownerAgentId ? ' (AI agent)' : ''} · {ago(f.createdAt)} · {bytes(f.size)}
                        </p>
                      </div>
                      <span className="hidden items-center gap-1.5 sm:flex">
                        {d ? <DeptIcon theme={d.theme} color={d.color} size={22} /> : <Badge>Company</Badge>}
                        {f.isKnowledge && <Badge tone="lavender"><BookOpen className="h-3 w-3" /> Knowledge</Badge>}
                        {f.retentionUntil && <Badge tone="butter"><Lock className="h-3 w-3" /> Retained</Badge>}
                      </span>
                      <a href={`/api/orgs/${orgId}/files/${f.id}/download`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-bg hover:text-ink" aria-label={`Download ${f.name}`}>
                        <Download className="h-4 w-4" />
                      </a>
                      {canDelete && (
                        <button
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted hover:bg-rose hover:text-rose-ink"
                          aria-label={`Delete ${f.name}`}
                          onClick={async () => {
                            if (!confirm(`Delete ${f.name}?`)) return;
                            try {
                              await api.del(`/orgs/${orgId}/files/${f.id}`);
                              qc.invalidateQueries({ queryKey: ['files', orgId] });
                            } catch (e) {
                              toast.error(errorMessage(e));
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
        {org.data?.me.role !== 'viewer' && (
          <Card className="h-fit space-y-3 p-4">
            <p className="text-[14px] font-bold">Upload</p>
            <Select
              value={uploadTarget}
              onValueChange={setTarget}
              aria-label="Upload destination"
              options={[...(org.data?.me.role === 'company_admin' ? [{ value: 'company', label: 'Company-wide' }] : []), ...writable.map((d) => ({ value: d.id, label: d.name }))]}
            />
            <label className="flex items-center gap-2 text-[12.5px]">
              <input type="checkbox" checked={knowledge} onChange={(e) => setKnowledge(e.target.checked)} /> Add to knowledge base (agents in this scope may read it)
            </label>
            <input ref={input} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <button
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) upload(f);
              }}
              className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-strong px-4 py-8 text-center text-[12.5px] text-muted hover:border-brand/50 hover:bg-brand-soft/30"
            >
              <Upload className="h-6 w-6" />
              {busy ? 'Uploading…' : 'Drop a file or click to choose'}
              <span className="text-[11px]">PDF, images, Office docs, text, Markdown, CSV, JSON · max 25 MB</span>
            </button>
          </Card>
        )}
      </div>
    </div>
  );
}
