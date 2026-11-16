import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomInt,randomUUID} from 'node:crypto';
import {rewardError} from './checkin.js';

const DAY=86400000,OFFSET=8*3600000;
export function checkinWindow(now){
  const dayStart=Math.floor((now+OFFSET)/DAY)*DAY-OFFSET;
  return{day:new Date(dayStart+OFFSET).toISOString().slice(0,10),start:dayStart+11*3600000,end:dayStart+13*3600000};
}
const initial=()=>({enabled:false,day:'',scheduledAt:null,attempted:false,lastRun:null});
const safeState=value=>['claimed','claimable','no-activity','not-eligible','expired','not-started','login-required','client-required','unavailable','error','unknown'].includes(value)?value:'unknown';

export class AutoCheckin{
  constructor({directory,targets,now=Date.now,random=randomInt,intervalMs=30000}){
    this.directory=directory;this.targets=targets;this.now=now;this.random=random;this.data=initial();this.error='';this.closed=false;this.running=false;this.serial=Promise.resolve();this.scheduling=!!intervalMs;
    this.ready=this.load();
    if(intervalMs){this.timer=setInterval(()=>{void this.tick().catch(()=>{});},intervalMs);this.timer.unref?.();}
    void this.ready.then(()=>this.tick()).catch(()=>{});
  }
  async load(){
    try{
      const saved=JSON.parse(await readFile(join(this.directory,'auto-checkin.json'),'utf8'));
      if(typeof saved.enabled!=='boolean'||typeof saved.day!=='string'||saved.day.length>10||!(saved.scheduledAt===null||Number.isSafeInteger(saved.scheduledAt))||typeof saved.attempted!=='boolean')throw Error();
      this.data={...initial(),enabled:saved.enabled,day:saved.day,scheduledAt:saved.scheduledAt,attempted:saved.attempted,lastRun:saved.lastRun?{day:String(saved.lastRun.day).slice(0,10),at:Number(saved.lastRun.at)||0,results:Object.fromEntries(Object.entries(saved.lastRun.results||{}).filter(([key])=>this.targets.some(t=>t.id===key)).map(([key,value])=>[key,safeState(value)]))}:null};
    }catch(e){if(e.code!=='ENOENT')this.error='自动签到设置读取失败，已停止自动执行。请重新保存开关。';}
  }
  async persist(){
    await mkdir(this.directory,{recursive:true});const target=join(this.directory,'auto-checkin.json'),temp=target+'.'+randomUUID()+'.tmp';
    await writeFile(temp,JSON.stringify(this.data,null,2),{mode:0o600});await rename(temp,target);
  }
  enqueue(work){const pending=this.serial.then(work);this.serial=pending.catch(()=>{});return pending;}
  plan(now){
    let window=checkinWindow(now);
    if(now>=window.end||this.data.lastRun?.day===window.day||this.data.day===window.day&&this.data.attempted)window=checkinWindow(window.end+DAY);
    if(this.data.day!==window.day||this.data.scheduledAt===null){
      const earliest=Math.max(now,window.start);
      this.data.day=window.day;this.data.scheduledAt=earliest+this.random(window.end-earliest);this.data.attempted=false;
      return true;
    }
    return false;
  }
  snapshot(){return{...this.data,running:this.running,error:this.error,timeZone:'Asia/Shanghai'};}
  arm(){
    clearTimeout(this.deadline);
    if(this.scheduling&&!this.closed&&this.data.enabled&&!this.error&&this.data.scheduledAt!==null){
      this.deadline=setTimeout(()=>{void this.tick().catch(()=>{});},Math.max(1,this.data.scheduledAt-this.now()));this.deadline.unref?.();
    }
  }
  async setEnabled(enabled){
    if(typeof enabled!=='boolean')throw Error('自动签到开关必须为布尔值。');
    // Stop subsequent platforms immediately even if another platform is in flight.
    if(!enabled)this.data.enabled=false;
    return this.enqueue(async()=>{await this.ready;if(this.closed)throw Error('自动签到服务已停止。');this.data.enabled=enabled;this.error='';if(enabled)this.plan(this.now());
      try{await this.persist();}catch(e){this.data.enabled=false;this.error='设置保存失败，自动签到未启用。';throw Error(this.error);}
      this.arm();return this.snapshot();});
  }
  tick(){return this.enqueue(async()=>{
    await this.ready;if(this.closed||!this.data.enabled||this.error)return;
    const now=this.now();
    if(this.plan(now))try{await this.persist();}catch{this.error='计划保存失败，已停止自动签到。';return;}
    const window=checkinWindow(now);
    if(this.data.day!==window.day||now<window.start||now>=window.end||now<this.data.scheduledAt||this.data.attempted)return;
    // Record the attempt BEFORE external mutation: crashes/uncertain replies never cause blind retries.
    this.data.attempted=true;this.data.lastRun={day:window.day,at:now,results:Object.fromEntries(this.targets.map(t=>[t.id,'unknown']))};
    try{await this.persist();}catch{this.error='执行记录保存失败，本次未签到。';return;}
    this.running=true;
    try{
      for(const target of this.targets){
        if(this.closed||!this.data.enabled)break;
        let value;
        try{
          value=await target.run({claim:false});
          if(value?.state==='claimable'&&!this.closed&&this.data.enabled&&this.now()<window.end)value=await target.run({claim:true});
        }catch(e){value=rewardError(e);}
        this.data.lastRun.results[target.id]=safeState(value?.state);
        try{await this.persist();}catch{this.error='结果保存失败，请手动刷新签到状态核对。';break;}
      }
    }finally{this.running=false;}
  }).finally(()=>this.arm());}
  async close(){this.closed=true;clearInterval(this.timer);clearTimeout(this.deadline);await this.ready;await this.serial;}
}
