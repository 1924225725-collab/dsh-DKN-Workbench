import {randomUUID} from 'node:crypto';
const invalid=message=>Object.assign(new Error(message),{status:400,code:'invalid_image',apiExportFault:true});
function dimensions(data,type){
  if(type==='image/png'&&data.length>=33&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&data.toString('ascii',12,16)==='IHDR')return[data.readUInt32BE(16),data.readUInt32BE(20)];
  if(type==='image/jpeg'&&data[0]===255&&data[1]===216){
    let p=2;while(p+4<data.length){if(data[p++]!==255)break;while(data[p]===255)p++;const marker=data[p++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;const size=data.readUInt16BE(p);if(size<2||p+size>data.length)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&size>=8)return[data.readUInt16BE(p+5),data.readUInt16BE(p+3)];p+=size;
    }
  }
  throw invalid('API 图片须为有效 PNG 或 JPEG；请先转换其他格式。');
}
/** No URL fetching or file reads. Payloads live in one request only. */
export function apiImages(){
  const versions=new Map();let total=0;
  return{
    block(value){
      if(!value||typeof value!=='object'||Object.keys(value).some(k=>!['url','detail'].includes(k))||!['auto','low','high',undefined].includes(value.detail))throw invalid('image_url 格式无效。');
      const match=typeof value.url==='string'&&value.url.match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/);
      if(!match)throw invalid('图片请使用 PNG/JPEG 的 Base64 data URL，不读取网络地址或本地路径。');
      const [ ,mediaType,encoded]=match;total+=encoded.length;
      if(versions.size>=5||total>8*1024*1024||encoded.length>Math.ceil(2*1024*1024/3)*4)throw invalid('最多5张图片，单张2 MiB，Base64合计8 MiB。');
      const data=Buffer.from(encoded,'base64');if(!data.length||data.length>2*1024*1024||data.toString('base64')!==encoded)throw invalid('图片 Base64 编码或大小无效。');
      const [width,height]=dimensions(data,mediaType);if(!width||!height||width>1920||height>1920)throw invalid('API 图片最长边须不超过1920像素，请先缩小。');
      const attachmentId=randomUUID(),ref={attachmentId,mediaType,bytes:data.length,width,height};versions.set(attachmentId,{...ref,data});return{type:'image',attachment:ref};
    },
    source:{async readImageRequest(ref,_target,signal){signal?.throwIfAborted();const version=versions.get(ref.attachmentId);if(!version)throw invalid('图片不属于当前 API 请求。');return version;}},
  };
}
