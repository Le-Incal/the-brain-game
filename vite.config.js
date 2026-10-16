import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const page = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glb'],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: page('./index.html'),
        // The landing plates B and C, working, on staging while we choose (Kyle, 2026-10-15).
        landingB: page('./landing/b/index.html'),
        landingC: page('./landing/c/index.html'),
      },
    },
  },
});
