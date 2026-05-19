# DealHub AI Extension — Claude Instructions

## Project
Chrome extension + Vercel app that lets DealHub admins configure playbooks via natural language.
- **Frontend**: `app/chat/page.tsx` — chat UI, client-side agentic loop, all tool execution
- **API proxy**: `app/api/claude/route.ts` — thin Claude proxy (Haiku), tool definitions, system prompt
- **Extension**: `public/extension/` — background.js (API proxy via tab injection), popup, sidepanel
- **Deploy**: Vercel (`vercel --prod`), GitHub: `roykonfino-glitch/extension`

## How to work
1. `git pull` before starting
2. Make changes on a feature branch, never commit directly to `main`
3. `git push` → open PR → merge
4. After merging: `vercel --prod` to deploy

## Pre-reading (load before DealHub work)
- [DealHub Concepts](references/dealhub-concepts.md) — versions, playbooks, groups, questions, rules
- [API Patterns](references/api-patterns.md) — known endpoints, request/response shapes, gotchas
- [Extension Architecture](references/extension-architecture.md) — how the extension, iframe, and background.js connect
- [Tool Reference](references/tool-reference.md) — all Claude tools, what they do, when to use each

## Key rules
- Always work in DRAFT versions, never ACTIVE
- Use `question_update` not delete+recreate
- Use `questions_bulk_create` for 2+ questions
- `playbook_save` is called automatically after mutations
- Extension fetches run inside the DealHub tab via `chrome.scripting.executeScript`
