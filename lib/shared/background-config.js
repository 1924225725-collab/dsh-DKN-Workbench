const readers=new Map();
export function registerBackgroundConfig(id,read){readers.set(id,read);return()=>{if(readers.get(id)===read)readers.delete(id);};}
export function backgroundProviderConfig(){return Object.fromEntries([...readers].map(([id,read])=>[id,read()]));}
