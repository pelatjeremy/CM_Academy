import {mkdirSync,existsSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../../',import.meta.url)),secrets=path.join(project,'.demo-secrets'),environment=path.join(project,'.demo-environment');
mkdirSync(secrets,{recursive:true,mode:0o700});mkdirSync(environment,{recursive:true,mode:0o700});
const accessFile=path.join(secrets,'access.json');
let access=existsSync(accessFile)?JSON.parse(readFileSync(accessFile,'utf8')):{databasePassword:randomBytes(32).toString('base64url'),sessionSecret:randomBytes(48).toString('hex'),admin:{email:'administration@demo.invalid',password:randomBytes(24).toString('base64url')},student:{email:'alice@demo.invalid',password:randomBytes(24).toString('base64url')},other:{email:'leo@demo.invalid',password:randomBytes(24).toString('base64url')}};
const originArg=process.argv.find(a=>a.startsWith('--origin='));if(originArg){const url=new URL(originArg.slice(9));if(url.protocol!=='https:'||url.origin!==url.href.replace(/\/$/,''))throw new Error('Origine HTTPS exacte requise.');access.origin=url.origin;}
function findProbe(folder){if(!existsSync(folder))return;for(const entry of readdirSync(folder,{withFileTypes:true})){const full=path.join(folder,entry.name);if(entry.isDirectory()){const result=findProbe(full);if(result)return result;}else if(entry.name==='ffprobe.exe'&&full.includes('verified-release'))return full;}}
const probe=process.env.DEMO_FFPROBE_PATH||findProbe(path.join(project,'backend/.local-tools'));
if(!probe)throw new Error('Installer un ffprobe maintenu ou définir DEMO_FFPROBE_PATH.');
const values={DEMO_MODE:'true',DEMO_DATABASE_NAME:'cmh_academy_demo',DATABASE_URL:`postgresql://cmh_demo:${access.databasePassword}@127.0.0.1:5441/cmh_academy_demo`,SESSION_SECRET:access.sessionSecret,APP_ORIGINS:access.origin||'https://demo.example.invalid',DOCUMENT_STORAGE_DIR:path.join(environment,'private').replaceAll('\\','/'),VIDEO_FFPROBE_PATH:probe.replaceAll('\\','/'),DEMO_FFMPEG_PATH:path.join(path.dirname(probe),'ffmpeg.exe').replaceAll('\\','/'),DEMO_ADMIN_PASSWORD:access.admin.password,DEMO_STUDENT_PASSWORD:access.student.password,DEMO_OTHER_PASSWORD:access.other.password,PORT:'3191',BIND_HOST:'127.0.0.1',NODE_ENV:'production',SERVE_FRONTEND:'true',TRUSTED_PROXY:'1',VIDEO_MAX_FILE_BYTES:'52428800'};
writeFileSync(accessFile,JSON.stringify(access,null,2),{mode:0o600});writeFileSync(path.join(secrets,'pg-password.txt'),access.databasePassword,{mode:0o600});
writeFileSync(path.join(secrets,'.env.demo'),Object.entries(values).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600});
console.log('Configuration de démonstration privée prête. Aucun secret affiché.');
