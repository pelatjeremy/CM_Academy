import EspaceStagiaire from '../stagiaire/EspaceStagiaire';
import { useEffect, useState } from 'react';
import AdminWorkspace from '../admin/AdminWorkspace';

async function request(path, options = {}) {
  return fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(10000), ...options });
}

export default function Admin({ connexion, stagiaire = false }) {
  const role = stagiaire ? 'STAGIAIRE' : 'ADMIN';
  const home = stagiaire ? '/stagiaire' : '/admin';
  const [state, setState] = useState('chargement');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${connexion ? (stagiaire ? 'Connexion stagiaire' : 'Connexion administrateur') : (stagiaire?'Espace stagiaire':'Administration')} — CMH Academy`;
    let actif = true;
    async function verifier() {
      try {
        const response = await request(connexion || stagiaire ? '/api/auth/moi' : '/api/admin/moi');
        if (!actif) return;
        if (response.status === 401) {
          if (!connexion) { window.location.replace(home + '/connexion'); return; }
          setState('pret'); return;
        }
        if (response.status === 403) { setState('interdit'); return; }
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!actif) return;
        if (connexion && data.user.role === role) { window.location.replace(home); return; }
        if (!connexion && data.user.role !== role) { setState('interdit'); return; }
        setUser(data.user); setState('pret');
      } catch { if (actif) setState('erreur'); }
    }
    verifier();
    return () => { actif = false; document.title = previousTitle; };
  }, [connexion, stagiaire, role, home]);

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const csrf = await request('/api/auth/csrf');
      if (!csrf.ok) throw new Error();
      const { csrfToken } = await csrf.json();
      const response = await request('/api/auth/connexion', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }) });
      if (!response.ok) { setError('Connexion impossible. Vérifiez vos identifiants ou réessayez plus tard.'); return; }
      const { user: connected } = await response.json();
      if (connected.role !== role) { setError('Ce compte ne dispose pas de l’accès demandé.'); return; }
      window.location.replace(home);
    } catch { setError('La connexion est momentanément indisponible. Réessayez dans quelques instants.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError('');
    try {
      const csrf = await request('/api/auth/csrf');
      if (!csrf.ok) throw new Error();
      const { csrfToken } = await csrf.json();
      const response = await request('/api/auth/deconnexion', { method: 'POST', headers: { 'x-csrf-token': csrfToken } });
      if (!response.ok && response.status !== 401) throw new Error();
      window.location.replace(home + '/connexion');
      return true;
    } catch { setError('La déconnexion a échoué. Réessayez.'); return false; }
    finally { setBusy(false); }
  }

  if (!connexion && state === 'pret' && stagiaire) return <EspaceStagiaire user={user} onLogout={logout} busy={busy} error={error} />;
  if (!connexion && state === 'pret') return <AdminWorkspace user={user} onLogout={logout} busy={busy} error={error} />;

  return (
    <main className="admin-shell">
      <a href="/">← Retour au catalogue</a>
      <section className="admin-card" aria-labelledby="admin-title">
        <p className="eyebrow">CMH Academy</p>
        <h1 id="admin-title">{connexion ? (stagiaire ? 'Connexion stagiaire' : 'Connexion administrateur') : 'Administration'}</h1>
        {state === 'chargement' && <p role="status">Vérification de la connexion…</p>}
        {state === 'erreur' && <p role="alert">Le service est momentanément indisponible. Actualisez la page pour réessayer.</p>}
        {state === 'interdit' && <><p role="alert">Votre compte ne dispose pas de l’accès demandé.</p><button className="button" disabled={busy} onClick={logout}>Se déconnecter</button></>}
        {state === 'pret' && (connexion ? (
          <form onSubmit={submit} aria-busy={busy} aria-describedby={error ? 'admin-error' : undefined}>
            <label htmlFor="admin-email">Adresse email</label>
            <input id="admin-email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={busy} />
            <label htmlFor="admin-password">Mot de passe</label>
            <div className="password-field">
              <input id="admin-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" maxLength={128} required disabled={busy} />
              <button type="button" aria-controls="admin-password" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Masquer' : 'Afficher'} le mot de passe</button>
            </div>
            <button className="button" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
          </form>
        ) : (
          <><p>Connecté en tant que <strong>{user?.email}</strong>.</p><button className="button" disabled={busy} onClick={logout}>{busy ? 'Déconnexion…' : 'Se déconnecter'}</button></>
        ))}
        {error && <p id="admin-error" role="alert" className="admin-error">{error}</p>}
      </section>
    </main>
  );
}
