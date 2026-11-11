import PublicLayout from './PublicLayout';
import Preinscription from './Preinscription';
import {usePublicResource} from './usePublicResource';
import {duration,price,formatLabels,parisDate,parisTime} from './format';

function TextSection({id,title,value}){return <section className="formation-section" id={id} aria-labelledby={`${id}-title`}><h2 id={`${id}-title`}>{title}</h2><p className="public-text">{value||'Information à préciser.'}</p></section>;}

export default function FormationDetail({slug}){
  const result=usePublicResource(`/api/formations/${encodeURIComponent(slug)}`);
  const formation=result.data?.formation;
  const invalid=result.state==='pret'&&(!formation||!Array.isArray(formation.sessions)||!Array.isArray(formation.formateurs));
  return <PublicLayout title={formation?`${formation.titre} — CMH Academy`:result.state==='introuvable'?'Formation introuvable — CMH Academy':'Formation — CMH Academy'}>
    <div className="container formation-detail" aria-busy={result.state==='chargement'}>
      <a className="public-back" href="/formations">← Retour au catalogue</a>
      {result.state==='chargement'&&<div className="public-state" role="status"><h1>Chargement de la formation…</h1></div>}
      {result.state==='introuvable'&&<section className="public-state"><h1>Formation introuvable</h1><p>Cette formation n’est pas disponible.</p></section>}
      {(result.state==='erreur'||invalid)&&<section className="public-state" role="alert"><h1>Formation momentanément indisponible</h1><p>Réessayez dans quelques instants.</p><button className="button" onClick={result.retry}>Réessayer</button></section>}
      {result.state==='pret'&&!invalid&&<>
        <header className="formation-heading">{formation.pole&&<p className="eyebrow">{formation.pole.titre}</p>}<h1>{formation.titre}</h1>{formation.resume&&<p className="formation-intro public-text">{formation.resume}</p>}
          <ul className="formation-facts"><li>{formatLabels[formation.format]||'Format à préciser'}</li><li>{duration(formation.dureeMinutes)}</li><li>{price(formation.tarif,formation.devise)}</li></ul>
        </header>
        <nav className="formation-nav" aria-label="Dans cette fiche"><a href="#presentation">Présentation</a><a href="#programme">Programme</a><a href="#intervenants">Formateurs</a><a href="#dates">Dates</a></nav>
        <div className="formation-body">
          <TextSection id="presentation" title="Présentation" value={formation.description}/>
          {formation.pole&&<TextSection id="pole" title="Pôle de formation" value={`${formation.pole.titre}${formation.pole.description?`\n\n${formation.pole.description}`:''}`}/>}
          <TextSection id="objectifs" title="Objectifs" value={formation.objectifs}/>
          <TextSection id="programme" title="Programme" value={formation.programme}/>
          <div className="formation-two-columns"><TextSection id="public" title="Public concerné" value={formation.publicVise}/><TextSection id="prerequis" title="Prérequis" value={formation.prerequis}/></div>
          <section className="formation-section" aria-labelledby="organisation-title"><h2 id="organisation-title">Format et durée</h2><dl className="public-definition"><div><dt>Format</dt><dd>{formatLabels[formation.format]||'Format à préciser'}</dd></div><div><dt>Durée pédagogique</dt><dd>{duration(formation.dureeMinutes)}</dd></div></dl></section>
          <section className="formation-section" aria-labelledby="tarification-title"><h2 id="tarification-title">Tarif et financement</h2><p className="formation-price">{price(formation.tarif,formation.devise)}</p>{formation.tarif!==null&&<p className="public-muted">Devise : {formation.devise}.</p>}
            <h3>Possibilités de financement</h3><p className="public-text">{formation.financement||'Les informations de financement ne sont pas renseignées.'}</p>{formation.financement&&<p className="public-notice">Les possibilités mentionnées restent soumises aux conditions des dispositifs et à l’accord des organismes concernés. Aucune prise en charge n’est acquise.</p>}
          </section>
          <section className="formation-section" id="intervenants" aria-labelledby="intervenants-title"><h2 id="intervenants-title">Les formateurs</h2>{formation.formateurs.length?<div className="public-trainers">{formation.formateurs.map((trainer,index)=><article key={index}><h3>{trainer.nom}</h3><p className="public-text">{trainer.biographie||'Présentation à venir.'}</p></article>)}</div>:<p>Les formateurs seront annoncés prochainement.</p>}</section>
          <section className="formation-section" id="dates" aria-labelledby="dates-title"><h2 id="dates-title">Dates des sessions</h2>
            {!formation.sessions.length?<p>Les prochaines dates seront annoncées prochainement</p>:<><p className="public-muted">Toutes les dates et heures sont indiquées dans le fuseau Europe/Paris. Le décalage UTC précise l’heure d’été ou d’hiver.</p>
              <ol className="public-sessions">{formation.sessions.map((session,index)=><li key={index}><h3>Session du {parisDate(session.seances[0].debut)}</h3>{session.lieu&&<p className="public-text"><strong>Lieu :</strong> {session.lieu}</p>}<ol className="public-seances">{session.seances.map((seance,i)=><li key={i}><span className="seance-number">Séance {i+1}</span><p><time dateTime={seance.debut}>{parisDate(seance.debut)} à {parisTime(seance.debut)}</time><br/>jusqu’au <time dateTime={seance.fin}>{parisDate(seance.fin)} à {parisTime(seance.fin)}</time></p></li>)}</ol>
                {session.preinscriptionSessionId && <Preinscription sessionId={session.preinscriptionSessionId} />}
              </li>)}</ol>
            </>}
          </section>
        </div>
        <a className="public-back" href="/formations">← Retour au catalogue</a>
      </>}
    </div>
  </PublicLayout>;
}
