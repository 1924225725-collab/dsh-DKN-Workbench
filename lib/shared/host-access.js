export function hostAccessRejected(ctx,req,res){
 let code=503;
 try{if(typeof ctx?.connection?.requestRejection==='function')code=ctx.connection.requestRejection(req);}catch{}
 if(code===undefined)return false;
 res.writeHead([401,403,503].includes(code)?code:403,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify({error:code===503?'DSH 访问检查尚未就绪':'DSH 拒绝了此请求'}));return true;
}
export function guardedHostRoute(ctx,handler){return(req,res)=>{if(hostAccessRejected(ctx,req,res))return;return handler(req,res);};}
