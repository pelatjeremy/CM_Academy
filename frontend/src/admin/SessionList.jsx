import {useEffect,useState} from 'react';
import {adminRequest} from './api';
import {durationLabel,plageFr} from './session-time';

export default function SessionList(){
  const [formationId,setFormationId]=useState(()=>new URLSearchParams(window.location.search).get('formationId')||'');
  const [q,setQ]=useState(''),[page,setPage]=useState(1),[retry,setRetry]=useState(0);
  const [options,setOptions]=useState({formations:[]});
  const [result,setResult]=useState({state:'chargement',items:[],total:0});
  useEffect(()=>{
    const controller=new AbortController();
    adminRequest('/api/admin/sessions/options',{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setOptions(data);}).catch(()=>{if(!controller.signal.aborted)setOptions({formations:[],error:true});});
    return()=>controller.abort();
  },[retry]);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try{const params=new URLSearchParams({q,page:String(page)});if(formationId)params.set('formationId',formationId);
        const data=await adminRequest(`/api/admin/sessions?${params}`,{signal:controller.signal});if(!controller.signal.aborted)setResult({state:'pret',...data});
      }catch(error){if(!controller.signal.aborted)setResult({state:'erreur',items:[],total:0,error:error.message});}
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[q,page,formationId,retry]);
  const loading=()=>setResult(previous=>({...previous,state:'chargement'}));
  return <>
    <div className="admin-page-heading"><div><h1>Sessions</h1><p>Organisez les rendez-vous datés de chaque formation. Horaires en Europe/Paris.</p></div><a className="admin-button" href={`/admin/catalogue/sessions/nouveau${formationId?`?formationId=${encodeURIComponent(formationId)}`:''}`}>Créer une session</a></div>
    <section className="admin-panel" aria-label="Liste des sessions"><div className="admin-filter-grid"><div><label className="admin-label" htmlFor="session-search">Rechercher</label><input id="session-search" className="admin-input" type="search" value={q} maxLength={100} onChange={e=>{setQ(e.target.value);setPage(1);loading();}} /></div>
      <div><label className="admin-label" htmlFor="session-filter">Formation</label><select id="session-filter" className="admin-input" value={formationId} onChange={e=>{setFormationId(e.target.value);setPage(1);loading();}}><option value="">Toutes les formations</option>{options.formations.map(formation=><option key={formation.id} value={formation.id}>{formation.titre}{formation.publiee?'':' — Brouillon'}</option>)}</select></div></div>
      {options.error&&<p role="alert">Le filtre des formations est indisponible. <button className="admin-button secondary" onClick={()=>setRetry(retry+1)}>Réessayer</button></p>}
      <div aria-busy={result.state==='chargement'}>{result.state==='chargement'&&<p role="status" className="admin-notice">Chargement des sessions…</p>}
        {result.state==='erreur'&&<div className="admin-notice error"><p role="alert">{result.error}</p><button className="admin-button secondary" onClick={()=>{loading();setRetry(retry+1);}}>Réessayer</button></div>}
        {result.state==='pret'&&(result.items.length===0?<p role="status" className="admin-notice">{q||formationId?'Aucune session pour ces critères.':'Aucune session pour le moment.'}</p>:<>
          <p role="status" className="admin-count">{result.total} session{result.total>1?'s':''}</p><ul className="admin-resource-list">{result.items.map((item,index)=><li key={item.id}><div><h2><a href={`/admin/catalogue/sessions/${item.id}/modifier`}>{item.formation.titre}</a></h2><a href={`/admin/catalogue/sessions/${item.id}/presences`}>Gérer les présences</a><p><span className={`admin-badge ${item.visiblePubliquement&&item.formation.publiee?'published':'draft'}`}>{item.visiblePubliquement?(item.formation.publiee?'Visible sur la fiche publique':'Masquée : formation en brouillon'):'En préparation — masquée'}</span></p><p>{item.debut?plageFr(item.debut,item.fin):'Calendrier à préparer'}</p><p>{item.nombreSeances} séance{item.nombreSeances>1?'s':''} · {durationLabel(item.totalMinutes)} · {item.capacite===null?'Capacité non renseignée':`Capacité : ${item.capacite}`}</p>{item.lieu&&<p>{item.lieu}</p>}{item.durationMismatch&&<span className="admin-badge draft">Durée différente de la formation</span>}</div><a className="admin-button secondary" href={`/admin/catalogue/sessions/${item.id}/modifier`} aria-label={`Modifier la session ${index+1} de ${item.formation.titre}`}>Modifier</a></li>)}</ul>
          <nav aria-label="Pagination des sessions" className="admin-pagination"><button className="admin-button secondary" disabled={page===1} onClick={()=>{setPage(page-1);loading();}}>Précédent</button><span>Page {page} sur {Math.ceil(result.total/20)}</span><button className="admin-button secondary" disabled={page*20>=result.total} onClick={()=>{setPage(page+1);loading();}}>Suivant</button></nav>
        </>)}
      </div>
    </section>
  </>;
}
