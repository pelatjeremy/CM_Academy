import {useEffect,useRef} from 'react';
export function Confirmation({titre,message,confirmer,onConfirm,onCancel,busy=false}){
 const ref=useRef(null);
 useEffect(()=>{const dialog=ref.current;dialog.showModal();return()=>dialog.close();},[]);
 return <dialog ref={ref} className="admin-confirm" aria-labelledby="questionnaire-confirm-title" onCancel={event=>{event.preventDefault();if(!busy)onCancel();}}>
  <h2 id="questionnaire-confirm-title">{titre}</h2><p>{message}</p><div className="admin-actions"><button type="button" className="admin-button secondary" disabled={busy} onClick={onCancel} autoFocus>Annuler</button><button type="button" className="admin-button" disabled={busy} onClick={onConfirm}>{busy?'Enregistrement…':confirmer}</button></div>
 </dialog>;
}
export function QuestionsReponses({questions,values,onChange,fields={},readonly=false}){
 return questions.map((q,index)=>{
  const error=fields[q.id],id='reponse-'+q.id,choices=q.choix||[];
  const label=(index+1)+'. '+q.libelle+(q.obligatoire?' (obligatoire)':' (facultatif)');
  if(readonly){const value=values[q.id];const text=Array.isArray(value)?choices.filter(c=>value.includes(c.id)).map(c=>c.libelle).join(', '):q.type==='CHOIX_UNIQUE'?choices.find(c=>c.id===value)?.libelle:value;
   return <section className="admin-seance" key={q.id}><h3>{label}</h3><p className="admin-dossier-note">{text===undefined||text===null||text===''?'Non renseigné':String(text)}</p></section>;
  }
  return <fieldset className="admin-seance" key={q.id} aria-describedby={error?id+'-error':undefined}><legend>{label}</legend>
   {q.type==='TEXTE_COURT'&&<input aria-label={q.libelle} className="admin-input" id={id} value={values[q.id]??''} maxLength={500} onChange={e=>onChange(q.id,e.target.value)} aria-invalid={!!error}/>}
   {q.type==='TEXTE_LONG'&&<textarea aria-label={q.libelle} className="admin-input" id={id} rows={5} value={values[q.id]??''} maxLength={5000} onChange={e=>onChange(q.id,e.target.value)} aria-invalid={!!error}/>}
   {(q.type==='CHOIX_UNIQUE'||q.type==='NOTE')&&<select aria-label={q.libelle} className="admin-input" id={id} value={values[q.id]??''} onChange={e=>onChange(q.id,q.type==='NOTE'?(e.target.value?Number(e.target.value):null):e.target.value)} aria-invalid={!!error}><option value="">Sélectionner une réponse</option>{q.type==='NOTE'?[1,2,3,4,5].map(n=><option key={n} value={n}>{n} sur 5</option>):choices.map(c=><option key={c.id} value={c.id}>{c.libelle}</option>)}</select>}
   {q.type==='CHOIX_MULTIPLE'&&choices.map(c=><label className="questionnaire-choice" key={c.id}><input type="checkbox" checked={(values[q.id]||[]).includes(c.id)} onChange={e=>onChange(q.id,e.target.checked?[...(values[q.id]||[]),c.id]:(values[q.id]||[]).filter(v=>v!==c.id))}/>{c.libelle}</label>)}
   {(q.type==='TEXTE_COURT'||q.type==='TEXTE_LONG')&&<p>{q.type==='TEXTE_COURT'?500:5000} caractères maximum.</p>}
   {error&&<p id={id+'-error'} className="admin-field-error" role="alert">{error}</p>}
  </fieldset>;
 });
}
