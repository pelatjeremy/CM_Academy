import PDFDocument from 'pdfkit';
import {fileURLToPath} from 'node:url';
const normal=fileURLToPath(new URL('../assets/fonts/Vera.ttf',import.meta.url));
const bold=fileURLToPath(new URL('../assets/fonts/VeraBd.ttf',import.meta.url));
const date=value=>new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'shortOffset'});
export function dureeExacte(ms){const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000),s=ms%60000/1000;return `${h} h ${String(m).padStart(2,'0')} min${s?' '+s.toLocaleString('fr-FR',{maximumFractionDigits:3})+' s':''}`;}
export async function genererAttestation(d,{brouillon=false,reference,dateEmission=new Date(),fields={}}={}){
 const doc=new PDFDocument({size:'A4',margins:{top:56,bottom:64,left:56,right:56},bufferPages:true,info:{Title:brouillon?'Brouillon d’attestation':'Attestation individuelle de fin de formation',Author:d.organisme.denomination||'Organisme non renseigné',Creator:'CMH Academy'}});
 const chunks=[];let size=0;
 const finished=new Promise((resolve,reject)=>{doc.on('data',chunk=>{size+=chunk.length;if(size>10485760){doc.destroy(new Error('PDF_LIMIT'));return;}chunks.push(chunk);});doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.registerFont('Corps',normal).registerFont('Titre',bold);
 const width=doc.page.width-112;
 function text(value,{title=false,size=10,color='#273c37'}={}){doc.font(title?'Titre':'Corps').fontSize(size).fillColor(color).text(String(value||'Non renseigné'),56,doc.y,{width,lineGap:3});doc.moveDown(.5);}
 function section(label,value){if(doc.y>doc.page.height-145)doc.addPage();text(label,{title:true,size:11});text(value);doc.moveDown(.4);}
 text(brouillon?'BROUILLON - NON ÉMIS':'ATTESTATION INDIVIDUELLE',{title:true,size:11,color:'#7c5d2d'});
 text(d.dureeSuivieMs<d.dureeProgrammeeMs?'Fin de formation - participation partielle':'Fin de formation',{title:true,size:23});
 text(brouillon?'Aperçu sans valeur d’émission':`Référence : ${reference}`);
 text(`Date ${brouillon?'de l’aperçu':'d’émission'} : ${date(dateEmission)} (Europe/Paris)`);
 if(brouillon&&Object.keys(fields).length)section('Informations à compléter avant émission',Object.values(fields).join('\n'));
 section('Organisme',[d.organisme.denomination||'Dénomination à renseigner',d.organisme.adresse||'Adresse à renseigner',d.organisme.identifiant&&'Identifiant : '+d.organisme.identifiant,d.organisme.representant&&'Représentant déclaré : '+d.organisme.representant].filter(Boolean).join('\n'));
 section('Stagiaire',d.identite.prenom+' '+d.identite.nom);
 section('Formation',d.formation.titre);
 const formats={PRESENTIEL:'Présentiel',WEBINAIRE:'Webinaire',HYBRIDE:'Hybride'};
 section('Modalités de réalisation',[formats[d.formation.format]||'Format à renseigner',d.lieu&&'Lieu : '+d.lieu].filter(Boolean).join('\n'));
 section('Dates et horaires - Europe/Paris',d.seances.map(s=>date(s.debut)+' à '+date(s.fin)).join('\n')||'Dates à renseigner');
 section('Durées',`Durée programmée (séances) : ${dureeExacte(d.dureeProgrammeeMs)}\nDurée de présence renseignée : ${dureeExacte(d.dureeSuivieMs)}${fields.presences?' (relevé incomplet)':''}`);
 section('Objectifs pédagogiques',d.formation.objectifs);
 section('Origine des informations','Présences renseignées manuellement par l’administration. Cette attestation reprend les données enregistrées ; elle ne déclare ni résultat d’évaluation, ni acquis, ni signature électronique.');
 text('Modèle : '+d.modeleVersion,{size:8,color:'#52665e'});
 const range=doc.bufferedPageRange();
 for(let i=range.start;i<range.start+range.count;i++){
  doc.switchToPage(i);doc.save();
  if(brouillon)doc.fillColor('#c8c8c8').opacity(.2).font('Titre').fontSize(56).text('BROUILLON',80,390,{width:440,align:'center',lineBreak:false});
  doc.restore();
  // Le pied de page occupe la marge ; PDFKit ne doit pas créer une page de débordement.
  const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;
  doc.font('Corps').fontSize(8).fillColor('#52665e').text(`${brouillon?'BROUILLON':reference} | Page ${i+1} / ${range.count}`,56,doc.page.height-42,{width,align:'right',lineBreak:false});
  doc.page.margins.bottom=bottom;
 }
 doc.end();return finished;
}
