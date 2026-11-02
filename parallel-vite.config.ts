import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root=process.cwd();
export default defineConfig({
  root: 'parallel-ui', publicDir:'../public', base: '/casa-insieme-dafragu/',
  plugins: [{name:'sheets-original-api',enforce:'pre',resolveId(source,importer){
    if(!importer||!source.startsWith('.'))return;
    const target=path.resolve(path.dirname(importer),source);
    if(target===path.join(root,'db'))return path.join(root,'parallel-ui/browser-db.ts');
    if(target===path.join(root,'lib/app-security'))return path.join(root,'parallel-ui/browser-security.ts');
  }},react()],
  build:{outDir:'../parallel-dashboard',emptyOutDir:true},
});
