import {useEffect} from 'react';

export default function PublicLayout({title='CMH Academy — Formations équestres',children}){
  useEffect(()=>{document.title=title;},[title]);
  return <>
    <a className="skip-link" href="#contenu">Aller au contenu</a>
    <header className="site-header"><div className="container header-content">
      <a className="brand" href="/" aria-label="CMH Academy — Accueil">CMH <span>Academy</span></a>
      <nav aria-label="Navigation principale"><a href="/#poles">Nos pôles de formation</a>{' · '}<a href="/formations">Nos formations</a>{' · '}<a href="/stagiaire/connexion">Espace stagiaire</a></nav>
    </div></header>
    <main id="contenu">{children}</main>
    <footer className="site-footer"><div className="container"><p>© {new Date().getFullYear()} CMH Academy</p><p>Le cheval, au cœur de la transmission.</p></div></footer>
  </>;
}

export function PublicNotFound(){return <PublicLayout title="Page introuvable — CMH Academy"><section className="container public-state"><h1>Page introuvable</h1><p>Cette page n’est pas disponible.</p><a className="button" href="/formations">Retour au catalogue</a></section></PublicLayout>;}
