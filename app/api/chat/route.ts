import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { DealHubWebClient } from '@/lib/web-dealhub-client';

export const maxDuration = 300;

// ── Playbook in-memory cache per session ─────────────────────────────────────
// Lives for the Node.js process lifetime — fine for local/dev use.
const playbookCache = new Map<string, Record<string, unknown>>();

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_versions',
    description: 'List all draft/active versions on the DealHub tenant. Returns [{guid, name, status}]. Call this first to find the right version GUID.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_playbooks',
    description: 'List all playbooks in a given version. Returns [{guid, name}].',
    input_schema: {
      type: 'object',
      properties: {
        versionGuid: { type: 'string', description: 'Version GUID from list_versions.' },
      },
      required: ['versionGuid'],
    },
  },
  {
    name: 'playbook_load',
    description: 'Load a playbook into session memory by its GUID. Must call this before any mutation or summary tool. The playbook stays loaded for all subsequent tool calls in this conversation turn.',
    input_schema: {
      type: 'object',
      properties: {
        playbookGuid: { type: 'string', description: 'Playbook GUID from list_playbooks.' },
      },
      required: ['playbookGuid'],
    },
  },
  {
    name: 'playbook_summary',
    description: 'Return a compact overview of the loaded playbook: group names, group kinds (regular/repeatable), and question names+types. No network call needed — uses in-memory state.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'playbook_inspect_group',
    description: 'Return the full JSON for one group from the loaded playbook, including all question details.',
    input_schema: {
      type: 'object',
      properties: {
        groupName: { type: 'string', description: 'Exact group name (case-sensitive).' },
      },
      required: ['groupName'],
    },
  },
  {
    name: 'playbook_inspect_question',
    description: 'Return the full JSON for one question. Use "Group.Question" notation if the same question name exists in multiple groups.',
    input_schema: {
      type: 'object',
      properties: {
        questionName: { type: 'string', description: 'Question name, optionally "Group.Question" form.' },
      },
      required: ['questionName'],
    },
  },
  {
    name: 'group_create',
    description: 'Add a new question group to the loaded playbook.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Internal group name (no spaces, use underscores).' },
        displayedName: { type: 'string', description: 'Label shown in the UI.' },
        kind: { type: 'string', enum: ['regular', 'repeatable'], description: 'regular = Q&A style, repeatable = table of rows (e.g. product lines).' },
      },
      required: ['name', 'displayedName', 'kind'],
    },
  },
  {
    name: 'group_delete',
    description: 'Delete a group from the loaded playbook.',
    input_schema: {
      type: 'object',
      properties: {
        groupName: { type: 'string' },
      },
      required: ['groupName'],
    },
  },
  {
    name: 'question_create',
    description: 'Add a question to a group in the loaded playbook.',
    input_schema: {
      type: 'object',
      properties: {
        groupName: { type: 'string', description: 'Target group name.' },
        name: { type: 'string', description: 'Internal question ID (no spaces, use underscores).' },
        label: { type: 'string', description: 'Question text shown to the rep.' },
        type: {
          type: 'string',
          enum: ['text', 'text_list', 'numeric', 'date', 'date_formula', 'calculated', 'textarea'],
          description: 'Question type.',
        },
        textListValues: { type: 'array', items: { type: 'string' }, description: 'For text_list: dropdown options (exact values).' },
        textListDefault: { type: 'string', description: 'For text_list: default selected value (must be in textListValues).' },
        numericMin: { type: 'number', description: 'For numeric: minimum value (omit for unbounded).' },
        numericMax: { type: 'number', description: 'For numeric: maximum value (omit for unbounded).' },
        formula: { type: 'string', description: 'For date_formula / calculated: the formula expression.' },
        isMandatory: { type: 'boolean', description: 'Whether the field is required.' },
        defaultValue: { type: 'string', description: 'Default value (for text / textarea).' },
      },
      required: ['groupName', 'name', 'label', 'type'],
    },
  },
  {
    name: 'question_delete',
    description: 'Delete a question from the loaded playbook. Runs a dependency check across hiddenRule / readOnlyRule / presentationRules / conditionalRules / formulas / defaultValue — if it returns "BLOCKED:" with a list of refs, rewire them first OR call again with force=true to delete anyway.',
    input_schema: {
      type: 'object',
      properties: {
        questionName: { type: 'string', description: 'Question name (use "Group.Question" if ambiguous).' },
        force: { type: 'boolean', description: 'Bypass the dependency check.' },
      },
      required: ['questionName'],
    },
  },
  {
    name: 'question_set_hidden_rule',
    description: 'Set a Hide rule on a question. Use DealHub rule syntax, e.g. "[Group.Question] == \\"Yes\\"".',
    input_schema: {
      type: 'object',
      properties: {
        questionName: { type: 'string' },
        rule: { type: 'string', description: 'DealHub rule expression. "true" = always hidden, "false" = never hidden.' },
      },
      required: ['questionName', 'rule'],
    },
  },
  {
    name: 'question_set_readonly_rule',
    description: 'Set a Read-only rule on a question.',
    input_schema: {
      type: 'object',
      properties: {
        questionName: { type: 'string' },
        rule: { type: 'string', description: 'DealHub rule expression. "true" = always read-only.' },
      },
      required: ['questionName', 'rule'],
    },
  },
  {
    name: 'question_set_presentation_rule',
    description: 'Set a "Define question: If" presentation rule. The question only shows when the rule is true. Pass null to clear and always show.',
    input_schema: {
      type: 'object',
      properties: {
        questionName: { type: 'string' },
        rule: { type: 'string', description: 'DealHub rule expression, or null to always show.' },
      },
      required: ['questionName', 'rule'],
    },
  },
  {
    name: 'playbook_save',
    description: 'Persist the loaded (and mutated) playbook back to DealHub. Always call this after making changes. Runs guardrail preflight first — refuses save if Product_Filters/Product_Selection are not merge-labeled, or if a Subscriptions group is placed before Product_Selection.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ─── Version-level tools (cookie-authed admin API) ──────────────────────────
  {
    name: 'version_create',
    description: 'Create a new blank DRAFT version on the tenant. Returns {guid,name,status}. NOTE: this is NOT a duplicate — playbooks/catalog start empty. True version duplication requires the Public Bearer API which the extension does not have.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Version name as it will appear in the Versions screen.' },
        comment: { type: 'string', description: 'Optional free-text comment shown in the version list.' },
      },
      required: ['name'],
    },
  },

  // ─── Assignment-rule templates ──────────────────────────────────────────────
  {
    name: 'template_list',
    description: 'List assignment-rule templates on a version. Returns [{guid,name,assignmentRule}]. Cheap inspection — call before editing a template so you have its full shape to round-trip.',
    input_schema: {
      type: 'object',
      properties: {
        versionGuid: { type: 'string' },
        playbookGuid: { type: 'string', description: 'Optional — narrows to one playbook.' },
      },
      required: ['versionGuid'],
    },
  },
  {
    name: 'template_save',
    description: 'Create or update one or more assignment-rule templates in a single call. Pass `changedTemplates` as an array of full template objects (round-trip via template_list first so you preserve unknown fields). To delete by name, pass `deletedTemplates: ["NAME"]`.',
    input_schema: {
      type: 'object',
      properties: {
        versionGuid: { type: 'string' },
        playbookGuid: { type: 'string' },
        changedTemplates: { type: 'array', items: { type: 'object' } },
        deletedTemplates: { type: 'array', items: { type: 'string' } },
      },
      required: ['versionGuid', 'playbookGuid', 'changedTemplates'],
    },
  },

  // ─── External Query (CRM lookup saved on the version) ──────────────────────
  {
    name: 'external_query_create',
    description: 'Create a saved External Query that pulls data from the connected CRM (renewals, contacts, opportunity flags, etc.) into a playbook. SF auto-fix: if queryText references EXTERNAL_FIELD(Account.Id) and the version SF mapping is missing it, this call AUTO-ADDS Account.Id to /salesforce/AdvancedSetting selected.fields[] before saving the query — preventing the silent no-op the user has been burned by. Returns {id, guid, sfMapping?}.',
    input_schema: {
      type: 'object',
      properties: {
        versionGuid: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        queryType: { type: 'string', enum: ['CRM'] },
        triggerType: { type: 'string', enum: ['USER_REQUEST', 'AUTOMATIC'] },
        queryText: { type: 'string', description: 'SOQL for Salesforce, JSON filter spec for HubSpot, FetchXML for MSD.' },
        entityName: { type: 'string', description: 'CRM object name (e.g. Account, Asset).' },
        cacheExpirationHours: { type: 'number' },
      },
      required: ['versionGuid', 'name', 'queryType', 'triggerType', 'queryText'],
    },
  },

  // ─── Volume-discount table upsert ───────────────────────────────────────────
  {
    name: 'discount_table_save',
    description: 'Create or replace a volume-discount table on a version. Tiers are full row objects {from,to,discount,name?}. If a table with the same id exists, its tiers are REPLACED (not merged) — the old tier guids are sent in deletedDiscounts so the server cleanly swaps.',
    input_schema: {
      type: 'object',
      properties: {
        versionGuid: { type: 'string' },
        id: { type: 'string', description: 'Stable table id. If omitted, derived from the name.' },
        name: { type: 'string' },
        tiers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              from: { type: 'number' },
              to: { type: 'number' },
              discount: { type: 'number', description: 'Discount percent (e.g. 10 for 10%).' },
              name: { type: 'string' },
            },
            required: ['from', 'to', 'discount'],
          },
        },
      },
      required: ['versionGuid', 'name', 'tiers'],
    },
  },
];

// ── Playbook mutation helpers (pure, no external deps) ────────────────────────

function findGroup(pb: Record<string, unknown>, name: string) {
  const groups = pb.solutions as Array<Record<string, unknown>>;
  return groups.find((g) => g.name === name);
}

function requireGroup(pb: Record<string, unknown>, name: string) {
  const g = findGroup(pb, name);
  if (!g) {
    const names = (pb.solutions as Array<Record<string, unknown>>).map((g) => g.name).join(', ');
    throw new Error(`Group "${name}" not found. Available: ${names}`);
  }
  return g;
}

function findQuestion(pb: Record<string, unknown>, name: string) {
  if (name.includes('.')) {
    const [gName, qName] = name.split('.', 2);
    const group = requireGroup(pb, gName);
    const qs = group.solutionAttributes as Array<Record<string, unknown>>;
    const q = qs.find((q) => q.name === qName);
    if (!q) throw new Error(`Question "${qName}" not found in group "${gName}".`);
    return { group, question: q };
  }
  const matches: Array<{ group: Record<string, unknown>; question: Record<string, unknown> }> = [];
  for (const g of pb.solutions as Array<Record<string, unknown>>) {
    const qs = g.solutionAttributes as Array<Record<string, unknown>>;
    const q = qs.find((q) => q.name === name);
    if (q) matches.push({ group: g, question: q });
  }
  if (matches.length === 0) throw new Error(`Question "${name}" not found.`);
  if (matches.length > 1) {
    throw new Error(`Question "${name}" exists in multiple groups: ${matches.map((m) => m.group.name).join(', ')}. Use "Group.Question" notation.`);
  }
  return matches[0];
}

function quotedTextListValue(v: string) {
  const escaped = v.replace(/"/g, '\\"');
  return { id: `"${escaped}"`, text: `"${escaped}"` };
}

// ─── Guardrails ──────────────────────────────────────────────────────────────
// Mirror of lib/dealhub/playbook.ts enforcement rules. Same logic lives in
// app/chat/page.tsx for the extension path.

function findQuestionReferences(
  pb: Record<string, unknown>,
  groupName: string,
  questionName: string,
): Array<{ group: string; question: string; field: string; snippet: string }> {
  const refs: Array<{ group: string; question: string; field: string; snippet: string }> = [];
  const bracketed = [`[${questionName}]`, `[${groupName}.${questionName}]`];
  const contains = (s: unknown) => typeof s === 'string' && bracketed.some((b) => s.includes(b));
  const ruleFields = ['hiddenRule', 'readOnlyRule', 'calculateWhenRule', 'defaultValue'];
  for (const g of (pb.solutions as Array<Record<string, unknown>>) ?? []) {
    for (const q of (g.solutionAttributes as Array<Record<string, unknown>>) ?? []) {
      for (const f of ruleFields) {
        const v = q[f];
        if (contains(v)) refs.push({ group: g.name as string, question: q.name as string, field: f, snippet: String(v).slice(0, 120) });
      }
      for (const pr of (q.presentationRules as Array<Record<string, unknown>>) ?? []) {
        if (contains(pr.rule)) refs.push({ group: g.name as string, question: q.name as string, field: 'presentationRule', snippet: String(pr.rule).slice(0, 120) });
      }
      for (const cr of (q.conditionalRules as Array<Record<string, unknown>>) ?? []) {
        if (contains(cr.rule)) refs.push({ group: g.name as string, question: q.name as string, field: 'conditionalRule.rule', snippet: String(cr.rule).slice(0, 120) });
        if (contains(cr.defaultValue)) refs.push({ group: g.name as string, question: q.name as string, field: 'conditionalRule.defaultValue', snippet: String(cr.defaultValue).slice(0, 120) });
      }
    }
  }
  return refs;
}

function preflightSave(pb: Record<string, unknown>): void {
  const groups = (pb.solutions as Array<Record<string, unknown>>) ?? [];
  const byName = (n: string) => groups.find((g) => g.name === n);
  const filters = byName('Product_Filters');
  const picker = byName('Product_Selection');
  if (filters && picker) {
    if (filters.displayedName !== picker.displayedName) {
      throw new Error(`[savePlaybook preflight: MERGE_LABEL] Product_Filters.displayedName ("${filters.displayedName}") must match Product_Selection.displayedName ("${picker.displayedName}").`);
    }
    if (picker.showSolutionTitle !== false) {
      throw new Error(`[savePlaybook preflight: MERGE_LABEL] Product_Selection.showSolutionTitle must be false when Product_Filters is present (currently ${picker.showSolutionTitle}).`);
    }
  }
  const subs = byName('Subscriptions');
  if (subs && picker) {
    const subsOrdinal = groups.indexOf(subs);
    const pickerOrdinal = groups.indexOf(picker);
    if (subsOrdinal < pickerOrdinal) {
      throw new Error(`[savePlaybook preflight: SUBSCRIPTIONS_ORDER] Subscriptions group (ordinal ${subsOrdinal}) must come AFTER Product_Selection (ordinal ${pickerOrdinal}).`);
    }
  }
}

const TYPE_MAP: Record<string, string> = {
  text: 'Text answer',
  numeric: 'Numeric answer',
  text_list: 'Text list',
  date: 'Date',
  date_formula: 'Date',
  calculated: 'Calculated answer',
  manual_item: 'Manual item',
  textarea: 'Text answer',
};

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  client: DealHubWebClient,
  sessionId: string,
): Promise<string> {
  const pb = playbookCache.get(sessionId);

  switch (name) {
    case 'list_versions': {
      const raw = await client.get<Array<{ guid: string; name: string; status: string }>>('/versions/admin?isArchived=false&versionsScreen=true');
      return JSON.stringify(raw.map((v) => ({ guid: v.guid, name: v.name, status: v.status })));
    }

    case 'list_playbooks': {
      const { versionGuid } = input as { versionGuid: string };
      const raw = await client.get<Array<{ guid: string; name: string }>>(`/playbooks?versionGUID=${versionGuid}`);
      return JSON.stringify(raw.map((p) => ({ guid: p.guid, name: p.name })));
    }

    case 'playbook_load': {
      const { playbookGuid } = input as { playbookGuid: string };
      const loaded = await client.get<Record<string, unknown>>(`/playbook?playbookGUID=${playbookGuid}`);
      playbookCache.set(sessionId, loaded);
      const groups = loaded.solutions as Array<Record<string, unknown>>;
      return `Loaded playbook "${loaded.name}" (${groups.length} groups, ${groups.reduce((n, g) => n + (g.solutionAttributes as unknown[]).length, 0)} questions)`;
    }

    case 'playbook_summary': {
      if (!pb) return 'No playbook loaded. Call playbook_load first.';
      const groups = pb.solutions as Array<Record<string, unknown>>;
      const summary = {
        name: pb.name,
        guid: pb.guid,
        groups: groups.map((g) => ({
          name: g.name,
          displayedName: g.displayedName,
          kind: g.repetitive ? 'repeatable' : 'regular',
          questions: (g.solutionAttributes as Array<Record<string, unknown>>).map((q) => ({
            name: q.name,
            type: q.type,
          })),
        })),
      };
      return JSON.stringify(summary, null, 2);
    }

    case 'playbook_inspect_group': {
      if (!pb) return 'No playbook loaded.';
      const g = requireGroup(pb, input.groupName as string);
      return JSON.stringify(g, null, 2);
    }

    case 'playbook_inspect_question': {
      if (!pb) return 'No playbook loaded.';
      const { question } = findQuestion(pb, input.questionName as string);
      return JSON.stringify(question, null, 2);
    }

    case 'group_create': {
      if (!pb) return 'No playbook loaded.';
      const { name, displayedName, kind } = input as { name: string; displayedName: string; kind: string };
      if (findGroup(pb, name)) throw new Error(`Group "${name}" already exists.`);
      const groups = pb.solutions as Array<Record<string, unknown>>;
      const isRepeatable = kind === 'repeatable';
      const newGroup: Record<string, unknown> = {
        name,
        displayedName,
        guid: null,
        versionGUID: pb.versionGUID,
        ordinal: groups.length,
        cpr: '',
        cprValid: true,
        enableCPR: false,
        global: false,
        globalBefore: true,
        showAsTable: isRepeatable,
        tableColumnWidth: 220,
        showGroupNameColumn: false,
        enableSingleAddButton: false,
        addButtonLabel: 'Add new',
        enableMultiselectForTable: false,
        multiSelectButtonLabel: 'Select and add products',
        multiselectEntityType: 'PRODUCTS',
        enableCustomObject: false,
        customObjectBtnLabel: 'Get Subscriptions',
        customObjectQueryId: '',
        getAllSubscriptionsAutomatically: false,
        showExternalObjectButton: true,
        automaticRunCustomObject: false,
        automaticRunRefresh: false,
        automaticRunRefreshSolutions: [],
        showCustomObjectRefreshBtn: false,
        customObjectRefreshBtnLabel: 'Refresh Results',
        enableBulkDuplication: false,
        showRemoveSelectedRowsBtn: true,
        removeSelectedRowsBtnLabel: 'Remove selected rows',
        showSolutionTitle: true,
        isNewSolution: true,
        enablePreventImportUponErrors: false,
        enableDownloadTemplateButton: true,
        groupType: isRepeatable ? 'REPEATABLE_GROUP' : 'QUESTIONS_GROUP',
        pinByDefaultList: [],
        repetitive: isRepeatable,
        repetitiveName: isRepeatable ? displayedName : null,
        enableProductSelectionPR: isRepeatable ? {
          guid: null,
          rule: 'true',
          solutionAttributeGUID: null,
          ordinal: 0,
          accountGUID: pb.accountGUID,
          versionGUID: pb.versionGUID,
          presentationRuleType: 'ENABLE_PRODUCT_SELECTION',
        } : null,
        solutionAttributes: [],
        enableCommonPresentationRule: false,
        commonPresentationRule: null,
      };
      groups.push(newGroup);
      return `Created group "${name}" (${kind}).`;
    }

    case 'group_delete': {
      if (!pb) return 'No playbook loaded.';
      const g = requireGroup(pb, input.groupName as string);
      pb.solutions = (pb.solutions as Array<unknown>).filter((s) => s !== g);
      if (g.guid) {
        const del = { deletedType: 'SOLUTION', parentGUID: pb.guid, entityGUID: g.guid };
        pb.deletedItems = [...((pb.deletedItems as unknown[]) ?? []), del];
      }
      return `Deleted group "${input.groupName}".`;
    }

    case 'question_create': {
      if (!pb) return 'No playbook loaded.';
      const { groupName, name, label, type, textListValues, textListDefault, numericMin, numericMax, formula, isMandatory, defaultValue } = input as {
        groupName: string; name: string; label: string; type: string;
        textListValues?: string[]; textListDefault?: string;
        numericMin?: number; numericMax?: number; formula?: string;
        isMandatory?: boolean; defaultValue?: string;
      };
      const g = requireGroup(pb, groupName);
      const qs = g.solutionAttributes as Array<Record<string, unknown>>;
      if (qs.some((q) => q.name === name)) throw new Error(`Question "${name}" already exists in group "${groupName}".`);

      const q: Record<string, unknown> = {
        guid: null,
        type: TYPE_MAP[type] ?? 'Text answer',
        description: '',
        name,
        note: '',
        tooltip: '',
        question: label,
        ordinalValue: qs.length,
        solutionGUID: g.guid ?? null,
        value: [],
        valueLabels: {},
        excludedFilterValues: [],
        conditionalRules: [],
        presentationRules: [],
        showMode: 'ALWAYS',
        readOnlyRule: (type === 'date_formula' || type === 'calculated') ? 'true' : 'false',
        hiddenRule: 'false',
        billingAttributeType: null,
        timezoneIndependent: false,
        dayOfMonth: 'ANY',
        calculateWhenRule: 'true',
        versionGUID: pb.versionGUID,
        pinByDefault: false,
        tableColumnWidth: 220,
        hidden: false,
        defaultValue: defaultValue ?? '',
        readOnly: type === 'date_formula' || type === 'calculated',
        step: null,
        isRichText: type === 'textarea',
        multiSelect: false,
        calculatedAnswer: type === 'calculated',
        dateAttributeValueType: null,
        displayNumberType: 'NUMBER',
        isMandatory: !!isMandatory,
        allowEmpty: false,
        mantissa: 0,
      };

      if (type === 'numeric') {
        const minId = numericMin == null ? '5e-324' : String(numericMin);
        const maxId = numericMax == null ? '' : String(numericMax);
        q.value = [{ id: minId, text: minId }, { id: maxId, text: maxId }];
        q.step = '1';
      } else if (type === 'text_list') {
        q.value = (textListValues ?? []).map(quotedTextListValue);
        const def = textListDefault ?? textListValues?.[0];
        if (def) q.defaultValue = `"${def}"`;
      } else if (type === 'date_formula' || type === 'calculated') {
        if (!formula) throw new Error(`${type} question "${name}" requires a formula.`);
        q.dateAttributeValueType = type === 'date_formula' ? 'FORMULA' : null;
        q.defaultValue = formula;
      }

      qs.push(q);
      return `Added question "${name}" (${type}) to group "${groupName}".`;
    }

    case 'question_delete': {
      if (!pb) return 'No playbook loaded.';
      const { group, question } = findQuestion(pb, input.questionName as string);
      if (!input.force) {
        const refs = findQuestionReferences(pb, group.name as string, question.name as string);
        if (refs.length > 0) {
          const head = refs.slice(0, 10).map((r) => `  - ${r.group}.${r.question} (${r.field}): ${r.snippet}`).join('\n');
          return `BLOCKED: question "${input.questionName}" is referenced ${refs.length}× across the playbook. Rewire or remove these refs first, or call again with force=true to delete anyway:\n${head}${refs.length > 10 ? `\n  …and ${refs.length - 10} more` : ''}`;
        }
      }
      const qs = group.solutionAttributes as Array<Record<string, unknown>>;
      group.solutionAttributes = qs.filter((q) => q !== question);
      (group.solutionAttributes as Array<Record<string, unknown>>).forEach((q, i) => { q.ordinalValue = i; });
      if (question.guid) {
        const del = { deletedType: 'SOLUTION_ATTRIBUTE', parentGUID: group.guid ?? pb.guid, entityGUID: question.guid };
        pb.deletedItems = [...((pb.deletedItems as unknown[]) ?? []), del];
      }
      return `Deleted question "${input.questionName}".`;
    }

    case 'question_set_hidden_rule': {
      if (!pb) return 'No playbook loaded.';
      const { question } = findQuestion(pb, input.questionName as string);
      question.hiddenRule = input.rule;
      return `Set hiddenRule on "${input.questionName}" to: ${input.rule}`;
    }

    case 'question_set_readonly_rule': {
      if (!pb) return 'No playbook loaded.';
      const { question } = findQuestion(pb, input.questionName as string);
      question.readOnlyRule = input.rule;
      return `Set readOnlyRule on "${input.questionName}" to: ${input.rule}`;
    }

    case 'question_set_presentation_rule': {
      if (!pb) return 'No playbook loaded.';
      const { question } = findQuestion(pb, input.questionName as string);
      const rule = input.rule as string | null;
      if (!rule) {
        question.showMode = 'ALWAYS';
        question.presentationRules = [];
      } else {
        question.showMode = 'RULE_BASED';
        question.presentationRules = [{
          accountGUID: pb.accountGUID,
          guid: '',
          rule,
          versionGUID: pb.versionGUID,
          ordinal: 0,
          solutionAttributeGUID: question.guid ?? '',
          presentationRuleType: 'SOLUTION_ATTRIBUTE',
        }];
      }
      return rule ? `Set presentation rule on "${input.questionName}" to: ${rule}` : `Cleared presentation rule on "${input.questionName}" (always shown).`;
    }

    // ─── Version-level ─────────────────────────────────────────────────
    case 'version_create': {
      const { name, comment } = input as { name: string; comment?: string };
      const res = await client.post<{ guid: string; name: string; status: string }>(
        '/versions/createOrUpdate',
        {
          comment: comment ?? '',
          defaultPartnerPrograms: ['', '', '', '', ''],
          deletedPartnersGUIDs: [],
          guid: null,
          name,
          status: 'DRAFT',
        },
      );
      return JSON.stringify({ guid: res.guid, name: res.name, status: res.status });
    }

    // ─── Assignment-rule templates ─────────────────────────────────────
    case 'template_list': {
      const { versionGuid, playbookGuid } = input as { versionGuid: string; playbookGuid?: string };
      const qs = playbookGuid
        ? `versionGuid=${versionGuid}&playbookGuid=${playbookGuid}`
        : `versionGuid=${versionGuid}`;
      const raw = await client.get<Record<string, unknown>>(`/masterdata/getRuleTemplates?${qs}`);
      const templates: Array<Record<string, unknown>> =
        (raw.templates as Array<Record<string, unknown>>)
        ?? (raw.changedTemplates as Array<Record<string, unknown>>)
        ?? (Array.isArray(raw) ? raw as unknown as Array<Record<string, unknown>> : []);
      return JSON.stringify(
        templates.map((t) => ({ guid: t.guid, name: t.name, assignmentRule: t.assignmentRule })),
        null, 2,
      );
    }
    case 'template_save': {
      const { versionGuid, playbookGuid, changedTemplates, deletedTemplates } = input as {
        versionGuid: string; playbookGuid: string;
        changedTemplates: Array<Record<string, unknown>>; deletedTemplates?: string[];
      };
      await client.post('/masterdata/saveRuleTemplates', {
        playbookGuid,
        versionGuid,
        changedTemplates,
        deletedTemplates: deletedTemplates ?? [],
        changeLogRecords: [],
      });
      return `Saved ${changedTemplates.length} template(s)${deletedTemplates?.length ? `, deleted ${deletedTemplates.length}` : ''}.`;
    }

    // ─── External Query (with SF auto-fix) ─────────────────────────────
    case 'external_query_create': {
      const { versionGuid, name, description, queryType, triggerType, queryText, entityName, cacheExpirationHours } = input as {
        versionGuid: string; name: string; description?: string;
        queryType: string; triggerType: string; queryText: string;
        entityName?: string; cacheExpirationHours?: number;
      };
      let sfMappingNote: string | null = null;
      if (queryType === 'CRM' && /EXTERNAL_FIELD\(Account\.Id\)/.test(queryText)) {
        const settings = await client.get<Record<string, unknown>>(
          `/salesforce/AdvancedSetting?versionGUID=${versionGuid}`,
        );
        const selected = (settings.selected as Record<string, unknown>) ?? {};
        const fields: Array<Record<string, unknown>> =
          (selected.fields as Array<Record<string, unknown>>) ?? [];
        const already = fields.some((f) => f.object === 'Account' && f.name === 'Id');
        if (!already) {
          const newEntry: Record<string, unknown> = {
            object: 'Account', name: 'Id', label: 'Account ID',
            displayName: 'Account.Id', content: 'Account.Id',
            dataType: 'TEXT2', type: 'Text2', originalType: 'id', valueType: 'SINGLE',
            function: 'NONE', read: true, write: false,
            subtype: '', originalSubtype: null, relationshipName: null,
            customObject: false, referenceFields: null, possibleValues: [],
            defaultValue: null, dateOnly: false, reference: false,
            url: false, picklist: false, boolean: null, lineItemField: null,
            versionGUID: versionGuid,
          };
          const { accountGUID: _a, syncPrimaryQuote: _s, fields: _rf, salesforceFields: _sf, billingEntityFields: _bef, billingEntities: _be, ...rest } = settings;
          void _a; void _s; void _rf; void _sf; void _bef; void _be;
          await client.post('/salesforce/AdvancedSetting', {
            ...rest,
            selected: { ...selected, fields: [...fields, newEntry] },
            changeLogRecords: [{
              date: Date.now(),
              username: 'DealHub Assistant', userlogin: 'web',
              action: 'New', object: '', objectName: '',
              subObject: 'Salesforce fields to be used in DealHub Playbook',
              subObjectName: 'Salesforce fields to be used in DealHub Playbook',
              attribute: 'Salesforce field', attributeName: 'Account.Id',
              fromValue: '', toValue: '',
              impersonatorUserName: null, impersonatorDealhubUser: false, dealhubUser: true,
            }],
          });
          sfMappingNote = 'auto-added Account.Id to /salesforce/AdvancedSetting';
        }
      }
      const resp = await client.post<Record<string, unknown>>('/externalQuery', {
        guid: null,
        name,
        description: description ?? '',
        entityName: entityName ?? '',
        queryType,
        triggerType,
        queryText,
        hiddenFields: [],
        cacheExpirationHours: cacheExpirationHours ?? 0,
        versionGUID: versionGuid,
        changeLogRecords: [],
      });
      if (!resp.id) throw new Error(`/externalQuery POST returned no id: ${JSON.stringify(resp).slice(0, 200)}`);
      return JSON.stringify({ id: resp.id, guid: resp.guid, ...(sfMappingNote ? { sfMapping: sfMappingNote } : {}) });
    }

    // ─── Volume-discount table ─────────────────────────────────────────
    case 'discount_table_save': {
      const { versionGuid, id, name, tiers } = input as {
        versionGuid: string; id?: string; name: string;
        tiers: Array<{ from: number; to: number; discount: number; name?: string }>;
      };
      const bag = await client.get<Record<string, unknown>>(`/volumeDiscount?versionGUID=${versionGuid}`);
      const all = (bag.volumeDiscounts as Array<Record<string, unknown>>) ?? [];
      const tableId = id ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const existing = all.find((t) => t.id === tableId);
      const others = all.filter((t) => t.id !== tableId);
      const deletedTierGuids: string[] = existing
        ? ((existing.fromToDiscounts as Array<Record<string, unknown>>) ?? [])
            .map((t) => t.guid as string).filter((g): g is string => !!g)
        : [];
      const newTable = {
        id: tableId,
        name,
        fromToDiscounts: tiers.map((t, i) => ({
          from: t.from, to: t.to, discount: t.discount, name: t.name ?? `Tier ${i + 1}`,
        })),
      };
      await client.post('/volumeDiscount/save', {
        accountGUID: bag.accountGUID,
        versionGUID: versionGuid,
        volumeDiscounts: [...others, newTable],
        deletedVolumeDiscounts: [],
        deletedDiscounts: deletedTierGuids,
        renamePriceFactors: [],
      });
      return `Saved discount table "${name}" (${tiers.length} tiers)${existing ? ' — replaced existing tiers' : ''}.`;
    }

    case 'playbook_save': {
      if (!pb) return 'No playbook loaded.';
      preflightSave(pb);
      const result = await client.post<unknown>('/playbook', pb);
      // Update cache with server response if it looks like a full playbook
      if (result && typeof result === 'object' && 'solutions' in (result as object)) {
        playbookCache.set(sessionId, result as Record<string, unknown>);
      }
      return `Playbook "${pb.name}" saved successfully.`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(context?: { baseUrl?: string; versionGuid?: string; versionName?: string }) {
  const ctx = context?.versionGuid
    ? `\n\n**Active context:**\n- Tenant: ${context.baseUrl ?? 'unknown'}\n- Version: ${context.versionName ?? 'unknown'} (GUID: ${context.versionGuid})\n\nWhen the user asks to list or load playbooks, use this version GUID automatically — don't ask for it.`
    : '';

  return `You are a DealHub CPQ configuration assistant. You help configure and modify DealHub playbooks through natural language requests.

DealHub is a CPQ (Configure, Price, Quote) platform. Key concepts:
- **Version**: A collection of playbooks. Always has a status (DRAFT / ACTIVE).
- **Playbook**: The quote configurator. Contains groups (sections) of questions.
- **Group**: A section in the playbook. Regular groups = Q&A fields. Repeatable groups = table rows (product lines, subscriptions).
- **Question**: A field within a group. Types: text, text_list (dropdown), numeric, date, date_formula (calculated date), calculated, textarea.
- **Rules**: DealHub uses rule expressions like [GroupName.QuestionName] == "Yes" for conditional logic.

Workflow:
1. Use list_versions → list_playbooks to find what the user is looking for (skip list_versions if a version is already in the active context below).
2. Call playbook_load to load a playbook into memory. If the user references a playbook you've loaded before in this conversation, call playbook_load again — the cache may have been cleared on the server.
3. Make changes using mutation tools (group_create, question_create, etc.).
4. Always call playbook_save when done with changes.

Be concise and action-oriented. When the user says "add X", do it — don't ask for confirmation unless something is genuinely ambiguous. After saving, confirm what was done.

Other tools at your disposal:
- version_create — POST /versions/createOrUpdate to mint a new blank DRAFT version. Use when only ACTIVE exists and the user wants to edit.
- template_list / template_save — round-trip assignment-rule templates (the "bag of defaults" applied when a product is assigned). Always template_list first to get the full template shape before editing.
- external_query_create — saved CRM query (SF/HubSpot/MSD). For SF, if queryText references EXTERNAL_FIELD(Account.Id), the tool auto-adds Account.Id to /salesforce/AdvancedSetting selected.fields[] before saving — fixes the silent no-op.
- discount_table_save — upsert a volume-discount tier table. Same id ⇒ tiers replaced cleanly.

question_delete runs a dependency check across hiddenRule / readOnlyRule / presentationRules / conditionalRules / formulas / defaultValue. If it returns "BLOCKED:", surface the refs to the user — don't bypass with force=true unless explicitly asked.

playbook_save GUARDRAILS (server-side preflight will throw — fix the structure rather than bypassing):
- MERGE_LABEL: if both Product_Filters and Product_Selection groups exist, they must share displayedName AND Product_Selection.showSolutionTitle must be false.
- SUBSCRIPTIONS_ORDER: a Subscriptions group must come AFTER Product_Selection in the playbook order.${ctx}`;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const send = async (data: object) => {
    await writer.write(encoder.encode(JSON.stringify(data) + '\n'));
  };

  (async () => {
    try {
      const { messages, baseUrl, sessionCookies, sessionId, versionGuid, versionName } = await req.json() as {
        messages: Anthropic.MessageParam[];
        baseUrl: string;
        sessionCookies: string;
        sessionId: string;
        versionGuid?: string;
        versionName?: string;
      };

      if (!baseUrl || !sessionCookies) {
        await send({ type: 'error', error: 'baseUrl and sessionCookies are required.' });
        return;
      }

      const dhClient = new DealHubWebClient(baseUrl, sessionCookies);
      const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      let currentMessages: Anthropic.MessageParam[] = [...messages];

      // Agentic loop — runs until Claude stops calling tools
      while (true) {
        const response = await claude.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          system: buildSystemPrompt({ baseUrl, versionGuid, versionName }),
          tools: TOOLS,
          messages: currentMessages,
        });

        // Emit text blocks as they come
        for (const block of response.content) {
          if (block.type === 'text') {
            await send({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            await send({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
          }
        }

        if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop_sequence') break;
        if (response.stop_reason !== 'tool_use') break;

        // Execute all tool calls
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of response.content) {
          if (block.type !== 'tool_use') continue;
          let content: string;
          try {
            content = await executeTool(block.name, block.input as Record<string, unknown>, dhClient, sessionId);
          } catch (e: unknown) {
            content = `Error: ${e instanceof Error ? e.message : String(e)}`;
          }
          await send({ type: 'tool_result', id: block.id, name: block.name, content });
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content });
        }

        // Add assistant turn + tool results to message history
        currentMessages = [
          ...currentMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ];
      }

      await send({ type: 'done' });
    } catch (e: unknown) {
      await send({ type: 'error', error: e instanceof Error ? e.message : String(e) });
    } finally {
      await writer.close();
    }
  })();

  return new NextResponse(stream.readable, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
}
