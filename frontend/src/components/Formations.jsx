import {usePublicResource} from '../public/usePublicResource';
import {duration,price,formatLabels} from '../public/format';

export default function Formations({standalone=false}){
  const catalogue=usePublicResource('/api/catalogue/formations');
  const Heading=standalone?'h1':'h2',CardHeading=standalone?'h2':'h3';
  const formations=catalogue.data?.formations;
  const invalid=catalogue.state==='pret'&&!Array.isArray(formations);
  return <section className="poles-section catalogue-section" id="formations" aria-labelledby="formations-title"><div className="container">
    <p className="eyebrow">Le catalogue</p><Heading id="formations-title">Nos formations</Heading>
    <p className="section-description">Découvrez les formations proposées par CMH Academy et leur programme.</p>
    <div aria-busy={catalogue.state==='chargement'}>
      {catalogue.state==='chargement'&&<p role="status">Chargement des formations…</p>}
      {(catalogue.state==='erreur'||invalid)&&<div className="public-notice" role="alert"><p>Les formations sont momentanément indisponibles.</p><button className="button" onClick={catalogue.retry}>Réessayer</button></div>}
      {catalogue.state==='pret'&&!invalid&&(formations.length===0?<p role="status">Aucune formation disponible pour le moment.</p>:<div className="catalogue-grid">
        {formations.map(formation=><article className="formation-card" key={formation.id}>
          {formation.pole&&<p className="eyebrow">{formation.pole.titre}</p>}
          <CardHeading>{formation.slug?<a href={`/formations/${encodeURIComponent(formation.slug)}`}>{formation.titre}</a>:formation.titre}</CardHeading>
          {(formation.resume||formation.description)&&<p className="card-description">{formation.resume||formation.description}</p>}
          <ul className="formation-facts" aria-label="Repères de la formation"><li>{formatLabels[formation.format]||'Format à préciser'}</li><li>{duration(formation.dureeMinutes)}</li></ul>
          <p className="formation-price">{price(formation.tarif,formation.devise)}</p>
          {formation.slug?<a className="public-detail-link" href={`/formations/${encodeURIComponent(formation.slug)}`} aria-label={`Découvrir la formation ${formation.titre}`}>Découvrir la formation <span aria-hidden="true">→</span></a>:<p className="public-muted">La fiche détaillée sera disponible prochainement.</p>}
        </article>)}
      </div>)}
    </div>
  </div></section>;
}
