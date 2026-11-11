import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
export async function supportPedagogiqueFictif(){
 const doc=new PDFDocument({size:'A4',margin:56}),chunks=[];
 const done=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.font(fileURLToPath(new URL('../../assets/fonts/Vera.ttf',import.meta.url))).fontSize(22).text('Observer le cheval').moveDown().fontSize(11).text('Support pédagogique fictif — environnement isolé.\n\nObserver les mouvements, décrire les attitudes et préparer une étude au calme.\nCe document ne contient aucune donnée de stagiaire.');doc.end();return done;
}
