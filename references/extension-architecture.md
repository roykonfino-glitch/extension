# Extension Architecture

## Request flow
```
User types in chat (iframe at dealhub-web.vercel.app/chat)
  → POST /api/claude  (Vercel, sends messages + context)
  → Claude Haiku returns tool_use blocks
  → executeToolClient() runs tool in browser
      → callExtApi(method, path, body)
          → window.parent.postMessage({type:'dh_api_request', ...})
          → sidepanel.js relays via chrome.runtime.sendMessage
          → background.js: chrome.scripting.executeScript into DealHub tab
              → fetch(baseUrl + path, {credentials:'include'}) runs IN the tab
              → DealHub API responds with live session cookies
          → response relayed back: background → sidepanel → iframe
  → tool result added to history
  → loop continues until stop_reason === 'end_turn'
```

## Key files
| File | Purpose |
|------|---------|
| `app/chat/page.tsx` | Chat UI, agentic loop, all 16 tool implementations |
| `app/api/claude/route.ts` | Claude proxy: tool definitions, system prompt, Haiku model |
| `public/extension/background.js` | DealHub API proxy via executeScript |
| `public/extension/sidepanel.js` | postMessage relay + iframe loader |
| `public/extension/popup.js` | Admin URL input, opens side panel, stores tabUrl |
| `public/extension/manifest.json` | MV3 manifest, permissions: cookies/tabs/sidePanel/storage/scripting |

## Extension mode detection
`extensionMode = !!(urlParams?.ext) || (window !== window.top && !initial?.playSession)`

## On-load auto-init (extension mode)
1. Extract playbook GUID from tab URL (regex for UUID pattern) → load playbook into memory
2. Fetch `/versions/admin` → populate version dropdown → select DRAFT version
Both happen before the user's first message — Claude starts with full context.

## State
- `playbookRef.current[sessionId]` — in-memory playbook cache (client-side)
- `selectedVersionGuid` / `selectedVersion` — passed to /api/claude in every request
- `urlParams.tabUrl` — tab URL passed to system prompt for GUID extraction

## Deploying
```bash
vercel --prod          # deploy to production
git push               # sync GitHub
```
Extension files in `public/extension/` are static — reload extension at chrome://extensions after changes.

## Adding a new tool
1. Add to `TOOLS` array in `app/api/claude/route.ts`
2. Add case to `executeToolClient` switch in `app/chat/page.tsx`
3. If it's a new DealHub endpoint, add to `references/api-patterns.md`
4. Deploy + reload extension
