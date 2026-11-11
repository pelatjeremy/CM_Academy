import path from 'node:path';
import prisma from '../lib/prisma.js';
import {demoTarget} from '../lib/demo-target.js';
import {prepareDemoAssets} from './lib/demo-assets.mjs';
import {seedDemo} from './lib/seed-demo.mjs';
try{
 if(!process.argv.includes('--confirm-demo-only'))throw new Error('Confirmation explicite requise.');
 const target=demoTarget(),assets=await prepareDemoAssets(path.join(target.root,'../.demo-assets'));
 const result=await seedDemo({prisma,root:target.root,assets,passwords:{admin:process.env.DEMO_ADMIN_PASSWORD,student:process.env.DEMO_STUDENT_PASSWORD,other:process.env.DEMO_OTHER_PASSWORD}});
 console.log(result.created?'Jeu de démonstration fictif créé. Aucun email envoyé.':'Jeu de démonstration déjà présent : aucune donnée remplacée.');
}catch(error){console.error('Initialisation de démonstration refusée ou échouée ('+(error.code||error.name)+'). Vérifier la destination dédiée, les secrets privés et ffmpeg/ffprobe.');process.exitCode=1;}
finally{await prisma.$disconnect();}
