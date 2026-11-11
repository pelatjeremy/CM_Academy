import { useEffect, useRef, useState } from 'react';
import { adminRequest } from './api';
import { FormField, PublicationBadge } from './CatalogueResource';
import { formationSections, formationFields, blankFormation, formationValues } from './formation-fields';

export default function FormationEditor({ id, setDirty }) {
  const [values, setValues] = useState(blankFormation);
  const [baseline, setBaseline] = useState(blankFormation);
  const [record, setRecord] = useState(null);
  const [options, setOptions] = useState({ poles: [], formateurs: [] });
  const [state, setState] = useState('chargement');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [conflict, setConflict] = useState(false);
  const [success, setSuccess] = useState('');
  const loadedId = useRef(null);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const missing = record && !dirty ? record.publication.missing : formationFields.filter(field =>
    (field.required || field.publication) && (Array.isArray(values[field.name]) ? !values[field.name].length : !String(values[field.name]).trim())
  ).map(field => ({ field: field.name, label: field.label }));

  useEffect(() => {
    if (id && loadedId.current === id) return;
    const controller = new AbortController();
    Promise.all([
      adminRequest('/api/admin/formations/options', { signal: controller.signal }),
      id ? adminRequest(`/api/admin/formations/${encodeURIComponent(id)}`, { signal: controller.signal }) : Promise.resolve(null),
    ]).then(([choices, data]) => {
      if (controller.signal.aborted) return;
      setOptions(choices);
      if (data) {
        loadedId.current = data.item.id; const next = formationValues(data.item);
        setRecord(data.item); setValues(next); setBaseline(next);
      }
      setState('pret');
    }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setState('erreur'); } });
    return () => controller.abort();
  }, [id]);
  function change(name, value) {
    const next = { ...values, [name]: value }; setValues(next); setDirty(JSON.stringify(next) !== JSON.stringify(baseline));
    setSuccess(''); setErrors(previous => ({ ...previous, [name]: undefined }));
  }
  function accept(item, message) {
    const next = formationValues(item); loadedId.current = item.id;
    setRecord(item); setValues(next); setBaseline(next); setDirty(false); setSuccess(message); setConflict(false);
    if (!record) window.history.replaceState(null, '', `/admin/catalogue/formations/${encodeURIComponent(item.id)}/modifier`);
  }
  function failure(err) { setError(err.message); setErrors(err.fields || {}); setConflict(err.code === 'CONFLICT'); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setErrors({}); setSuccess('');
    try {
      const body = { ...values, ...(record ? { updatedAt: record.updatedAt } : {}) };
      const data = await adminRequest(`/api/admin/formations${record ? `/${encodeURIComponent(record.id)}` : ''}`, { method: record ? 'PUT' : 'POST', body: JSON.stringify(body) });
      accept(data.item, data.item.publiee ? 'La formation a été enregistrée.' : 'Le brouillon a été enregistré.');
    } catch (err) { failure(err); }
    finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true); setError(''); setErrors({}); setSuccess('');
    try {
      const { item } = await adminRequest(`/api/admin/formations/${encodeURIComponent(record.id)}/publication`, { method: 'POST', body: JSON.stringify({ publiee: !record.publiee, updatedAt: record.updatedAt }) });
      accept(item, item.publiee ? 'La formation est publiée et visible dans le catalogue public.' : 'La formation est dépubliée. Elle est conservée en brouillon.');
    } catch (err) { failure(err); }
    finally { setBusy(false); }
  }
  return <>
    <div className="admin-page-heading"><div><a className="admin-back" href="/admin/catalogue/formations">← Formations</a><h1>{record || id ? 'Modifier la formation' : 'Créer une formation'}</h1><p>Seul le titre est obligatoire pour enregistrer un brouillon.</p></div>{state === 'pret' && <PublicationBadge publiee={record?.publiee || false} />}</div>
    {error && <div className="admin-notice error" role="alert"><p>{error}</p>{conflict && <a href={`/admin/catalogue/formations/${encodeURIComponent(record.id)}/modifier`}>Recharger la fiche</a>}</div>}
    {success && <p className="admin-notice success" role="status">{success}</p>}
    {record && <><nav className="admin-actions pedagogy-tabs" aria-label="Sections de la formation"><a href={`/admin/catalogue/formations/${record.id}/modifier`} aria-current="page">Fiche formation</a><a href={`/admin/catalogue/formations/${record.id}/contenu`}>Contenu pédagogique</a></nav><div className="admin-actions admin-save-actions"><a className="admin-button secondary" href={`/admin/catalogue/sessions?formationId=${record.id}`}>Sessions de cette formation</a><a className="admin-button secondary" href={`/admin/catalogue/sessions/nouveau?formationId=${record.id}`}>Créer une session pour cette formation</a></div></>}
    {state === 'chargement' && <p className="admin-notice" role="status">Chargement de la formation et des associations…</p>}
    {state === 'erreur' && <a className="admin-button secondary" href={window.location.pathname}>Réessayer</a>}
    {state === 'pret' && <form noValidate onSubmit={save} aria-busy={busy}>
      {formationSections.map(section => <fieldset key={section.title} className="admin-panel admin-form-section"><legend>{section.title}</legend>
        {section.fields.map(field => {
          const config = field.name === 'poleId' ? { ...field, options: options.poles.map(pole => ({ value: pole.id, label: pole.titre })) }
            : field.name === 'formateurIds' ? { ...field, options: options.formateurs.map(person => ({ value: person.id, label: person.nom })) } : field;
          return <FormField key={field.name} field={config} value={values[field.name]} error={errors[field.name]} disabled={busy} onChange={value => change(field.name, value)} />;
        })}
        {section.title === '1. Présentation' && !options.poles.length && <p>Aucun pôle disponible. <a href="/admin/catalogue/poles/nouveau">Créer un pôle</a>.</p>}
      </fieldset>)}
      <section className="admin-panel admin-publication" aria-labelledby="publication-title"><h2 id="publication-title">6. Publication</h2><PublicationBadge publiee={record?.publiee || false} />
        <p>Le résumé et le tarif peuvent rester non renseignés. Les autres éléments ci-dessous doivent être complétés pour publier.</p>
        {missing.length ? <><h3>Éléments manquants</h3><ul>{missing.map(item => <li key={item.field}><a href={`#${item.field}`}>{item.label}</a></li>)}</ul></> : <p>Les éléments de publication sont renseignés. Le serveur les vérifiera à nouveau.</p>}
        {dirty && <p>Enregistrez vos modifications avant de changer la publication.</p>}
        {!record && <p>Enregistrez d’abord le brouillon avant de publier.</p>}
        <button type="button" className="admin-button secondary" disabled={!record || busy || dirty || conflict} onClick={publish}>{record?.publiee ? 'Dépublier la formation' : 'Publier la formation'}</button>
      </section>
      <div className="admin-actions admin-save-actions"><button className="admin-button" disabled={busy || conflict} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer la formation'}</button><a className="admin-button secondary" href="/admin/catalogue/formations">Retour à la liste</a></div>
    </form>}
  </>;
}
