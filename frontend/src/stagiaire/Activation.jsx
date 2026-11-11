import {useEffect,useRef,useState} from 'react';
import {adminRequest} from '../admin/api';
import '../admin/admin.css';
// Le fragment n'est conservé qu'en mémoire. Effacement avant tout appel réseau de la page.
const initialToken=window.location.pathname.replace(/\/+$/,'')==='/stagiaire/activation'?window.location.hash.slice(1):'';
if(initialToken)window.history.replaceState(null,'',window.location.pathname);
export default function Activation(){
 const [invitation,setInvitation]=useState({token:initialToken,sequence:0});
 const token=invitation.token;
 const [state,setState]=useState(initialToken?{loading:true}:{invalid:true}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[visible,setVisible]=useState(false),[success,setSuccess]=useState(false);
 const lock=useRef(false);
 const generation=useRef(0);
 useEffect(()=>{
  const changed=()=>{
   const next=window.location.hash.slice(1);
   window.history.replaceState(null,'',window.location.pathname);
   generation.current++;lock.current=false;setBusy(false);setVisible(false);
   setInvitation(previous=>({token:next,sequence:previous.sequence+1}));
   setState(next?{loading:true}:{invalid:true});setError('');setSuccess(false);
  };
  window.addEventListener('hashchange',changed);
  return()=>window.removeEventListener('hashchange',changed);
 },[]);
 useEffect(()=>{
  document.title='Activer mon espace — CMH Academy';
  let live=true;
  if(!token)return;
  adminRequest('/api/auth/invitations/consulter',{method:'POST',body:JSON.stringify({token})})
   .then(data=>{if(live)setState({data});}).catch(()=>{if(live)setState({invalid:true});});
  return()=>{live=false;};
 },[invitation,token]);
 async function submit(event){
  event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
  const currentGeneration=generation.current;
  const password=new FormData(event.currentTarget).get('password');
  try{await adminRequest('/api/auth/invitations/activer',{method:'POST',body:JSON.stringify({token,password})});if(currentGeneration===generation.current)setSuccess(true);}
  catch(err){if(currentGeneration===generation.current)setError(err.message);}finally{if(currentGeneration===generation.current){setBusy(false);lock.current=false;}}
 }
 return <main className="admin-shell"><a href="/">← Catalogue public</a><section className="admin-card"><p className="eyebrow">CMH Academy</p><h1>Activer mon espace stagiaire</h1>
  {state.loading&&<p role="status">Vérification de l’invitation…</p>}
  {state.invalid&&<p role="alert">Cette invitation est indisponible, expirée ou déjà utilisée. Demandez un nouveau lien à Camille.</p>}
  {success?<><p role="status">Votre inscription est rattachée. Vous pouvez vous connecter.</p><a href="/stagiaire/connexion">Connexion à mon espace</a></>:state.data&&<form key={invitation.sequence} onSubmit={submit} aria-busy={busy}>
   <p>Invitation pour {state.data.email}.</p><p>{state.data.compteExistant?'Vous possédez déjà un compte stagiaire. Confirmez votre mot de passe actuel ; il ne sera pas modifié.':'Choisissez votre mot de passe : 12 à 128 caractères.'}</p>
   <label htmlFor="activation-password">{state.data.compteExistant?'Mot de passe actuel':'Choisir un mot de passe'}</label>
   <div className="password-field"><input id="activation-password" name="password" type={visible?'text':'password'} autoComplete={state.data.compteExistant?'current-password':'new-password'} required minLength={state.data.compteExistant?1:12} maxLength={128} disabled={busy}/><button type="button" aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?'Masquer':'Afficher'} le mot de passe</button></div>
   <button className="button" disabled={busy}>{busy?'Activation…':'Activer mon espace'}</button>
  </form>}{error&&<p role="alert">{error}</p>}
 </section></main>;
}
