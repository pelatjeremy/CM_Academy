async function fetchJson(path, options = {}) {
  const {timeoutMs = 10000, ...requestOptions} = options;
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await fetch(path, { credentials: 'same-origin', ...requestOptions, signal });
    return { response, data: await response.json() };
  } catch {
    throw new Error('Le service est momentanément indisponible. Réessayez.');
  }
}

export async function adminRequest(path, options = {}) {
  const headers = { ...options.headers };
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    const { response: csrf, data } = await fetchJson('/api/auth/csrf');
    if (!csrf.ok || typeof data.csrfToken !== 'string') throw new Error('Le service est indisponible. Réessayez.');
    headers['x-csrf-token'] = data.csrfToken;
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  }
  const { response, data } = await fetchJson(path, { ...options, headers });
  if (!response.ok) {
    const message = response.status === 401 ? 'Votre session a expiré. Reconnectez-vous avant de réessayer.'
      : response.status === 403 ? 'Action non autorisée. Actualisez la page ou reconnectez-vous.'
        : data.error || 'Le service est indisponible. Réessayez.';
    const error = new Error(message); error.status = response.status; error.fields = data.fields || {}; error.code = data.code; throw error;
  }
  return data;
}
