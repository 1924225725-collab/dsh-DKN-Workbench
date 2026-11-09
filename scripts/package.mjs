import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url)),pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const destination=fileURLToPath(new URL('../releases/',import.meta.url));
await mkdir(destination,{recursive:true});
const npm=process.env.npm_execpath;
if(!npm)throw new Error('请通过 npm run package 创建发布包');
const result=spawnSync(process.execPath,[npm,'pack','--pack-destination',destination,'--cache',join(root,'research','npm-cache'),'--json'],{cwd:root,encoding:'utf8',windowsHide:true});
if(result.status!==0)throw new Error(result.stderr||result.stdout||'npm pack 失败');
const [{filename}]=JSON.parse(result.stdout),path=new URL(`../releases/${filename}`,import.meta.url),bytes=await readFile(path),digest=createHash('sha256').update(bytes).digest('hex');
await writeFile(new URL(`../releases/${filename}.sha256`,import.meta.url),`${digest}  ${filename}\n`,'utf8');
console.log(`${pkg.name}@${pkg.version}: ${filename}\nSHA-256 ${digest}`);
