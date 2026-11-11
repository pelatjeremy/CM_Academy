import path from 'node:path';
export function demoTarget(env=process.env){
 if(env.DEMO_MODE!=='true')throw new Error('DEMO_MODE=true est obligatoire pour cette opération.');
 const url=new URL(env.DATABASE_URL),name=decodeURIComponent(url.pathname.slice(1));
 if(!/^cmh_academy_demo(?:_[a-z0-9]+)?$/.test(name)||name!==env.DEMO_DATABASE_NAME)throw new Error('Destination refusée : seule la base de démonstration explicitement nommée est autorisée.');
 if(!env.DOCUMENT_STORAGE_DIR||!path.isAbsolute(env.DOCUMENT_STORAGE_DIR))throw new Error('Un stockage privé de démonstration absolu est obligatoire.');
 return {name,root:path.resolve(env.DOCUMENT_STORAGE_DIR)};
}
