import path from 'node:path';
import express from 'express';
export function serveFrontend(app,root){
 if(!path.isAbsolute(root))throw new Error('Répertoire frontend absolu requis.');
 app.use('/api',(req,res)=>res.status(404).json({error:'Route introuvable.'}));
 app.use('/assets',express.static(path.join(root,'assets'),{dotfiles:'deny',immutable:true,maxAge:'1y',index:false,redirect:false}));
 for(const name of ['favicon.svg','icons.svg'])app.get('/'+name,(req,res)=>res.sendFile(path.join(root,name)));
 app.get(/^\/(?:formations(?:\/[^/]+)?|admin(?:\/[^.]*)?|stagiaire(?:\/[^.]*)?)?\/?$/,(req,res)=>res.set('Cache-Control','no-store').sendFile(path.join(root,'index.html')));
}
