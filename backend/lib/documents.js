import path from 'node:path';
import {randomUUID, createHash} from 'node:crypto';
import {createReadStream, createWriteStream, constants} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {mkdir, realpath, lstat, open, link, unlink, readdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import multer from 'multer';
import {fileTypeFromFile} from 'file-type';

const backend = fileURLToPath(new URL('../', import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types = new Map([['.pdf', 'application/pdf'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png']]);
const comparable = value => process.platform === 'win32' ? value.toLowerCase() : value;
const inside = (candidate, parent) => comparable(candidate) === comparable(parent) || comparable(candidate).startsWith(comparable(parent) + path.sep);
export const fichierSelect = {
  partageStagiaire: true, partageRevision: true, historiquePartages: {select: {id:true,partage:true,date:true,auteur:{select:{email:true}}},orderBy:{date:"desc"}},
  id: true, version: true, nomOriginal: true, taille: true, typeMime: true, date: true,
  auteur: {select: {email: true}},
};

export function documentError(code) {
  return Object.assign(new Error(code), {documentCode: code});
}

export function nomSecurise(name) {
  const value = name.normalize('NFC').split(/[\\/]/).at(-1)
    .replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/[<>:"|?*]/g, '_').replace(/^\.+/, '').trim();
  if (!value || value.length > 255) throw documentError('TYPE');
  return value;
}

export async function empreinteFichier(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

export function createDocumentStorage(config = {}) {
  const root = path.resolve(backend, config.root || process.env.DOCUMENT_STORAGE_DIR || '.private-documents');
  const maxFileBytes = Number(config.maxFileBytes ?? process.env.DOCUMENT_MAX_FILE_BYTES ?? 10485760);
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 2147483647) throw new Error('Configuration documentaire invalide.');
  const forbidden = [path.resolve(backend, '../frontend'), path.join(backend, 'public'), path.resolve(backend, '../public')];
  if (root === backend || root === path.resolve(backend, '..') || forbidden.some(parent => inside(root, parent))) {
    throw new Error('Emplacement documentaire invalide.');
  }
  const temporary = path.join(root, 'temporaires');
  const objects = path.join(root, 'objets');

  async function prepare() {
    await mkdir(root, {recursive: true, mode: 0o700});
    const actual = await realpath(root);
    if (forbidden.some(parent => inside(actual, parent))) throw documentError('STORAGE');
    for (const directory of [temporary, objects]) {
      await mkdir(directory, {recursive: true, mode: 0o700});
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw documentError('STORAGE');
    }
  }

  function objectPath(key) {
    if (!uuid.test(key)) throw documentError('STORAGE');
    return path.join(objects, key + '.blob');
  }

  async function discardTemporary(req) {
    if (req.documentTemporary) await unlink(req.documentTemporary).catch(error => {
      if (error.code !== 'ENOENT') throw error;
    });
  }

  const acceptedTypes = config.types || types;
  const upload = multer({
    storage: {
      _handleFile(req, file, callback) {
        const filename = randomUUID() + '.part';
        req.documentTemporary = path.join(temporary, filename);
        const output = createWriteStream(req.documentTemporary, {flags:'wx', mode:0o600});
        const abort = () => file.stream.destroy(documentError('ABORT'));
        req.once('aborted', abort);
        if (req.aborted) abort();
        pipeline(file.stream, output).then(
          () => callback(null, {destination:temporary, filename, path:req.documentTemporary, size:output.bytesWritten}),
          error => callback(error)
        ).finally(() => req.off('aborted', abort));
      },
      _removeFile(req, file, callback) {
        unlink(file.path).then(() => callback(null), error => callback(error.code==='ENOENT'?null:error));
      },
    },
    defParamCharset: 'utf8',
    preservePath: false,
    limits: {fileSize: maxFileBytes, files: 1, fields: config.fields || 0, parts: 1 + (config.fields || 0), fieldSize: 131072, fieldNameSize: 50, headerPairs: 50},
    fileFilter(req, file, callback) {
      try {
        const name = nomSecurise(file.originalname);
        if (acceptedTypes.get(path.extname(name).toLowerCase()) !== file.mimetype || (config.mimeTypes && !config.mimeTypes.includes(file.mimetype))) throw documentError('TYPE');
        callback(null, true);
      } catch (error) {
        callback(error);
      }
    },
  }).single('fichier');

  async function receive(req, res) {
    await prepare();
    if (!req.is('multipart/form-data')) throw documentError('TYPE');
    await new Promise((resolve, reject) => upload(req, res, error => error ? reject(error) : resolve()));
    if (!req.file || !req.file.size) throw documentError('TYPE');
    const expected = acceptedTypes.get(path.extname(nomSecurise(req.file.originalname)).toLowerCase());
    let detected;
    try { detected = await fileTypeFromFile(req.file.path); }
    catch { throw documentError('TYPE'); }
    if (detected?.mime !== expected || req.file.mimetype !== expected) throw documentError('TYPE');
    return {
      nomOriginal: nomSecurise(req.file.originalname),
      taille: req.file.size,
      typeMime: expected,
      empreinte: await empreinteFichier(req.file.path),
    };
  }

  async function promote(req, key) {
    const handle = await open(req.documentTemporary, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    // Lien exclusif sur le même volume : un objet existant ne peut pas être remplacé.
    await link(req.documentTemporary, objectPath(key));
    let directory;
    try {
      directory = await open(objects, 'r');
      await directory.sync();
    } catch (error) {
      // Windows ne fournit pas fsync sur un descripteur de répertoire.
      if (!['EPERM', 'EISDIR', 'EINVAL', 'ENOTSUP', 'EBADF', 'EACCES'].includes(error.code)) throw error;
    } finally {
      if (directory) await directory.close();
    }
    await discardTemporary(req);
  }

  async function discardObject(key) {
    await unlink(objectPath(key)).catch(error => {if (error.code !== 'ENOENT') throw error;});
  }

  // Même promotion exclusive et même audit que pour les dépôts administrateur.
  async function storeGenerated(buffer, key) {
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > maxFileBytes) throw documentError('STORAGE');
    await prepare();
    const req = {documentTemporary: path.join(temporary, randomUUID() + '.part')};
    try {
      await writeFile(req.documentTemporary, buffer, {flag: 'wx', mode: 0o600});
      await promote(req, key);
    } finally { await discardTemporary(req); }
  }

  async function openObject(key) {
    await prepare();
    const filename = objectPath(key);
    const info = await lstat(filename);
    if (!info.isFile() || info.isSymbolicLink()) throw documentError('STORAGE');
    const handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const actual = await handle.stat();
    if (actual.ino !== info.ino || actual.dev !== info.dev) {
      await handle.close();
      throw documentError('STORAGE');
    }
    return handle;
  }

  async function audit(prisma, {cleanTemporary = false, ageMs = 86400000} = {}) {
    await prepare();
    const rows = await prisma.pieceJointe.findMany({select: {id: true, stockageKey: true, taille: true, empreinte: true}});
    // Les supports pédagogiques utilisent les mêmes objets privés et les mêmes sauvegardes.
    if (prisma.supportLecon) rows.push(...await prisma.supportLecon.findMany({select:{id:true,stockageKey:true,taille:true,empreinte:true}}));
    if (prisma.videoLecon) rows.push(...await prisma.videoLecon.findMany({select:{id:true,stockageKey:true,taille:true,empreinte:true}}));
    if (new Set(rows.map(row=>row.stockageKey)).size !== rows.length) throw documentError('STORAGE');
    const references = new Map(rows.map(row => [row.stockageKey, row]));
    const report = {temporaires: [], orphelins: [], manquants: [], alteres: [], inconnus: 0, temporairesNettoyes: 0};
    for (const name of await readdir(temporary)) {
      if (!/^[0-9a-f-]{36}\.part$/i.test(name)) {report.inconnus++;continue;}
      const filename = path.join(temporary, name);
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink()) {report.inconnus++;continue;}
      if (Date.now() - info.mtimeMs < ageMs) continue;
      report.temporaires.push(name);
      if (cleanTemporary) {await unlink(filename);report.temporairesNettoyes++;}
    }
    for (const name of await readdir(objects)) {
      const key = name.replace(/\.blob$/, '');
      if (!uuid.test(key) || name !== key + '.blob') {report.inconnus++;continue;}
      const filename = objectPath(key);
      const info = await lstat(filename);
      if (!info.isFile() || info.isSymbolicLink()) {report.inconnus++;continue;}
      const row = references.get(key);
      if (!row) {
        if (Date.now() - info.mtimeMs >= ageMs) report.orphelins.push(key);
        continue;
      }
      if (info.size !== row.taille || await empreinteFichier(filename) !== row.empreinte) report.alteres.push(row.id);
      references.delete(key);
    }
    report.manquants = [...references.values()].map(row => row.id);
    return report;
  }

  return {maxFileBytes, receive, promote, discardTemporary, discardObject, storeGenerated, openObject, audit};
}
