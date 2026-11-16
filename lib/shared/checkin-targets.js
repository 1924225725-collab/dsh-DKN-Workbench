const targets=new Map();
export function registerCheckinTarget(id,handler){
  targets.set(id,handler);
  return()=>{if(targets.get(id)===handler)targets.delete(id);};
}
export function runCheckinTarget(id,options){
  const target=targets.get(id);
  return target?target(options):Promise.resolve({state:'unavailable'});
}
