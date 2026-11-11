import {useEffect,useState} from 'react';

export function usePublicResource(url){
  const [result,setResult]=useState({state:'chargement'}),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    const timeout=setTimeout(()=>controller.abort(),10000);
    (async()=>{
      try{
        const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
        if(response.status===404){if(active)setResult({state:'introuvable'});return;}
        if(!response.ok)throw new Error();
        const data=await response.json();
        if(!data||typeof data!=='object')throw new Error();
        if(active)setResult({state:'pret',data});
      }catch{if(active)setResult({state:'erreur'});}
      finally{clearTimeout(timeout);}
    })();
    return()=>{active=false;clearTimeout(timeout);controller.abort();};
  },[url,attempt]);
  const retry=()=>{setResult({state:'chargement'});setAttempt(n=>n+1);};
  return {...result,retry};
}
