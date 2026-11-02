import base from './parallel-vite.config';
export default {...base,build:{ssr:'test-entry.ts',outDir:'../.parallel-test-build',emptyOutDir:true,rollupOptions:{output:{entryFileNames:'engine.mjs'}}}};
