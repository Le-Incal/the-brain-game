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
        // The landing, plate C: brain-game.io's front door (Kyle, 2026-10-17).
        landing: page('./landing/index.html'),
      },
    },
  },
});
