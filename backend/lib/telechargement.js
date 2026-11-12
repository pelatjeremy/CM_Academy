export async function telechargerDocument(storage, file, res) {
 let handle;
 try {
  handle=await storage.openObject(file.stockageKey,file.stockageClassement);
  if((await handle.stat()).size!==file.taille)throw new Error();
 }catch{if(handle)await handle.close().catch(()=>{});return res.status(503).json({error:'Le fichier est momentanément indisponible.'});}
 res.attachment(file.nomOriginal);
 res.set({'Content-Type':file.typeMime,'Content-Length':String(file.taille),'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
 const stream=handle.createReadStream();stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
