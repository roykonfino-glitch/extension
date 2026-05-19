// DealHub API proxy — executes fetch inside the DealHub tab so session cookies are
// included automatically. Falls back to service-worker fetch if no tab is found.

function extractCsrf(playSessionValue) {
  if (!playSessionValue) return null;
  try {
    let payload = playSessionValue.split('.')[1];
    if (!payload) return null;
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const data = JSON.parse(atob(payload));
    return data?.data?.csrfToken || data?.csrfToken || null;
  } catch { return null; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'dh_api_request') return false;

  (async () => {
    try {
      const { baseUrl, method = 'GET', path, body } = msg;

      // Get CSRF token from cookies (readable from service worker)
      const cookies = await new Promise(r => chrome.cookies.getAll({ url: baseUrl }, r));
      const playSession = cookies.find(c => c.name === 'DEALHUB_PLAY_SESSION')?.value;
      const csrf = extractCsrf(playSession);

      // Find a DealHub tab to run the fetch in its context
      const tabs = await new Promise(r => chrome.tabs.query({ url: '*://*.dealhub.io/*' }, r));
      const tab = tabs.find(t => t.url && t.url.startsWith(baseUrl)) ?? tabs[0];

      if (!tab?.id) {
        // Fallback: fetch from service worker (may not always send cookies)
        const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
        if (csrf && method !== 'GET') headers['Csrf-Token'] = csrf;
        const res = await fetch(`${baseUrl}${path}`, {
          method, headers,
          body: body ? JSON.stringify(body) : undefined,
          credentials: 'include',
        });
        const text = await res.text();
        let data; try { data = JSON.parse(text); } catch { data = text; }
        sendResponse({ ok: res.ok, status: res.status, data });
        return;
      }

      // Run fetch inside the DealHub tab — cookies are naturally included
      const results = await new Promise((resolve, reject) => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: async (url, fetchMethod, bodyStr, csrfToken) => {
            const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
            if (csrfToken && fetchMethod !== 'GET') headers['Csrf-Token'] = csrfToken;
            const res = await fetch(url, {
              method: fetchMethod,
              headers,
              body: bodyStr !== null ? bodyStr : undefined,
              credentials: 'include',
            });
            const text = await res.text();
            let data; try { data = JSON.parse(text); } catch { data = text; }
            return { ok: res.ok, status: res.status, data };
          },
          args: [`${baseUrl}${path}`, method, body ? JSON.stringify(body) : null, csrf],
        }, (res) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(res);
        });
      });

      const result = results?.[0]?.result;
      if (!result) throw new Error('No result from tab script execution');

      // On 401, reload the tab to refresh the session then retry once
      if (!result.ok && (result.status === 401 || result.status === 403 ||
          (typeof result.data === 'object' && result.data?.redirect))) {
        await new Promise(resolve => {
          chrome.tabs.reload(tab.id, {}, () => setTimeout(resolve, 3000));
        });
        const retry = await new Promise((resolve, reject) => {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async (url, fetchMethod, bodyStr, csrfToken) => {
              const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
              if (csrfToken && fetchMethod !== 'GET') headers['Csrf-Token'] = csrfToken;
              const res = await fetch(url, { method: fetchMethod, headers, body: bodyStr !== null ? bodyStr : undefined, credentials: 'include' });
              const text = await res.text();
              let data; try { data = JSON.parse(text); } catch { data = text; }
              return { ok: res.ok, status: res.status, data };
            },
            args: [`${baseUrl}${path}`, method, body ? JSON.stringify(body) : null, csrf],
          }, (res) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(res);
          });
        });
        const retryResult = retry?.[0]?.result;
        if (!retryResult?.ok) {
          sendResponse({ ok: false, status: retryResult?.status, error: 'DealHub session expired — please refresh your DealHub browser tab and try again.' });
          return;
        }
        sendResponse(retryResult);
        return;
      }
      sendResponse(result);
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message ?? e) });
    }
  })();

  return true;
});
