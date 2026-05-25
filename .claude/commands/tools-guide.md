# DealHub AI Tools — When to Use What

## TL;DR

| | Extension | Full Claude Toolkit |
|---|---|---|
| **What it is** | Side-panel chat in Chrome | Local CLI + Agent SDK + plugins |
| **Covers** | Playbook only (questions, groups, rules) | Every DealHub surface |
| **Best for** | Fast surgical edits in front of a customer | Builds, migrations, audits, multi-surface work |
| **Setup** | Zero — uses live browser session | git pull + npm install + creds |
| **Model** | Haiku · 4k tokens | Opus + Sonnet · up to 1M ctx |
| **Tools / scripts** | 16 tools | 200+ scripts, 14 skills, 140+ ref docs |

---

## Pick the right tool

### Use the Extension when…
- The change is **only** to playbook questions, groups, or rules
- You're in front of a customer and need a sub-minute edit
- One-off tweak: rename, formula fix, hide rule, add a few questions
- You're already inside DealHub and don't want to context-switch

### Use the Full Toolkit when…
- The change touches **catalog, pricing rules, workflows, output docs, submit validations, external queries, bundles, multi-year, or users**
- It's a brownfield migration or multi-surface build
- Impact Analysis is required before editing (mandatory: ninjarmm, leasequery, ceragon)
- You need a file deliverable (xlsx / pptx / pdf) or audit report
- It's a full new-client onboarding build

---

## Task reference

### Everyday playbook edits → Extension
| Task | Tool |
|---|---|
| Rename a question / change label | `question_update` |
| Add 2+ questions to a group | `questions_bulk_create` |
| Set hide / read-only / presentation rule | `question_set_hidden_rule` etc. |
| Fix a formula on one question | `question_update` with new formula |
| Simple formula (non-trivial: use Full Claude's `dealhub-formula-author` skill) | `question_update` |

### Builds & new configurations → Full Claude
| Task | Skill / script |
|---|---|
| Fresh SaaS playbook end-to-end (13 phases) | `default-saas-playbook` |
| Product catalog + assignment + pricing rules | `CatalogClient` + rule templates |
| Subscriptions group (CRM-pulled, renewals) | `subscriptions-builder` |
| Product_Selection picker + filter framework | `default-product-selection` (2-pass save) |
| Multi-year deal (Year-1/2/3 ramping) | `multi-year-builder` |

### Workflows, validations & integrations → Full Claude
| Task | Skill / endpoint |
|---|---|
| Approval workflow | `approval-workflow-builder` · `POST /workflowSpecialRule/save` · approver = `MANAGER` only |
| Block-on-submit validation | `submit-validation-builder` · `POST /submitValidationSettings` |
| CRM external query (SOQL / HubSpot / Dynamics) | `external-query-builder` · use `id` not `guid` from POST response |
| Order Form PDF template | Canonical 6-part body script |
| Volume discount table import | `dealhub-importer` |

### Audits & migrations → Full Claude
| Task | Why |
|---|---|
| Check dependencies before deleting a question | Native Impact Analysis — mandatory (CLAUDE.md rule #10) |
| Brownfield migration (e.g. ninjarmm picker refactor) | Lib preflights + picker simulator + brute-force audit + IA |
| Audit orphan questions across all surfaces | JSON.stringify scan + boundary-aware ref matching |
| Clone users across tenants | `user-management` skill — login-suffix safety, prod gate |
| Export audit deliverable (xlsx / pptx / pdf) | `downloads/` folder + format skill plugins |

---

## Key gotchas

- **Approval workflows**: `MANAGER` is the ONLY valid dynamic approver keyword — `OWNER`/`ADMIN`/`USER` silently fail. Use specific user GUIDs for non-manager approvers.
- **Product_Selection**: mandatory 2-pass save — first save regenerates `filters[]`, second wires `preFilter`.
- **External queries**: use `id` (not `guid`) from POST response for `customObjectQueryId`.
- **Submit validations**: `activeWhen` polarity = the BAD scenario (TRUE = block). `<X` treated as HTML tag — use `>` form.
- **Output docs**: no emojis (utf8mb3 DB rejects 4-byte UTF-8).
- **Brownfield tenants**: Impact Analysis before every save. No exceptions.
- **Multi-year vs Multi-offer**: Multi-System is one-way. Cannot run Multi-Year AND Multi-Offer simultaneously.

---

## Recommended workflow

1. **Extension** handles the daily drumbeat — quick edits while in DealHub with a customer. Sub-minute, zero friction.
2. When a request crosses a surface → **Full Claude** does the multi-surface build + IA + verification → ships to DRAFT → admin polishes with Extension.
3. **Brownfield clients** (ninjarmm, leasequery, ceragon) = Full Claude only. Corruption audits + IA discipline mandatory.
4. **New-client onboarding** = Full Claude. Canonical script covers all 13 phases in one command.

---

*Extension v1.3 · Updated 2026-05-25 · Roy Konfino & Dor Bar Aliya*
