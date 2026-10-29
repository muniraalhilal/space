import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

const web = path.resolve(__dirname, '../web/src');
const shim = (f: string) => path.resolve(__dirname, 'src/shims', f);

/**
 * Builds the existing web UI (apps/web) as one self-contained page.
 * Next.js-only modules and the HTTP API client are swapped for in-page equivalents.
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwind(), viteSingleFile({ removeViteModuleLoader: true })],
  resolve: {
    alias: [
      { find: /^@\/lib\/api$/, replacement: shim('api.ts') },
      { find: /^@\/lib\/realtime$/, replacement: shim('realtime.ts') },
      { find: /^next\/link$/, replacement: shim('next-link.tsx') },
      { find: /^next\/navigation$/, replacement: shim('next-navigation.ts') },
      { find: /^next\/dynamic$/, replacement: shim('next-dynamic.tsx') },
      { find: /^@space\/shared$/, replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
      { find: /^@\//, replacement: web + '/' },
    ],
    dedupe: ['react', 'react-dom', 'three', '@react-three/fiber'],
  },
  define: { 'process.env.NODE_ENV': JSON.stringify('production'), 'process.env.NEXT_PUBLIC_REALTIME_URL': 'undefined' },
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
    reportCompressedSize: false,
  },
});
