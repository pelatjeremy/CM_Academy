import { useEffect, useRef, useState } from 'react';
import { adminRequest } from './api';
import { resources } from './resources';

export function ResourceList({ kind }) {
  const config = resources[kind];
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ state: 'chargement', items: [], total: 0 });
  const [retry, setRetry] = useState(0);
  const [poleId, setPoleId] = useState('');
  const [publication, setPublication] = useState('');
  const [options, setOptions] = useState({ poles: [] });
  useEffect(() => {
    if (kind !== 'formations') return;
    const controller = new AbortController();
    adminRequest('/api/admin/formations/options', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setOptions(data);
    }).catch(() => { if (!controller.signal.aborted) setOptions({ poles: [], error: 'Les filtres de pôles sont indisponibles. Réessayez.' }); });
    return () => controller.abort();
  }, [kind, retry]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const filters = new URLSearchParams({ q, page: String(page) });
        if (kind === 'formations' && poleId) filters.set('poleId', poleId);
        if (kind === 'formations' && publication) filters.set('publication', publication);
        const data = await adminRequest(`/api/admin/${kind}?${filters}`, { signal: controller.signal });
        if (!controller.signal.aborted) setResult({ state: 'pret', ...data });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ state: 'erreur', items: [], total: 0, error: error.message });
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [kind, q, page, retry, poleId, publication]);
  const loading = () => setResult(previous => ({ ...previous, state: 'chargement' }));
  return (
    <>
      <div className="admin-page-heading"><div><h1>{config.title}</h1><p>{config.description}</p></div>
        <a className="admin-button" href={`/admin/catalogue/${kind}/nouveau`}>Créer {config.article || 'un'} {config.singular}</a></div>
      <section className="admin-panel" aria-label={`Liste des ${config.title.toLowerCase()}`}>
        <div className="admin-filter-grid"><div><label className="admin-label" htmlFor="catalogue-search">Rechercher</label>
        <input className="admin-input" id="catalogue-search" type="search" value={q} maxLength={100} placeholder={`Rechercher dans les ${config.title.toLowerCase()}`} onChange={event => { setQ(event.target.value); setPage(1); loading(); }} />
        </div>{kind === 'formations' && <><div><label className="admin-label" htmlFor="filter-pole">Pôle</label><select className="admin-input" id="filter-pole" value={poleId} onChange={event => { setPoleId(event.target.value); setPage(1); loading(); }}><option value="">Tous les pôles</option>{options.poles.map(pole => <option key={pole.id} value={pole.id}>{pole.titre}</option>)}</select></div><div><label className="admin-label" htmlFor="filter-publication">Publication</label><select className="admin-input" id="filter-publication" value={publication} onChange={event => { setPublication(event.target.value); setPage(1); loading(); }}><option value="">Tous les états</option><option value="brouillon">Brouillon</option><option value="publiee">Publiée</option></select></div></>}</div>
        {options.error && <p className="admin-notice error" role="alert">{options.error} <button className="admin-button secondary" onClick={() => setRetry(retry + 1)}>Réessayer</button></p>}
        <div aria-busy={result.state === 'chargement'}>
          {result.state === 'chargement' && <p role="status" className="admin-notice">Chargement…</p>}
          {result.state === 'erreur' && <div className="admin-notice error"><p role="alert">{result.error}</p><button className="admin-button secondary" onClick={() => { loading(); setRetry(retry + 1); }}>Réessayer</button></div>}
          {result.state === 'pret' && (result.items.length === 0 ? <p role="status" className="admin-notice">{poleId || publication ? 'Aucun résultat pour ces critères.' : q ? 'Aucun résultat pour cette recherche.' : `Aucun${kind === 'formations' ? 'e' : ''} ${config.singular} pour le moment. Créez votre première fiche.`}</p> : <>
            <p className="admin-count" role="status">{result.total} résultat{result.total > 1 ? 's' : ''}</p>
            <ul className="admin-resource-list">{result.items.map(item => <li key={item.id}>
              <div><h2><a href={`/admin/catalogue/${kind}/${encodeURIComponent(item.id)}/modifier`}>{item[config.name]}</a></h2>
                {item.slug && <span className="admin-tag">{item.slug}</span>}
                {kind === 'formations' && <div className="admin-record-meta"><PublicationBadge publiee={item.publiee} /><span>{item.pole?.titre || 'Pôle non renseigné'}</span><span>{item.tarif === null ? 'Tarif non renseigné' : item.tarif === '0.00' ? 'Gratuite' : `${item.tarif} ${item.devise}`}</span></div>}
                <p>{item[config.summary] ? item[config.summary].slice(0, 180) + (item[config.summary].length > 180 ? '…' : '') : 'Présentation non renseignée.'}</p></div>
              <a className="admin-button secondary" href={`/admin/catalogue/${kind}/${encodeURIComponent(item.id)}/modifier`} aria-label={`Modifier ${item[config.name]}`}>Modifier</a>
            </li>)}</ul>
            <nav className="admin-pagination" aria-label="Pagination"><button className="admin-button secondary" disabled={page === 1} onClick={() => { setPage(page - 1); loading(); }}>Précédent</button><span>Page {page} sur {Math.ceil(result.total / 20)}</span><button className="admin-button secondary" disabled={page * 20 >= result.total} onClick={() => { setPage(page + 1); loading(); }}>Suivant</button></nav>
          </>)}
        </div>
      </section>
    </>
  );
}

export function PublicationBadge({ publiee }) {
  return <span className={`admin-badge ${publiee ? 'published' : 'draft'}`}>{publiee ? 'Publiée' : 'Brouillon'}</span>;
}

export function FormField({ field, value, error, disabled, onChange }) {
  const props = { id: field.name, name: field.name, value, disabled, required: field.required,
    maxLength: field.max, inputMode: field.inputMode, onChange: event => onChange(event.target.value), className: 'admin-input',
    'aria-invalid': !!error, 'aria-describedby': [field.hint && `${field.name}-hint`, error && `${field.name}-error`].filter(Boolean).join(' ') || undefined };
  if (field.type === 'choices') return <fieldset id={field.name} className="admin-field admin-choice-group" disabled={disabled} aria-describedby={props['aria-describedby']}>
    <legend className="admin-label">{field.label}</legend><p className="admin-hint" id={`${field.name}-hint`}>{field.hint}</p>
    {field.options.length ? <div className="admin-choice-list">{field.options.map(option => <label key={option.value}><input type="checkbox" checked={value.includes(option.value)} onChange={event => onChange(event.target.checked ? [...value, option.value].sort() : value.filter(id => id !== option.value))} /> {option.label}</label>)}</div> : <p>Aucun formateur disponible. <a href="/admin/catalogue/formateurs/nouveau">Créer une fiche formateur</a>.</p>}
    {error && <p className="admin-field-error" id={`${field.name}-error`}>{error}</p>}
  </fieldset>;
  if (field.type === 'checkbox') return <div className="admin-field"><label className="admin-check"><input id={field.name} type="checkbox" checked={value} disabled={disabled} aria-invalid={!!error} onChange={event => onChange(event.target.checked)} aria-describedby={props['aria-describedby']} />{field.label}</label><p className="admin-hint" id={`${field.name}-hint`}>{field.hint}</p>{error && <p className="admin-field-error" id={`${field.name}-error`}>{error}</p>}</div>;
  return <div className="admin-field"><label className="admin-label" htmlFor={field.name}>{field.label}{!field.required && <span>{field.publication ? ' (facultatif pour un brouillon)' : ' (facultatif)'}</span>}</label>
    {field.hint && <p className="admin-hint" id={`${field.name}-hint`}>{field.hint}</p>}
    {field.type === 'select' ? <select {...props}><option value="">{field.placeholder || 'Non renseigné'}</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.multiline ? <textarea {...props} rows={field.rows || 7} /> : <input {...props} type={field.type || 'text'} step={field.step} />}
    {error && <p className="admin-field-error" id={`${field.name}-error`}>{error}</p>}
  </div>;
}

export function ResourceEditor({ kind, id, setDirty }) {
  const config = resources[kind];
  const blank = Object.fromEntries(config.fields.map(field => [field.name, '']));
  const [values, setValues] = useState(blank);
  const [baseline, setBaseline] = useState(blank);
  const [savedId, setSavedId] = useState(id);
  const [state, setState] = useState(id ? 'chargement' : 'pret');
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const loadedId = useRef(null);
  useEffect(() => {
    if (!id || loadedId.current === id) return;
    const controller = new AbortController();
    adminRequest(`/api/admin/${kind}/${encodeURIComponent(id)}`, { signal: controller.signal }).then(({ item }) => {
      if (!controller.signal.aborted) {
        const data = Object.fromEntries(config.fields.map(field => [field.name, item[field.name]]));
        loadedId.current = item.id;
        setValues(data); setBaseline(data); setState('pret');
      }
    }).catch(err => { if (!controller.signal.aborted) { setError(err.message); setState('erreur'); } });
    return () => controller.abort();
  }, [kind, id, config]);
  function change(name, value) {
    const next = { ...values, [name]: value }; setValues(next);
    setDirty(JSON.stringify(next) !== JSON.stringify(baseline));
    setSuccess(''); setFields(previous => ({ ...previous, [name]: undefined }));
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setFields({}); setSuccess('');
    try {
      const { item } = await adminRequest(`/api/admin/${kind}${savedId ? `/${encodeURIComponent(savedId)}` : ''}`, { method: savedId ? 'PUT' : 'POST', body: JSON.stringify(values) });
      const next = Object.fromEntries(config.fields.map(field => [field.name, item[field.name]]));
      loadedId.current = item.id;
      setValues(next); setBaseline(next); setSavedId(item.id); setDirty(false); setSuccess('Les modifications ont été enregistrées.');
      if (!savedId) window.history.replaceState(null, '', `/admin/catalogue/${kind}/${encodeURIComponent(item.id)}/modifier`);
    } catch (err) { setError(err.message); setFields(err.fields || {}); }
    finally { setBusy(false); }
  }
  return <>
    <div className="admin-page-heading"><div><a className="admin-back" href={`/admin/catalogue/${kind}`}>← {config.title}</a><h1>{savedId ? 'Modifier' : 'Créer'} un {config.singular}</h1><p>Les champs sans mention « facultatif » sont obligatoires.</p></div></div>
    <section className="admin-panel">
      {state === 'chargement' && <p role="status">Chargement de la fiche…</p>}
      {error && <p className="admin-notice error" role="alert">{error}</p>}
      {success && <p className="admin-notice success" role="status">{success}</p>}
      {state === 'pret' && <form onSubmit={submit} aria-busy={busy} noValidate>
        {config.fields.map(field => <FormField key={field.name} field={field} value={values[field.name]} error={fields[field.name]} disabled={busy} onChange={value => change(field.name, value)} />)}
        <div className="admin-actions"><button className="admin-button" disabled={busy} type="submit">{busy ? 'Enregistrement…' : 'Enregistrer'}</button><a className="admin-button secondary" href={`/admin/catalogue/${kind}`}>Retour à la liste</a></div>
      </form>}
    </section>
  </>;
}
