const APP_BASE = 'https://dealhub-web.vercel.app/chat';
const frame = document.getElementById('app');
const loading = document.getElementById('loading');

frame.addEventListener('load', () => {
  if (frame.src && frame.src !== 'about:blank') {
    frame.style.opacity = '1';
    loading.style.display = 'none';
  }
});

// Relay DealHub API requests from the iframe → background service worker
window.addEventListener('message', (event) => {
  if (event.data?.type !== 'dh_api_request') return;
  chrome.runtime.sendMessage(event.data, (response) => {
    event.source?.postMessage({
      type: 'dh_api_response',
      id: event.data.id,
      ...(response || { ok: false, error: 'Extension background unavailable' }),
    }, '*');
  });
});

// Poll for baseUrl from storage (popup writes it just before opening the panel)
function loadWhenReady(attempts) {
  chrome.storage.session.get('dhConnect', (data) => {
    if (data.dhConnect?.baseUrl) {
      const tabPart = data.dhConnect.tabUrl ? `&tabUrl=${encodeURIComponent(data.dhConnect.tabUrl)}` : '';
      frame.src = `${APP_BASE}?baseUrl=${encodeURIComponent(data.dhConnect.baseUrl)}&ext=1${tabPart}`;
    } else if (attempts > 0) {
      setTimeout(() => loadWhenReady(attempts - 1), 80);
    } else {
      frame.src = `${APP_BASE}?ext=1`;
    }
  });
}

loadWhenReady(20);

// Keepalive: ping /security/timeLeft every 4 minutes to prevent session expiry
setInterval(() => {
  chrome.storage.session.get('dhConnect', (data) => {
    if (!data.dhConnect?.baseUrl) return;
    chrome.runtime.sendMessage({
      type: 'dh_api_request',
      id: 'keepalive',
      baseUrl: data.dhConnect.baseUrl,
      method: 'GET',
      path: '/security/timeLeft',
    });
  });
}, 4 * 60 * 1000);
