/**
 * File download links in the shared UI point at `/api/orgs/:org/files/:id/download`. Here they are
 * resolved through the in-page API (same permission check) and saved with the viewer's consent.
 */
import { api, errorMessage } from '@/lib/api';
import { toast } from 'sonner';
import { caps } from './backend/caps';

export function installDownloadHandler() {
  document.addEventListener(
    'click',
    async (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      const href = a?.getAttribute('href') ?? '';
      const m = href.match(/^\/api(\/orgs\/[^/]+\/files\/[^/]+\/download)$/);
      if (!m) return;
      e.preventDefault();
      try {
        const f = await api.get<{ name: string; mime: string; url: string | null; text: string | null }>(m[1]);
        let data: Blob;
        if (f.url) data = await (await fetch(f.url)).blob();
        else data = new Blob([f.text ?? ''], { type: f.mime });
        if (!caps.downloads) {
          if (f.url) window.open(f.url, '_blank', 'noopener');
          else toast.error('Downloads aren’t available in this view.');
          return;
        }
        await caps.downloads.save({ filename: f.name, data });
      } catch (err: any) {
        if (err?.code === 'declined' || err?.code === 'cancelled') return;
        toast.error(errorMessage(err));
      }
    },
    true,
  );
}
