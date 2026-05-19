# Claude Tool Reference

All tools execute client-side in `executeToolClient()` in `app/chat/page.tsx`.
Tool definitions (name, description, input_schema) live in `app/api/claude/route.ts`.

## Navigation tools
| Tool | Input | Notes |
|------|-------|-------|
| `list_versions` | — | Returns [{guid,name,status}]. Updates version dropdown. |
| `list_playbooks` | versionGuid | Returns [{guid,name}]. |
| `playbook_load` | playbookGuid | Loads into playbookRef cache. Returns summary. |
| `playbook_summary` | — | Compact overview: groups + question names/types. |
| `playbook_inspect_group` | groupName | Full JSON for one group. |
| `playbook_inspect_question` | questionName | Full JSON for one question. Use "Group.Question" if ambiguous. |

## Mutation tools
| Tool | Input | Notes |
|------|-------|-------|
| `group_create` | name, displayedName, kind | kind: regular\|repeatable |
| `group_delete` | groupName | Adds to deletedItems for server cleanup. |
| `question_create` | groupName, name, label, type, [...] | Single question. Use bulk for 2+. |
| `questions_bulk_create` | groupName, questions[] | Preferred for 2+ questions. |
| `question_update` | questionName, [label, textListValues, formula, ...] | Modify without delete+recreate. |
| `question_delete` | questionName | Only when truly removing. |

## Rule tools
| Tool | Input | Notes |
|------|-------|-------|
| `question_set_hidden_rule` | questionName, rule | Sets hiddenRule expression. |
| `question_set_readonly_rule` | questionName, rule | Sets readOnlyRule expression. |
| `question_set_presentation_rule` | questionName, rule | null rule clears (reverts to ALWAYS). |

## Save
| Tool | Input | Notes |
|------|-------|-------|
| `playbook_save` | — | Always called automatically after mutations. Filters null-guid solutions, strips GET-only fields before POST. |

## Behaviour rules (baked into system prompt)
- After every mutation → auto-save (no need to ask)
- 2+ questions → use questions_bulk_create
- Existing question needs changes → use question_update, never delete+recreate
- textListValues → plain text only, no HTML/Markdown/comments
- DRAFT versions only — refuse if only ACTIVE exists
- Session expired error → "refresh your DealHub tab"
- Act immediately, no confirmation prompts

## Adding new tools
See `references/extension-architecture.md` → "Adding a new tool"
