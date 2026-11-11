import {useEffect,useRef} from 'react';
export default function ExitDialog({ onStay, onLeave }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="admin-confirm" aria-labelledby="exit-title" aria-describedby="exit-message" onCancel={event => { event.preventDefault(); onStay(); }}>
    <h2 id="exit-title">Modifications non enregistrées</h2>
    <p id="exit-message">Vos modifications ne sont pas enregistrées. Voulez-vous quitter sans les enregistrer ?</p>
    <div className="admin-actions"><button className="admin-button" onClick={onStay} autoFocus>Rester sur la fiche</button><button className="admin-button secondary" onClick={onLeave}>Quitter sans enregistrer</button></div>
  </dialog>;
}
