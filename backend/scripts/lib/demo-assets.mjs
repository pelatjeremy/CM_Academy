import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
export async function prepareDemoAssets(folder,ffmpeg=process.env.DEMO_FFMPEG_PATH||'ffmpeg'){
 await mkdir(folder,{recursive:true,mode:0o700});
 const video=path.join(folder,'observation-demonstration.mp4'),pdf=path.join(folder,'programme-demonstration.pdf');
 execFileSync(ffmpeg,['-v','error','-nostdin','-f','lavfi','-i','testsrc2=size=640x360:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','12','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-y',video],{windowsHide:true,timeout:60000,maxBuffer:1048576});
 const doc=new PDFDocument({size:'A4',margin:56}),chunks=[];
 const done=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.font(fileURLToPath(new URL('../../assets/fonts/Vera.ttf',import.meta.url))).fontSize(22).text('Observer et accompagner le cheval').moveDown().fontSize(11).text('CMH Démonstration — organisme et personnes fictifs.\n\nDurée pédagogique : 14 h. Quatre séances de 3 h 30, en heure de Paris.\n\n1. Observer les besoins et les attitudes.\n2. Préparer une observation dans le calme.\n3. Décrire les signaux et échanger.\n4. Construire une synthèse.\n\nLa progression du parcours est déclarative. Elle ne valide aucune présence ni acquisition.\n\nCe document a été créé pour cette démonstration ; aucun document personnel.');doc.end();await writeFile(pdf,await done,{mode:0o600});
 return {video,pdf,rights:'Mire et son synthétiques créés par FFmpeg pour cette démonstration ; PDF rédigé pour CMH Academy. Aucun contenu tiers.'};
}
