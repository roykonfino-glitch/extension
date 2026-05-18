// Simplified popup — no cookie reading needed.
// The background service worker handles auth automatically via browser cookies.

const STORAGE_KEY = 'dh_tenant_url';
const body = document.getElementById('body');
function render(html) { body.innerHTML = html; }

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  const tabUrl = tab?.url ?? '';

  if (!tabUrl.includes('dealhub.io')) {
    render(`
      <div class="status warn">Open a DealHub page first, then click this extension.</div>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="window.close()">Close</button>
    `);
    return;
  }

  const tabOrigin = new URL(tabUrl).origin;

  chrome.storage.local.get(STORAGE_KEY, (stored) => {
    const savedUrl = stored[STORAGE_KEY] || tabOrigin;

    render(`
      <div class="field-group">
        <label class="field-label">Admin URL</label>
        <input id="tenantUrl" class="field-input" type="url"
          placeholder="https://poc.dealhub.io"
          value="${savedUrl}" />
      </div>
      <div class="status ok">Ready — your browser session will be used automatically.</div>
      <button class="btn btn-primary" id="connectBtn">Open DealHub Assistant</button>
      <button class="btn btn-ghost" onclick="window.close()">Cancel</button>
    `);

    document.getElementById('connectBtn').addEventListener('click', () => {
      const baseUrl = document.getElementById('tenantUrl').value.trim() || tabOrigin;
      chrome.storage.local.set({ [STORAGE_KEY]: baseUrl });
      chrome.storage.session.set({ dhConnect: { baseUrl, tabUrl: tabUrl } });

      if (chrome.sidePanel?.open) {
        chrome.sidePanel.open({ windowId: tab.windowId }, () => {
          if (chrome.runtime.lastError) openNewTab(baseUrl);
          window.close();
        });
      } else {
        openNewTab(baseUrl);
        window.close();
      }
    });
  });
});

function openNewTab(baseUrl) {
  chrome.tabs.create({ url: `https://dealhub-web.vercel.app/chat?baseUrl=${encodeURIComponent(baseUrl)}&ext=1` });
}
