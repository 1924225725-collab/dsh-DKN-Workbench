import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ApiExportService} from './api-export-service.js';
export async function offlineApiState(directory,message,cached={}){
 let saved={},settings={port:18789,publicModel:'dkn',autoStart:false,models:[],concurrency:1,timeoutMs:90000};
 try{saved=JSON.parse(await readFile(join(directory,'api-export','settings.json'),'utf8'));settings={...settings,...ApiExportService.prototype.validateSettings.call({allowEphemeral:false},saved)};}catch(e){if(e.code!=='ENOENT')message+=' API 设置未能读取，请保留原文件并检查。';}
 return{...settings,baseUrl:'http://127.0.0.1:'+settings.port+'/v1',running:false,hasKey:/^[a-f0-9]{64}$/.test(saved.keyHash||''),keyHint:typeof saved.keyHint==='string'?saved.keyHint:'',keyCreatedAt:saved.keyCreatedAt||null,catalog:cached.catalog||[],records:cached.records||[],active:0,queued:0,enabledCount:0,lastError:message,runtimeUnavailable:true};
}
export async function offlineCheckinState(directory,message){let data={enabled:false};try{const saved=JSON.parse(await readFile(join(directory,'auto-checkin.json'),'utf8'));data={enabled:saved.enabled===true,scheduledAt:saved.scheduledAt,lastRun:saved.lastRun};}catch{}return{...data,running:false,backgroundReady:false,error:message};}
