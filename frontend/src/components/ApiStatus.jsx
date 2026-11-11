import { useEffect, useState } from 'react';

function ApiStatus() {
  const [message, setMessage] = useState(
    'Vérification de la connexion au serveur…'
  );

  useEffect(() => {
    const controller = new AbortController();
    let actif = true;

    const timeout = setTimeout(() => {
      controller.abort();
    }, 5000);

    async function verifierServeur() {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.status !== 'ok') {
          throw new Error('Réponse du serveur inattendue.');
        }

        if (actif) {
          setMessage('Connexion au serveur établie.');
        }
      } catch {
        if (actif) {
          setMessage(
            'Le service est momentanément indisponible. Réessayez dans quelques instants.'
          );
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    verifierServeur();

    return () => {
      actif = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return (
    <div className="container">
      <p role="status">{message}</p>
    </div>
  );
}

export default ApiStatus;
