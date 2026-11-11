import PartageDocument from './PartageDocument';
import {useEffect, useRef, useState} from 'react';
import {adminRequest} from './api';
import {formatParis} from './session-time';

function tailleFichier(bytes) {
  return bytes < 1048576 ? Math.ceil(bytes / 1024) + ' Ko' : (bytes / 1048576).toLocaleString('fr-FR', {maximumFractionDigits: 2}) + ' Mo';
}

export default function PiecesJointes({inscriptionId, categorie, fichiers, onVersions, onPending}) {
  const base = '/api/admin/inscriptions/' + encodeURIComponent(inscriptionId) + '/dossier/elements/' + categorie + '/fichiers';
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [conflict, setConflict] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const depotId = useRef(null);
  const uploading = useRef(false);
  const input = useRef(null);
  const latestCallback = useRef(onVersions);
  useEffect(() => { latestCallback.current = onVersions; }, [onVersions]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    adminRequest(base, {signal: controller.signal}).then(data => {
      if (!controller.signal.aborted) {
        setList(data);
        latestCallback.current(categorie, data.versions);
        setConflict(false);
      }
    }).catch(err => {if (!controller.signal.aborted) setError(err.message);});
    return () => controller.abort();
  }, [base, open, attempt, categorie]);

  function selectFile(event) {
    const next = event.target.files[0] || null;
    setFile(next);
    depotId.current = next ? crypto.randomUUID() : null;
    onPending(categorie, !!next);
    setError('');
    setSuccess('');
  }

  async function envoyer() {
    if (uploading.current || !file || !list || conflict) return;
    if (file.size > list.limiteOctets) {
      setError('Le fichier dépasse la limite de ' + tailleFichier(list.limiteOctets) + '.');
      return;
    }
    uploading.current = true;
    setBusy(true);setError('');setSuccess('');
    const data = new FormData();
    data.append('fichier', file);
    try {
      await adminRequest(base, {
        method: 'POST', body: data, timeoutMs: 120000,
        headers: {'x-depot-id': depotId.current, 'x-fichier-revision': String(list.revision)},
      });
      // Le dépôt est confirmé même si le rafraîchissement de la liste doit être repris.
      setFile(null);depotId.current = null;input.current.value = '';onPending(categorie, false);
      setSuccess('Pièce jointe déposée. Le suivi manuel reste à renseigner séparément.');
      const versions = await adminRequest(base);
      setList(versions);onVersions(categorie, versions.versions);
    } catch (err) {
      setError(err.message);
      if (err.code === 'FILE_CONFLICT') setConflict(true);
    } finally {
      uploading.current = false;setBusy(false);
    }
  }

  return <details className="admin-attachments" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>Pièces jointes · {list?.versions.length ?? fichiers.length} version(s)</summary>
    {open && <>
      {!list && !error && <p role="status">Chargement des versions…</p>}
      {error && <div className="admin-notice error" role="alert"><p>{error}</p>
        <button type="button" className="admin-button secondary" disabled={busy} onClick={() => {setError('');setAttempt(n => n + 1);}}>Actualiser les versions</button>
      </div>}
      {success && <p className="admin-notice success" role="status">{success}</p>}
      {list && <>
        <p>PDF, JPEG ou PNG. Un fichier par dépôt, {tailleFichier(list.limiteOctets)} maximum. Chaque dépôt conserve les versions précédentes.</p>
        <label className="admin-label" htmlFor={categorie + '-fichier'}>Choisir une pièce jointe</label>
        <input className="admin-file-input" id={categorie + '-fichier'} type="file" ref={input}
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy} onChange={selectFile} />
        <button type="button" className="admin-button secondary" disabled={busy || !file || conflict} onClick={envoyer}>
          {busy ? 'Dépôt en cours…' : 'Déposer une nouvelle version'}
        </button>
        {busy && <p role="status">Envoi et vérification du fichier…</p>}
        {!list.versions.length ? <p>Aucune pièce jointe.</p> : <ol className="admin-file-versions">
          {list.versions.map(version => <li key={version.id}>
            <a href={base + '/' + version.id + '/telecharger'} download>
              Télécharger la version {version.version} · {version.nomOriginal}
            </a>
            <PartageDocument base={base} version={version} onRefresh={async()=>{const data=await adminRequest(base);setList(data);onVersions(categorie,data.versions);}} />
            <p>{tailleFichier(version.taille)} · {version.typeMime}</p>
            <p><time dateTime={version.date}>{formatParis(version.date)}</time> · {version.auteur.email}</p>
          </li>)}
        </ol>}
      </>}
    </>}
  </details>;
}
