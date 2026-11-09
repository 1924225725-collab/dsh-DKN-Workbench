// Browser verification uses the actual DSH row and primitive source with synthetic data.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const reference=resolve('research/dsh-full-rc1');
const {build}=require(resolve(reference,'node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild'));
await build({stdin:{contents:`import {ProjectRowItem} from './packages/client/ui-workspace/src/client/rows/Rows.tsx';
import * as primitives from './packages/client/ui-primitives/src/index.ts';
import browser from './packages/client/ui-workspace/src/client/rows/WorkspaceBrowser.module.css';
import rows from './packages/client/ui-workspace/src/client/rows/Rows.module.css';
import {installIconSprite} from './packages/client/ui-theme/src/client/icon-sprite.ts';
installIconSprite({effect:fn=>fn(),on(){}},undefined);
window.nativeAppearance={ProjectRowItem,primitives,browser,rows};`,resolveDir:reference,loader:'tsx'},loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'},bundle:true,format:'iife',platform:'browser',outfile:'research/ui/native-fixture.js',plugins:[{name:'shared-react',setup(b){b.onResolve({filter:/^react(?:-dom)?$/},args=>({path:args.path,namespace:'shared-react'}));b.onLoad({filter:/.*/,namespace:'shared-react'},args=>({contents:`module.exports=window.${args.path==='react'?'React':'ReactDOM'};`,loader:'js'}));}}]});
