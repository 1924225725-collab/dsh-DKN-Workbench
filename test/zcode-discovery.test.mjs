import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ZCODE_CLI_CANDIDATES,locateZcodeCli} from '../lib/zcode/zcode-runtime.js';

test('automatic ZCode discovery does not probe disconnected arbitrary drive letters',()=>{
 if(process.platform!=='win32')return;
 // A mapped Z: may take 20 seconds to reject statSync; it must not be consulted
 // merely because its drive letter exists in the alphabet.
 const known=new Set([process.env.SystemDrive,process.env.LOCALAPPDATA,process.env.ProgramFiles,process.execPath,process.cwd(),process.env.USERPROFILE].filter(Boolean).map(p=>p.slice(0,2).toUpperCase()));
 const roots=ZCODE_CLI_CANDIDATES.filter(p=>/^[A-Z]:\\ZCode\\/i.test(p));
 for(const path of roots)assert.ok(known.has(path.slice(0,2).toUpperCase()),path);
 assert.ok(roots.length<26);
 const original=fs.statSync;let touched=false;
 try{fs.statSync=function(path,...args){if(/^[A-Z]:\\ZCode\\/i.test(String(path))&&!known.has(String(path).slice(0,2).toUpperCase())){touched=true;throw Error('Disconnected mount');}return original.call(this,path,...args);};locateZcodeCli();assert.equal(touched,false);}finally{fs.statSync=original;}
 assert.equal(locateZcodeCli('X:\\custom\\zcode.cjs'),'X:\\custom\\zcode.cjs');
});
