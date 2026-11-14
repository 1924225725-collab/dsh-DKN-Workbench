// Browser verification uses the actual DSH row and primitive source with synthetic data.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
const rc3=process.env.DKN_TEST_DSH_UI==='rc3';
const reference=resolve(rc3?'research/dsh-rc3-reference/node_modules/@deepseek-ai':'research/dsh-full-rc1');
const {build}=require(resolve('research/dsh-full-rc1/node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild'));
const prefix=rc3?'./dsh-client-ui-':'./packages/client/ui-';
await build({nodePaths:rc3?[resolve('research/dsh-rc3-ui/node_modules')]:[],stdin:{contents:`import {ProjectRowItem} from '${prefix}workspace/src/client/rows/Rows.tsx';
import * as primitives from '${rc3?'@deepseek-ai/dsh-client-ui-primitives':'./packages/client/ui-primitives/src/index.ts'}';
import browser from '${prefix}workspace/src/client/rows/WorkspaceBrowser.module.css';
import rows from '${prefix}workspace/src/client/rows/Rows.module.css';
import {installIconSprite} from '${prefix}theme/src/client/icon-sprite.ts';
installIconSprite({effect:fn=>fn(),on(){}},undefined);
window.nativeAppearance={ProjectRowItem,primitives,browser,rows};`,resolveDir:reference,loader:'tsx'},loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'},bundle:true,format:'iife',platform:'browser',outfile:'research/ui/native-fixture.js',plugins:[{name:'shared-react',setup(b){b.onResolve({filter:/^react(?:-dom)?$/},args=>({path:args.path,namespace:'shared-react'}));b.onLoad({filter:/.*/,namespace:'shared-react'},args=>({contents:`module.exports=window.${args.path==='react'?'React':'ReactDOM'};`,loader:'js'}));if(rc3)b.onResolve({filter:/^@deepseek-ai\//},args=>{const parts=args.path.split('/'),name=parts[1],sub=parts.slice(2).join('/');const root=name==='dsh-client-ui-primitives'?resolve('research/dsh-rc3-ui/node_modules/@deepseek-ai',name):resolve(reference,name);const file=resolve(root,'lib',sub?sub+'.js':'index.js');return existsSync(file)?{path:file}:undefined;});}}]});
