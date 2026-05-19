// Thin Claude proxy for the extension-mode client-side agentic loop.
// Accepts messages (including tool results), calls Claude once, streams text
// and returns complete tool_use blocks. Tool *execution* happens in the browser.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 300;

const TOOLS: Anthropic.Tool[] = [
  { name: 'list_versions', description: 'List all versions on the DealHub tenant. Returns [{guid,name,status}].', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'list_playbooks', description: 'List playbooks in a version. Returns [{guid,name}].', input_schema: { type: 'object', properties: { versionGuid: { type: 'string' } }, required: ['versionGuid'] } },
  { name: 'playbook_load', description: 'Load a playbook into session memory by GUID.', input_schema: { type: 'object', properties: { playbookGuid: { type: 'string' } }, required: ['playbookGuid'] } },
  { name: 'playbook_summary', description: 'Return compact overview of loaded playbook (groups + question names/types).', input_schema: { type: 'object', properties: {}, required: [] } },
  { name: 'playbook_inspect_group', description: 'Return full JSON for one group from the loaded playbook.', input_schema: { type: 'object', properties: { groupName: { type: 'string' } }, required: ['groupName'] } },
  { name: 'playbook_inspect_question', description: 'Return full JSON for one question. Use "Group.Question" if ambiguous.', input_schema: { type: 'object', properties: { questionName: { type: 'string' } }, required: ['questionName'] } },
  { name: 'group_create', description: 'Add a question group to the loaded playbook.', input_schema: { type: 'object', properties: { name: { type: 'string' }, displayedName: { type: 'string' }, kind: { type: 'string', enum: ['regular', 'repeatable'] } }, required: ['name', 'displayedName', 'kind'] } },
  { name: 'group_delete', description: 'Delete a group from the loaded playbook.', input_schema: { type: 'object', properties: { groupName: { type: 'string' } }, required: ['groupName'] } },
  { name: 'question_create', description: 'Add a single question to a group. Use questions_bulk_create when adding 2 or more questions.', input_schema: { type: 'object', properties: { groupName: { type: 'string' }, name: { type: 'string' }, label: { type: 'string' }, type: { type: 'string', enum: ['text','text_list','numeric','date','date_formula','calculated','textarea'] }, textListValues: { type: 'array', items: { type: 'string' } }, textListDefault: { type: 'string' }, numericMin: { type: 'number' }, numericMax: { type: 'number' }, formula: { type: 'string' }, isMandatory: { type: 'boolean' }, defaultValue: { type: 'string' } }, required: ['groupName','name','label','type'] } },
  { name: 'questions_bulk_create', description: 'Add multiple questions to a group in one call. Always prefer this over repeated question_create calls.', input_schema: { type: 'object', properties: { groupName: { type: 'string' }, questions: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, label: { type: 'string' }, type: { type: 'string', enum: ['text','text_list','numeric','date','date_formula','calculated','textarea'] }, textListValues: { type: 'array', items: { type: 'string' } }, textListDefault: { type: 'string' }, numericMin: { type: 'number' }, numericMax: { type: 'number' }, formula: { type: 'string' }, isMandatory: { type: 'boolean' }, defaultValue: { type: 'string' } }, required: ['name','label','type'] } } }, required: ['groupName','questions'] } },
  { name: 'question_update', description: 'Update properties of an existing question (label, values, formula, isMandatory, defaultValue). Prefer this over delete+recreate.', input_schema: { type: 'object', properties: { questionName: { type: 'string' }, label: { type: 'string' }, textListValues: { type: 'array', items: { type: 'string' } }, textListDefault: { type: 'string' }, numericMin: { type: 'number' }, numericMax: { type: 'number' }, formula: { type: 'string' }, isMandatory: { type: 'boolean' }, defaultValue: { type: 'string' } }, required: ['questionName'] } },
  { name: 'question_delete', description: 'Delete a question from the loaded playbook. Only use when truly removing; never delete then recreate to change values — use question_update instead. Runs a dependency check across all rules/formulas/defaults — if it returns "BLOCKED:" with a list of refs, rewire the refs first OR call again with force=true to delete anyway.', input_schema: { type: 'object', properties: { questionName: { type: 'string' }, force: { type: 'boolean', description: 'Bypass the dependency check. Use only when you know there are no refs (e.g. rolling back a just-added question).' } }, required: ['questionName'] } },
  { name: 'question_set_hidden_rule', description: 'Set a Hide rule on a question.', input_schema: { type: 'object', properties: { questionName: { type: 'string' }, rule: { type: 'string' } }, required: ['questionName','rule'] } },
  { name: 'question_set_readonly_rule', description: 'Set a Read-only rule on a question.', input_schema: { type: 'object', properties: { questionName: { type: 'string' }, rule: { type: 'string' } }, required: ['questionName','rule'] } },
  { name: 'question_set_presentation_rule', description: 'Set a presentation rule on a question (null to clear).', input_schema: { type: 'object', properties: { questionName: { type: 'string' }, rule: { type: 'string' } }, required: ['questionName','rule'] } },
  { name: 'playbook_save', description: 'Persist the loaded playbook back to DealHub. Always call after mutations. Runs guardrail preflight first — refuses save if Product_Filters/Product_Selection are not merge-labeled, or if a Subscriptions group is placed before Product_Selection.', input_schema: { type: 'object', properties: {}, required: [] } },

  // ─── Version-level tools (cookie-authed admin API) ──────────────────────────
  { name: 'version_create', description: 'Create a new blank DRAFT version on the tenant. Returns {guid,name,status}. NOTE: this is NOT a duplicate — playbooks/catalog start empty. True version duplication requires the Public Bearer API which the extension does not have.', input_schema: { type: 'object', properties: { name: { type: 'string', description: 'Version name as it will appear in the Versions screen.' }, comment: { type: 'string', description: 'Optional free-text comment shown in the version list.' } }, required: ['name'] } },

  // ─── Assignment-rule templates (the "bag of defaults" applied when a product is assigned) ─
  { name: 'template_list', description: 'List assignment-rule templates on a version. Returns [{guid,name,assignmentRule}]. Cheap inspection — call before editing a template so you have its full shape to round-trip.', input_schema: { type: 'object', properties: { versionGuid: { type: 'string' }, playbookGuid: { type: 'string', description: 'Optional — narrows to one playbook.' } }, required: ['versionGuid'] } },
  { name: 'template_save', description: 'Create or update one or more assignment-rule templates in a single call. Pass `changedTemplates` as an array of full template objects (round-trip via template_list first so you preserve unknown fields). To delete by name, pass `deletedTemplates: ["NAME"]`.', input_schema: { type: 'object', properties: { versionGuid: { type: 'string' }, playbookGuid: { type: 'string' }, changedTemplates: { type: 'array', items: { type: 'object' }, description: 'Array of full template objects to upsert.' }, deletedTemplates: { type: 'array', items: { type: 'string' }, description: 'Names of templates to delete.' } }, required: ['versionGuid', 'playbookGuid', 'changedTemplates'] } },

  // ─── External Query (CRM lookup saved on the version) ──────────────────────
  { name: 'external_query_create', description: 'Create a saved External Query that pulls data from the connected CRM (renewals, contacts, opportunity flags, etc.) into a playbook. SF auto-fix: if queryText references EXTERNAL_FIELD(Account.Id) and the version SF mapping is missing it, this call AUTO-ADDS Account.Id to /salesforce/AdvancedSetting selected.fields[] before saving the query — preventing the silent no-op the user has been burned by. Returns {id, guid, sfMapping?}.', input_schema: { type: 'object', properties: { versionGuid: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, queryType: { type: 'string', enum: ['CRM'], description: 'CRM for SF / HubSpot / MSD.' }, triggerType: { type: 'string', enum: ['USER_REQUEST', 'AUTOMATIC'], description: 'USER_REQUEST = button click; AUTOMATIC = on quote open.' }, queryText: { type: 'string', description: 'CRM-specific syntax: SOQL for Salesforce, JSON filter spec for HubSpot, FetchXML for MSD.' }, entityName: { type: 'string', description: 'CRM object name (e.g. Account, Asset).' }, cacheExpirationHours: { type: 'number' } }, required: ['versionGuid', 'name', 'queryType', 'triggerType', 'queryText'] } },

  // ─── Volume-discount table upsert ───────────────────────────────────────────
  { name: 'discount_table_save', description: 'Create or replace a volume-discount table on a version. Tiers are full row objects {from, to, discount, name?}. If a table with the same id exists, its tiers are REPLACED (not merged) — the old tier guids are sent in deletedDiscounts so the server cleanly swaps.', input_schema: { type: 'object', properties: { versionGuid: { type: 'string' }, id: { type: 'string', description: 'Stable table id. If omitted, derived from the name.' }, name: { type: 'string' }, tiers: { type: 'array', items: { type: 'object', properties: { from: { type: 'number' }, to: { type: 'number' }, discount: { type: 'number', description: 'Discount percent (e.g. 10 for 10%).' }, name: { type: 'string' } }, required: ['from', 'to', 'discount'] } } }, required: ['versionGuid', 'name', 'tiers'] } },
];

function buildSystem(baseUrl?: string, versionGuid?: string, versionName?: string, tabUrl?: string) {
  const ctx = versionGuid
    ? `\n\n**Active context:** Tenant: ${baseUrl ?? 'unknown'} · Version: ${versionName ?? 'unknown'} (GUID: ${versionGuid})\nUse this version GUID automatically when listing/loading playbooks.`
    : '';
  const tabCtx = tabUrl
    ? `\n**Current tab URL:** ${tabUrl}\nIf this URL contains a playbook GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx pattern), the playbook is already pre-loaded in memory — call playbook_summary immediately instead of playbook_load.`
    : '';
  return `You are a DealHub CPQ configuration assistant. Configure playbooks fast with minimal back-and-forth.

DealHub concepts: Version (DRAFT/ACTIVE), Playbook (groups of questions), Group (regular=Q&A, repeatable=table rows), Question (text/text_list/numeric/date/calculated/textarea), Rules (e.g. [Group.Question] == "Yes").

Workflow: list_versions → list_playbooks → playbook_load → mutate → playbook_save.
Skip list_versions if version is in context. Skip playbook_load if tab URL matches a pre-loaded playbook.

BEHAVIOUR — follow strictly:
- Act immediately. Never ask for confirmation before making changes. If the request is clear, do it.
- Never ask "which playbook?" — if context has a loaded playbook, use it. If not, call playbook_summary to check, then load if needed.
- After every mutation (create/update/delete), call playbook_save automatically. Do not ask the user if they want to save.
- When adding 2+ questions, always use questions_bulk_create — never loop question_create.
- Always work in DRAFT versions. If only ACTIVE exists, tell the user to create a DRAFT first (use version_create). Don't proceed without a DRAFT.
- To change a question's properties: use question_update, never delete+recreate.
- question_delete now runs a dependency check across hiddenRule / readOnlyRule / presentationRules / conditionalRules / formulas / defaultValue. If it returns "BLOCKED" with a list of refs, surface them to the user — don't bypass.
- textListValues: plain text only — no HTML, Markdown, or // comments.
- If a tool returns "session expired": tell the user "Please refresh your DealHub tab and try again." Stop there.

CRM lookups (when user asks to pull renewals/subscriptions/related-opportunities from CRM):
- Use external_query_create. Salesforce → SOQL; HubSpot → JSON filter spec; MSD → FetchXML.
- SF-only: if your SOQL references EXTERNAL_FIELD(Account.Id), the tool auto-adds Account.Id to /salesforce/AdvancedSetting — don't ask, it just works.

Discount tables: use discount_table_save (volume tiers). Passing the same id replaces tiers cleanly.

Templates: assignment-rule templates carry the defaults applied when a product hits the cart. Use template_list to inspect, template_save to upsert. Round-trip the FULL template object — never partial — so you preserve unknown fields the server expects.

playbook_save GUARDRAILS (the server-side preflight will throw — don't try to bypass):
- MERGE_LABEL: if both Product_Filters and Product_Selection groups exist, they must share displayedName AND Product_Selection.showSolutionTitle must be false. Otherwise the filter framework breaks at runtime.
- SUBSCRIPTIONS_ORDER: a Subscriptions group must come AFTER Product_Selection in the playbook order. Otherwise renewal lines load before the picker is wired and the merge UI breaks.
- If a guardrail throws, FIX the structure (rename / reorder / set showSolutionTitle) and call playbook_save again. Do not bypass.${ctx}${tabCtx}`;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const send = async (d: object) => writer.write(encoder.encode(JSON.stringify(d) + '\n'));

  (async () => {
    try {
      const { messages, baseUrl, versionGuid, versionName, tabUrl } = await req.json() as {
        messages: Anthropic.MessageParam[];
        baseUrl?: string;
        versionGuid?: string;
        versionName?: string;
        tabUrl?: string;
      };

      const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const response = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: buildSystem(baseUrl, versionGuid, versionName, tabUrl),
        tools: TOOLS,
        messages,
      });

      for (const block of response.content) {
        if (block.type === 'text') await send({ type: 'text', text: block.text });
        else if (block.type === 'tool_use') await send({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
      }
      await send({ type: 'done', stop_reason: response.stop_reason });
    } catch (e: unknown) {
      await send({ type: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      await writer.close();
    }
  })();

  return new NextResponse(stream.readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' } });
}
