import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'parallel-ui',
  base: '/casa-insieme-dafragu/',
  plugins: [react()],
  build: { outDir: '../parallel-dashboard', emptyOutDir: true },
});
