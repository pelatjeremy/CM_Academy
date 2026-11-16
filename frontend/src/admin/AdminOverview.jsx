import {useEffect,useState} from 'react';
import {adminRequest} from './api';
import {indicateursDocumentaires} from '../../../shared/document-dashboard.mjs';

const metrics=[
 {label:'Demandes en attente',hint:'Préinscriptions à traiter',url:'/api/admin/inscriptions?statut=EN_ATTENTE&page=1',href:'/admin/inscriptions?statut=EN_ATTENTE',read:d=>d.total},
 {label:'Pièces à vérifier',hint:'Pièces obligatoires et facultatives demandées',url:'/api/admin/suivi-documents',href:'/admin/suivi-documents?etat=aVerifier',read:d=>indicateursDocumentaires(d.items).aVerifier},
 {label:'Sessions',hint:'Toutes les sessions',url:'/api/admin/sessions?page=1',href:'/admin/catalogue/sessions',read:d=>d.total},
 {label:'Formations publiées',hint:'Fiches publiées du catalogue',url:'/api/admin/formations?publication=publiee&page=1',href:'/admin/catalogue/formations?publication=publiee',read:d=>d.total},
];
const links=[
 {title:'Suivi administratif',items:[['Inscriptions','Traiter les demandes et consulter les dossiers.','/admin/inscriptions'],['Suivi des documents','Vérifier les pièces, suivre les corrections et la complétude.','/admin/suivi-documents'],['Questionnaires','Préparer les modèles et leur validation.','/admin/questionnaires']]},
 {title:'Formations et organisation',items:[['Sessions et présences','Consulter les séances et renseigner les présences.','/admin/catalogue/sessions'],['Formations et contenus','Gérer les fiches, modules, leçons et supports.','/admin/catalogue/formations'],['Pôles','Organiser les domaines du catalogue.','/admin/catalogue/poles'],['Formateurs','Gérer les fiches des intervenants.','/admin/catalogue/formateurs'],['Organisme','Maintenir les informations utilisées pour les attestations.','/admin/organisme']]},
];
export default function AdminOverview(){
 const [state,setState]=useState({}),[attempt,setAttempt]=useState(0);
 useEffect(()=>{const c=new AbortController();for(const metric of metrics)adminRequest(metric.url,{signal:c.signal}).then(data=>{if(!c.signal.aborted)setState(s=>({...s,[metric.label]:{value:metric.read(data)}}));}).catch(()=>{if(!c.signal.aborted)setState(s=>({...s,[metric.label]:{error:true}}));});return()=>c.abort();},[attempt]);
 const failed=Object.values(state).some(s=>s.error);
 return <><div className="admin-page-heading"><div><p className="admin-eyebrow">Administration</p><h1>Tableau de bord</h1><p>Repérez les tâches en attente et accédez aux outils de gestion.</p></div><button className="admin-button secondary" onClick={()=>{setState({});setAttempt(n=>n+1);}}>Actualiser</button></div>
 <div className="admin-overview-metrics" aria-label="Synthèse administrative">{metrics.map(m=><a className="admin-overview-metric" href={m.href} key={m.label}><span>{m.label}</span><strong>{state[m.label]?.value??'—'}</strong><small>{state[m.label]?.error?'Indicateur indisponible':state[m.label]===undefined?'Chargement…':m.hint}</small></a>)}</div>
 <p className="admin-overview-note">Les compteurs portent sur toutes les données de chaque rubrique, avant pagination. Ils ne s’additionnent pas.</p>{failed&&<p className="admin-notice error" role="alert">Certains indicateurs sont indisponibles. Les rubriques restent accessibles ; utilisez « Actualiser » pour réessayer.</p>}
 <div className="admin-overview-sections">{links.map(group=><section className="admin-panel" key={group.title}><h2>{group.title}</h2><ul className="admin-overview-links">{group.items.map(([title,description,href])=><li key={href}><a href={href}><strong>{title}</strong><span>{description}</span><span className="admin-overview-arrow" aria-hidden="true">→</span></a></li>)}</ul></section>)}</div></>;
}
