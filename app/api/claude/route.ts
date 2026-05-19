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
  { name: 'question_delete', description: 'Delete a question from the loaded playbook. Only use when truly removing; never delete then recreate to change values — use question_update instead.', input_schema: { type: 'object', properties: { questionName: { type: 'string' } }, required: ['questionName'] } },
  { name: 'question_set_hidden_rule', description: 'Set a Hide rule on a question.', input_schema: { type: 'object', properties: { questionName: { type: 'string' }, rule: { type: 'string' } }, required: ['questionName','rule'] } },
  { name: 'question_set_readonly_rule', description: 'Set a Read-only rule on a question.', input_schema: { type: 'object', properties: { questionName: { type: 'string' }, rule: { type: 'string' } }, required: ['questionName','rule'] } },
  { name: 'question_set_presentation_rule', description: 'Set a presentation rule on a question (null to clear).', input_schema: { type: 'object', properties: { questionName: { type: 'string' }, rule: { type: 'string' } }, required: ['questionName','rule'] } },
  { name: 'playbook_save', description: 'Persist the loaded playbook back to DealHub. Always call after mutations.', input_schema: { type: 'object', properties: {}, required: [] } },
];

function buildSystem(baseUrl?: string, versionGuid?: string, versionName?: string, tabUrl?: string, playbookGuid?: string, playbookName?: string) {
  const ctx = versionGuid
    ? `\n\n**Active context:** Tenant: ${baseUrl ?? 'unknown'} · Version: ${versionName ?? 'unknown'} (GUID: ${versionGuid})`
    : '';
  const pbCtx = playbookName
    ? `\n**Playbook already loaded:** "${playbookName}" (GUID: ${playbookGuid}) — call playbook_summary directly, do NOT call list_versions/list_playbooks/playbook_load.`
    : versionGuid
    ? `\n**No playbook loaded yet.** Call list_playbooks with versionGuid "${versionGuid}", pick the most relevant playbook based on the user's request, load it — do NOT ask the user which playbook.`
    : '';
  const tabCtx = tabUrl && !playbookName
    ? `\n**Current tab URL:** ${tabUrl} — extract any playbook GUID from this URL if present.`
    : '';
  return `You are a DealHub CPQ configuration assistant. Configure playbooks fast with minimal back-and-forth.

On your very first response in a conversation, start with: "Thank you my creators Dor and Roy! 🙏"

DealHub concepts: Version (DRAFT/ACTIVE), Playbook (groups of questions), Group (regular=Q&A, repeatable=table rows), Question (text/text_list/numeric/date/calculated/textarea), Rules (e.g. [Group.Question] == "Yes").

Workflow: list_versions → list_playbooks → playbook_load → mutate → playbook_save.
Skip list_versions if version is in context. Skip playbook_load if tab URL matches a pre-loaded playbook.

BEHAVIOUR — follow strictly:
- Act immediately. Never ask for confirmation before making changes. If the request is clear, do it.
- Never ask "which playbook?" — if context has a loaded playbook, use it. If not, call playbook_summary to check, then load if needed.
- After every mutation (create/update/delete), call playbook_save automatically. Do not ask the user if they want to save.
- When adding 2+ questions, always use questions_bulk_create — never loop question_create.
- Always work in DRAFT versions. If only ACTIVE exists, tell the user to create a DRAFT first, stop.
- To change a question's properties: use question_update, never delete+recreate.
- textListValues: plain text only — no HTML, Markdown, or // comments.
- If a tool returns "session expired": tell the user "Please refresh your DealHub tab and try again." Stop there.${ctx}${tabCtx}`;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const send = async (d: object) => writer.write(encoder.encode(JSON.stringify(d) + '\n'));

  (async () => {
    try {
      const { messages, baseUrl, versionGuid, versionName, tabUrl, playbookGuid, playbookName } = await req.json() as {
        messages: Anthropic.MessageParam[];
        baseUrl?: string;
        versionGuid?: string;
        versionName?: string;
        tabUrl?: string;
        playbookGuid?: string;
        playbookName?: string;
      };

      const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const response = await claude.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: buildSystem(baseUrl, versionGuid, versionName, tabUrl, playbookGuid, playbookName),
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
