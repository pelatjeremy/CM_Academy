import {spawnSync} from 'node:child_process';
import {Client} from 'pg';
import {demoTarget} from '../lib/demo-target.js';
let db;
try{
 const target=demoTarget();db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
 if((await db.query('SELECT current_database() AS name')).rows[0].name!==target.name)throw new Error('Destination incohérente.');
 const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--config','prisma.demo.config.ts'],{cwd:new URL('../',import.meta.url),env:process.env,stdio:'inherit',windowsHide:true});
 if(result.status!==0)throw new Error('Migration de démonstration en échec.');
 console.log('Migrations de démonstration appliquées explicitement.');
}catch{console.error('Migration refusée ou échouée. Vérifier la base de démonstration et sa configuration privée.');process.exitCode=1;}finally{await db?.end();}
