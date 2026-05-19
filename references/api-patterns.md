# DealHub API Patterns

## Base URL
`https://{tenant}.dealhub.io` — user provides this (e.g. poc.dealhub.io)

## Auth
- Session cookie: `JSESSIONID` (server-side session)
- CSRF token: extracted from `DEALHUB_PLAY_SESSION` JWT payload → `data.csrfToken` or `csrfToken`
- CSRF-Token header required on all non-GET requests
- Extension fetches via `chrome.scripting.executeScript` in DealHub tab (cookies included automatically)

## Known endpoints

### Versions
| Method | Path | Notes |
|--------|------|-------|
| GET | `/versions/admin?isArchived=false&versionsScreen=true` | List all versions |
| POST | `/versions/duplicate` | Duplicate a version (body: gzip JSON) |

### Playbooks
| Method | Path | Notes |
|--------|------|-------|
| GET | `/playbooks?versionGUID={guid}` | List playbooks in version |
| GET | `/playbook?playbookGUID={guid}` | Load full playbook |
| POST | `/playbook` | Save playbook (full object) |

### Output Documents
| Method | Path | Notes |
|--------|------|-------|
| GET | `/outputdocs?docType=DOCUMENT&versionGUID={guid}` | List output docs |
| POST | `/outputdoc/createOrUpdate` | Create/update doc (multipart) |
| GET | `/outputData/edit?guid={docGuid}&versionGUID={vguid}` | Load doc for editing |
| POST | `/outputData/save` | Save doc (gzip JSON body) |

### Other
| Method | Path | Notes |
|--------|------|-------|
| GET | `/init` | Tenant init data |
| GET | `/userManagement/list_all_basic_users` | All users |
| GET | `/currencies/coins/get` | Currency list |
| GET | `/geoFactor` | Geo pricing factors |

## Response patterns
- 401 + `{redirect: true, location: "https://login.dealhub.io"}` = session expired → tell user to refresh their DealHub tab
- 400 = usually malformed body (check null-guid solutions, GET-only fields)
- Successful save returns full updated playbook object

## Adding new endpoints
When a new endpoint is discovered (via Network tab capture):
1. Add to this file with method, path, and sample request/response shape
2. Add corresponding tool to `app/api/claude/route.ts` TOOLS array
3. Implement in `executeToolClient` in `app/chat/page.tsx`
4. Commit + `vercel --prod`
