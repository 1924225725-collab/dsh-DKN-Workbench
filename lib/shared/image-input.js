import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {prepareImages,imageTarget,hasImageBlocks} from '../cn/images.js';
export {imageTarget,hasImageBlocks};
export async function imageInput(options,attachments,supported=true){
  return prepareImages(options,{attachments:options.imageAttachments||attachments,supportsImages:supported});
}
export async function acpImagePrompt(options,attachments,supported,textProject){
  const prepared=await imageInput(options,attachments,supported);
  return [{type:'text',text:textProject(prepared.options.messages)},...prepared.nativeImages.map(image=>({type:'image',mimeType:image.source.media_type,data:image.source.data}))];
}
export async function imageFiles(images){
  if(!images.length)return{paths:[],close:async()=>{}};
  const directory=await mkdtemp(join(tmpdir(),'dkn-images-'));
  const close=()=>rm(directory,{recursive:true,force:true});
  try{const paths=[];for(const [index,image]of images.entries()){
    const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}[image.source.media_type];
    const path=join(directory,`${index}.${ext}`);await writeFile(path,Buffer.from(image.source.data,'base64'),{mode:0o600});paths.push(path);
  }return{paths,close};}catch(error){await close();throw error;}
}

// Symbol cannot be supplied through the public JSON operation endpoint.
export const nativeImageInput=Symbol('native-image-input');
