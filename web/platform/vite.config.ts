// Separate Vite build for the control-plane (platform superadmin) SPA — a different
// bundle from the tenant app (docs/22 "App topology"), but it REUSES the tenant app's
// design system (@/shared/ui) via the `@` alias. Its own auth/api are platform-scoped.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '../src') }, // reuse tenant shared kernel (ui, types)
  },
  build: { outDir: path.resolve(__dirname, 'dist') },
  server: { host: '0.0.0.0', port: 5174 },
});
