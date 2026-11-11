import {useEffect,useState} from 'react';
export default function DemoNotice(){
 const [demo,setDemo]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch('/api/configuration-publique',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(!controller.signal.aborted)setDemo(data?.demonstration===true);}).catch(()=>{});return()=>controller.abort();},[]);
 return demo?<div className="demo-notice" role="note">Environnement de démonstration <span>· Données et personnes fictives · Aucun email envoyé</span></div>:null;
}
