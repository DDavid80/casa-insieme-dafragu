import {build} from 'esbuild';
import path from 'node:path';
const root=process.cwd();
await build({entryPoints:['tests/ticket-split.integration.ts'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const __dirname='/tmp';"},bundle:true,platform:'node',format:'esm',outfile:'/tmp/ticket-split-test.mjs',plugins:[{name:'test-db',setup(b){b.onResolve({filter:/^\.\./},args=>{const p=path.resolve(path.dirname(args.importer),args.path);if(p===path.join(root,'db'))return {path:path.join(root,'parallel-ui/browser-db.ts')};if(p===path.join(root,'lib/app-security'))return {path:'security',namespace:'stub'};});b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export async function requireAppAccess(){return null};export async function verifyRecoveryCode(){return true}'}));}}]});
await import('file:///tmp/ticket-split-test.mjs');
