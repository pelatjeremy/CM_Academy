import {open} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {z} from 'zod';
import {createDocumentStorage} from './documents.js';
import {probleme} from './pedagogie-errors.js';

const text=max=>z.string().trim().max(max).refine(v=>!v.includes('\0'),'Caractère non autorisé.');
export const videoMetadata=z.object({titre:text(160).min(1,'Le titre est obligatoire.'),description:text(3000),transcription:text(30000)}).strict();
export const videoSelect={id:true,version:true,titre:true,description:true,transcription:true,taille:true,dureeSecondes:true,date:true};
export const adminVideoSelect={...videoSelect,nomOriginal:true,retireAt:true,auteur:{select:{email:true}},retirePar:{select:{email:true}}};

export function createVideoStorage(config={}) {
 const maxFileBytes=Number(config.maxFileBytes??process.env.VIDEO_MAX_FILE_BYTES??536870912);
 return createDocumentStorage({...config,maxFileBytes,fields:3,types:new Map([['.mp4','video/mp4']]),mimeTypes:['video/mp4']});
}

export const videoProbeError='Validation vidéo indisponible : ffprobe absent, inexécutable ou incompatible. Configurez VIDEO_FFPROBE_PATH avec ffprobe 6.1 ou ultérieur, puis redémarrez le backend.';
export async function videoProbeStatus(probePath=process.env.VIDEO_FFPROBE_PATH||'ffprobe') {
 return new Promise(resolve=>execFile(probePath,['-version'],{windowsHide:true,timeout:10000,maxBuffer:65536},(error,stdout)=>{
  const match=stdout?.match(/^ffprobe version n?(\d+)\.(\d+)/);
  const available=!error&&!!match&&(Number(match[1])>6||(Number(match[1])===6&&Number(match[2])>=1));
  resolve(available?{available:true,version:match[1]+'.'+match[2]}:{available:false,error:videoProbeError});
 }));
}

// Validate atom boundaries without reading the media payload into memory. Reject truncated,
// fragmented or non-faststart files; ffprobe separately checks packets and stream codecs.
export async function validateMp4(filename,probePath=process.env.VIDEO_FFPROBE_PATH||'ffprobe') {
 if(!(await videoProbeStatus(probePath)).available)throw probleme(503,videoProbeError);
 const handle=await open(filename,'r');
 try {
  const {size}=await handle.stat();let offset=0,moov=false,mdat=false,ftyp=false,atoms=0;
  while(offset<size) {
   if(++atoms>10000||size-offset<8)throw probleme(422,'Structure MP4 incomplète ou non prise en charge.');
   const header=Buffer.alloc(16);const {bytesRead}=await handle.read(header,0,Math.min(16,size-offset),offset);
   let length=header.readUInt32BE(0),headerSize=8;const type=header.toString('ascii',4,8);
   if(length===1){if(bytesRead<16)throw probleme(422,'En-tête MP4 incomplet.');const n=header.readBigUInt64BE(8);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw probleme(422,'Taille MP4 invalide.');length=Number(n);headerSize=16;}
   else if(length===0)length=size-offset;
   if(length<headerSize||offset+length>size)throw probleme(422,'Fichier MP4 tronqué.');
   if(offset===0&&type!=='ftyp')throw probleme(422,'Le fichier doit être un MP4 standard.');
   if(type==='ftyp')ftyp=true;
   if(type==='moof')throw probleme(422,'Les MP4 fragmentés ne sont pas pris en charge.');
   if(type==='moov'){if(moov||mdat)throw probleme(422,'Exportez le MP4 avec démarrage rapide (faststart).');moov=true;}
   if(type==='mdat'){if(!moov||length<=headerSize)throw probleme(422,'Exportez un MP4 complet avec démarrage rapide (faststart).');mdat=true;}
   offset+=length;
  }
  if(!ftyp||!moov||!mdat)throw probleme(422,'Le fichier MP4 ne contient pas de vidéo complète.');
 } finally {await handle.close();}
 const result=await new Promise((resolve,reject)=>execFile(probePath,[
  '-v','error','-protocol_whitelist','file','-enable_drefs','0','-count_packets','-show_entries',
  'format=format_name,duration:stream=codec_name,codec_type,codec_tag_string,pix_fmt,nb_read_packets','-of','json',filename
 ],{windowsHide:true,timeout:120000,maxBuffer:1048576},(error,stdout,stderr)=>{
  if(error){const unavailable=['ENOENT','EACCES','EPERM','ENOEXEC'].includes(error.code);reject(probleme(unavailable?503:422,unavailable?videoProbeError:'Le MP4 est illisible ou sa validation a dépassé le délai autorisé.'));return;}
  if(stderr.trim()){reject(probleme(422,'Le MP4 contient des données vidéo endommagées.'));return;}
  try{resolve(JSON.parse(stdout));}catch{reject(probleme(422,'Le MP4 est illisible.'));}
 }));
 const streams=result.streams||[],videos=streams.filter(s=>s.codec_type==='video'),audio=streams.filter(s=>s.codec_type==='audio');
 const duration=Number(result.format?.duration);
 if(!result.format?.format_name?.split(',').includes('mp4')||videos.length!==1||audio.length>1||streams.length!==videos.length+audio.length||videos[0].codec_name!=='h264'||!['avc1','avc3'].includes(videos[0].codec_tag_string)||videos[0].pix_fmt!=='yuv420p'||audio.some(s=>s.codec_name!=='aac'||s.codec_tag_string!=='mp4a')||streams.some(s=>!Number.isFinite(Number(s.nb_read_packets))||Number(s.nb_read_packets)<1)||!Number.isFinite(duration)||duration<=0||duration>86400)
  throw probleme(422,'MP4 attendu : vidéo H.264 8 bits yuv420p, audio AAC facultatif, durée maximale 24 h.');
 return duration;
}

// One range at a time. Malformed/unsupported ranges are ignored (200), as allowed by
// RFC 9110. Valid but unsatisfiable ranges produce 416. HEAD always describes full GET.
export function videoRange(value,size) {
 if(!value||value.length>200||!/^bytes=\d*-\d*$/.test(value))return null;
 const [,a,b]=/^bytes=(\d*)-(\d*)$/.exec(value);if(!a&&!b)return null;
 if([a,b].some(v=>v&&!Number.isSafeInteger(Number(v))))return null;
 if(!a){const suffix=Number(b);return suffix===0?false:{start:Math.max(0,size-suffix),end:size-1};}
 const start=Number(a),end=b?Number(b):size-1;
 if(b&&end<start)return null;
 if(start>=size)return false;
 return {start,end:Math.min(end,size-1)};
}

export async function streamVideo(storage,file,req,res) {
 let handle;
 try {handle=await storage.openObject(file.stockageKey);if((await handle.stat()).size!==file.taille)throw new Error('SIZE');}
 catch{await handle?.close().catch(()=>{});return res.status(503).json({error:'La vidéo est momentanément indisponible.'});}
 const etag='"'+file.empreinte+'"';
 const range=req.method==='HEAD'||(req.get('if-range')&&req.get('if-range')!==etag)?null:videoRange(req.get('range'),file.taille);
 res.set({'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin',ETag:etag});
 if(range===false){await handle.close();return res.status(416).set('Content-Range','bytes */'+file.taille).end();}
 const start=range?.start??0,end=range?.end??file.taille-1;
 res.status(range?206:200).set('Content-Length',String(end-start+1));
 if(range)res.set('Content-Range',`bytes ${start}-${end}/${file.taille}`);
 if(req.method==='HEAD'){await handle.close();return res.end();}
 if(res.destroyed){await handle.close();return;}
 const stream=handle.createReadStream({start,end,highWaterMark:64*1024});
 const close=()=>stream.destroy();res.once('close',close);
 stream.once('close',()=>res.off('close',close));stream.once('error',()=>res.destroy());
 stream.pipe(res);
}
