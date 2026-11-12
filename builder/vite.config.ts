import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    outDir: 'builder-dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    rollupOptions: { input: 'builder/index.html' },
  },
});
