import {useId,useState} from 'react';

export default function VideoPlayer({video,base}) {
 const [loading,setLoading]=useState(true),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
 const descriptionId=useId();
 return <section className="pedagogy-video" aria-label={'Vidéo : '+video.titre}>
  <h4>{video.titre}</h4>
  {video.description&&<p className="pedagogy-text">{video.description}</p>}
  <p id={descriptionId}>Commandes du lecteur accessibles au clavier. Regarder cette vidéo ne termine pas la leçon et ne valide aucune présence ni acquisition.</p>
  <video key={attempt} controls playsInline preload="metadata" tabIndex={0} aria-label={'Lire '+video.titre} aria-describedby={descriptionId}
   src={base+'/'+encodeURIComponent(video.id)+'/lecture'}
   onLoadStart={()=>setLoading(true)} onLoadedMetadata={()=>setLoading(false)} onCanPlay={()=>setLoading(false)}
   onError={()=>{setLoading(false);setError(true);}}>
   Votre navigateur ne prend pas en charge la lecture vidéo MP4.
  </video>
  {loading&&!error&&<p role="status">Chargement de la vidéo…</p>}
  {error&&<div role="alert"><p>Lecture indisponible. Vérifiez votre connexion et vos droits d’accès ; reconnectez-vous si votre session a expiré.</p><button type="button" className="admin-button secondary" onClick={()=>{setError(false);setLoading(true);setAttempt(n=>n+1);}}>Réessayer la lecture</button></div>}
  {video.transcription?<details><summary>Transcription de la vidéo</summary><div className="pedagogy-text">{video.transcription}</div></details>:<p>Transcription non disponible pour cette vidéo.</p>}
 </section>;
}
