'use client';

import { useState, useRef, useEffect } from 'react';

const DH = {
  navy: '#0D1B4B',
  navyMid: '#1E3578',
  mint: '#4ECDB4',
  mintDark: '#37B09A',
  mintLight: '#E6F8F5',
  bg: '#F7F8FA',
  panel: '#FFFFFF',
  border: '#E4E7EF',
  borderFocus: '#4ECDB4',
  text: '#0D1B4B',
  textSub: '#3D5280',
  textMuted: '#8896B3',
  green: '#00875A',
  greenBg: '#E3FCEF',
  red: '#DE350B',
  redBg: '#FFEBE6',
};

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: ToolCall[];
}

interface Version {
  guid: string;
  name: string;
  status: string;
}

// ── Tool call block ───────────────────────────────────────────────────────────

function ToolCallBlock({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false);
  const isError = tc.result?.startsWith('Error:');
  const isPending = tc.result === undefined;
  return (
    <div className="mt-1.5 rounded-lg overflow-hidden text-xs" style={{ border: `1px solid ${DH.border}`, background: '#FAFBFC' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
        style={{ color: DH.textSub }}
      >
        <span className="flex-shrink-0">{isPending ? '⏳' : isError ? '❌' : '✅'}</span>
        <span className="font-mono font-semibold truncate">{tc.name}</span>
        <span className="ml-auto flex-shrink-0" style={{ color: DH.textMuted }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2" style={{ borderTop: `1px solid ${DH.border}` }}>
          {Object.keys(tc.input).length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider mt-2" style={{ color: DH.textMuted }}>Input</p>
              <pre className="whitespace-pre-wrap font-mono rounded p-2 max-h-32 overflow-y-auto text-[10px]" style={{ background: DH.bg, border: `1px solid ${DH.border}` }}>
                {JSON.stringify(tc.input, null, 2)}
              </pre>
            </>
          )}
          {tc.result !== undefined && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: DH.textMuted }}>Result</p>
              <pre
                className="whitespace-pre-wrap font-mono rounded p-2 max-h-48 overflow-y-auto text-[10px]"
                style={isError
                  ? { background: DH.redBg, border: `1px solid #FFBDAD`, color: DH.red }
                  : { background: DH.bg, border: `1px solid ${DH.border}`, color: DH.text }}
              >
                {tc.result}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Chat message ──────────────────────────────────────────────────────────────

function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5"
        style={{ background: isUser ? DH.navy : DH.mint, color: '#fff' }}
      >
        {isUser ? 'You' : 'DH'}
      </div>
      <div className={`max-w-[82%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {msg.text && (
          <div
            className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
            style={isUser
              ? { background: DH.navy, color: '#fff', borderBottomRightRadius: 4 }
              : { background: DH.panel, border: `1px solid ${DH.border}`, color: DH.text, borderBottomLeftRadius: 4 }}
          >
            {msg.text}
          </div>
        )}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="w-full mt-1">
            {msg.toolCalls.map((tc) => <ToolCallBlock key={tc.id} tc={tc} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Settings panel (connection) ───────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: DH.panel,
  border: `1.5px solid ${DH.border}`,
  borderRadius: 8,
  color: DH.text,
  fontSize: 13,
  outline: 'none',
  width: '100%',
  padding: '8px 12px',
};

function SettingsPanel({
  baseUrl, setBaseUrl,
  jsessionid, setJsessionid,
  playSession, setPlaySession,
  versions, selectedVersionGuid, setSelectedVersionGuid,
  connecting, connectError,
  isConnected,
  onConnect, onDisconnect, onClose,
}: {
  baseUrl: string; setBaseUrl: (v: string) => void;
  jsessionid: string; setJsessionid: (v: string) => void;
  playSession: string; setPlaySession: (v: string) => void;
  versions: Version[]; selectedVersionGuid: string; setSelectedVersionGuid: (v: string) => void;
  connecting: boolean; connectError: string;
  isConnected: boolean;
  onConnect: () => void; onDisconnect: () => void; onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col" style={{ background: DH.panel }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${DH.border}` }}>
        <p className="text-sm font-semibold" style={{ color: DH.text }}>Connection</p>
        <button type="button" onClick={onClose} className="text-lg leading-none" style={{ color: DH.textMuted }}>✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: DH.textSub }}>Tenant URL</label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => { setBaseUrl(e.target.value); }}
            placeholder="https://poc.dealhub.io"
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = DH.borderFocus)}
            onBlur={(e) => (e.target.style.borderColor = DH.border)}
          />
        </div>

        {isConnected && versions.length > 0 && (
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: DH.textSub }}>Version</label>
            <select
              value={selectedVersionGuid}
              onChange={(e) => setSelectedVersionGuid(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
              onFocus={(e) => (e.target.style.borderColor = DH.borderFocus)}
              onBlur={(e) => (e.target.style.borderColor = DH.border)}
            >
              {versions.map((v) => (
                <option key={v.guid} value={v.guid}>{v.name} ({v.status})</option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-3 rounded-xl p-3" style={{ background: DH.bg, border: `1px solid ${DH.border}` }}>
          <p className="text-xs font-semibold" style={{ color: DH.text }}>Session Cookies</p>
          <div>
            <label className="block text-[10px] font-mono font-semibold mb-1" style={{ color: DH.textMuted }}>JSESSIONID</label>
            <input
              type="password"
              value={jsessionid}
              onChange={(e) => setJsessionid(e.target.value)}
              placeholder="Paste value"
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              onFocus={(e) => (e.target.style.borderColor = DH.borderFocus)}
              onBlur={(e) => (e.target.style.borderColor = DH.border)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-mono font-semibold mb-1" style={{ color: DH.textMuted }}>DEALHUB_PLAY_SESSION</label>
            <input
              type="password"
              value={playSession}
              onChange={(e) => setPlaySession(e.target.value)}
              placeholder="Paste value"
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              onFocus={(e) => (e.target.style.borderColor = DH.borderFocus)}
              onBlur={(e) => (e.target.style.borderColor = DH.border)}
            />
          </div>
          <p className="text-[10px]" style={{ color: DH.textMuted }}>
            Chrome DevTools → Application → Cookies → {baseUrl ? new URL(baseUrl.includes('://') ? baseUrl : 'https://' + baseUrl).hostname : 'your domain'}
          </p>
        </div>

        {connectError && (
          <div className="rounded-lg px-3 py-2 text-xs" style={{ background: DH.redBg, color: DH.red }}>
            {connectError}
          </div>
        )}

        <button
          type="button"
          onClick={onConnect}
          disabled={connecting || !baseUrl || !playSession}
          className="w-full py-2.5 text-sm font-semibold text-white rounded-xl disabled:opacity-50 transition-opacity"
          style={{ background: DH.mint }}
        >
          {connecting ? 'Connecting…' : isConnected ? 'Reconnect' : 'Connect'}
        </button>

        {isConnected && (
          <button
            type="button"
            onClick={onDisconnect}
            className="w-full py-2 text-sm rounded-xl transition-colors"
            style={{ color: DH.red, border: `1px solid ${DH.border}` }}
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LS_KEY = 'dh_connection';

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) as { baseUrl: string; jsessionid: string; playSession: string } : null;
  } catch { return null; }
}

function getUrlParams() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const baseUrl = p.get('baseUrl');
  const ext = p.get('ext') === '1';
  const jsessionid = p.get('jsessionid') ?? '';
  const playSession = p.get('playSession') ?? '';
  const tabUrl = p.get('tabUrl') ?? '';
  if (baseUrl) return { baseUrl, jsessionid, playSession, ext, tabUrl };
  return null;
}

// ── Playbook mutation helpers (run client-side in extension mode) ──────────────

type PB = Record<string, unknown>;

function findGroup(pb: PB, name: string) {
  return (pb.solutions as PB[]).find((g) => g.name === name);
}
function requireGroup(pb: PB, name: string) {
  const g = findGroup(pb, name);
  if (!g) throw new Error(`Group "${name}" not found. Available: ${(pb.solutions as PB[]).map((g) => g.name).join(', ')}`);
  return g;
}
function findQuestion(pb: PB, name: string) {
  if (name.includes('.')) {
    const [gName, qName] = name.split('.', 2);
    const g = requireGroup(pb, gName);
    const q = (g.solutionAttributes as PB[]).find((q) => q.name === qName);
    if (!q) throw new Error(`Question "${qName}" not found in group "${gName}".`);
    return { group: g, question: q };
  }
  const matches: { group: PB; question: PB }[] = [];
  for (const g of pb.solutions as PB[]) {
    const q = (g.solutionAttributes as PB[]).find((q) => q.name === name);
    if (q) matches.push({ group: g, question: q });
  }
  if (!matches.length) throw new Error(`Question "${name}" not found.`);
  if (matches.length > 1) throw new Error(`Question "${name}" in multiple groups: ${matches.map((m) => m.group.name).join(', ')}. Use "Group.Question".`);
  return matches[0];
}
const TYPE_MAP: Record<string, string> = { text: 'Text answer', numeric: 'Numeric answer', text_list: 'Text list', date: 'Date', date_formula: 'Date', calculated: 'Calculated answer', textarea: 'Text answer' };

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const saved = typeof window !== 'undefined' ? loadSaved() : null;
  const urlParams = typeof window !== 'undefined' ? getUrlParams() : null;
  const initial = urlParams ?? saved;

  // Extension mode: ext=1 param from sidepanel, OR running in an iframe without cookies
  const extensionMode = !!(urlParams?.ext) || (typeof window !== 'undefined' && window !== window.top && !initial?.playSession);

  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? 'https://poc.dealhub.io');
  const [jsessionid, setJsessionid] = useState(initial?.jsessionid ?? '');
  const [playSession, setPlaySession] = useState(initial?.playSession ?? '');
  const [versions, setVersions] = useState<Version[]>([]);
  const [selectedVersionGuid, setSelectedVersionGuid] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(!!(initial?.playSession) || extensionMode);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sessionId = useRef(Math.random().toString(36).slice(2));
  // Client-side playbook cache (used in extension mode)
  const playbookRef = useRef<Record<string, PB>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cookies = [jsessionid && `JSESSIONID=${jsessionid}`, playSession && `DEALHUB_PLAY_SESSION=${playSession}`].filter(Boolean).join('; ');
  const selectedVersion = versions.find((v) => v.guid === selectedVersionGuid);
  const isConnected = versions.length > 0 || hasCredentials || extensionMode;

  // ── Extension API proxy ────────────────────────────────────────────────────
  const callExtApi = (method: string, path: string, body?: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2);
      const timeout = setTimeout(() => { window.removeEventListener('message', handler); reject(new Error('Extension proxy timeout')); }, 30000);
      function handler(e: MessageEvent) {
        if (e.data?.type !== 'dh_api_response' || e.data?.id !== id) return;
        window.removeEventListener('message', handler);
        clearTimeout(timeout);
        if (e.data.ok) resolve(e.data.data);
        else reject(new Error(e.data.error || `HTTP ${e.data.status}: ${typeof e.data.data === 'object' ? JSON.stringify(e.data.data) : e.data.data}`));
      }
      window.addEventListener('message', handler);
      window.parent.postMessage({ type: 'dh_api_request', id, baseUrl, method, path, body }, '*');
    });

  // ── Client-side tool execution (extension mode) ───────────────────────────
  const executeToolClient = async (name: string, input: Record<string, unknown>): Promise<string> => {
    const sid = sessionId.current;
    const pb = playbookRef.current[sid];

    switch (name) {
      case 'list_versions': {
        const raw = await callExtApi('GET', '/versions/admin?isArchived=false&versionsScreen=true') as PB[];
        const vs = raw.map((v) => ({ guid: v.guid, name: v.name, status: v.status }));
        // Update version list in UI
        setVersions(vs as Version[]);
        const active = vs.find((v) => v.status === 'ACTIVE') ?? vs[0];
        if (active) setSelectedVersionGuid(active.guid as string);
        return JSON.stringify(vs);
      }
      case 'list_playbooks': {
        const raw = await callExtApi('GET', `/playbooks?versionGUID=${input.versionGuid}`) as PB[];
        return JSON.stringify(raw.map((p) => ({ guid: p.guid, name: p.name })));
      }
      case 'playbook_load': {
        const loaded = await callExtApi('GET', `/playbook?playbookGUID=${input.playbookGuid}`) as PB;
        playbookRef.current[sid] = loaded;
        const groups = loaded.solutions as PB[];
        return `Loaded playbook "${loaded.name}" (${groups.length} groups, ${groups.reduce((n, g) => n + (g.solutionAttributes as unknown[]).length, 0)} questions)`;
      }
      case 'playbook_summary': {
        if (!pb) return 'No playbook loaded. Call playbook_load first.';
        return JSON.stringify({ name: pb.name, guid: pb.guid, groups: (pb.solutions as PB[]).map((g) => ({ name: g.name, displayedName: g.displayedName, kind: g.repetitive ? 'repeatable' : 'regular', questions: (g.solutionAttributes as PB[]).map((q) => ({ name: q.name, type: q.type })) })) }, null, 2);
      }
      case 'playbook_inspect_group':
        if (!pb) return 'No playbook loaded.';
        return JSON.stringify(requireGroup(pb, input.groupName as string), null, 2);
      case 'playbook_inspect_question': {
        if (!pb) return 'No playbook loaded.';
        const { question } = findQuestion(pb, input.questionName as string);
        return JSON.stringify(question, null, 2);
      }
      case 'group_create': {
        if (!pb) return 'No playbook loaded.';
        const { name, displayedName, kind } = input as { name: string; displayedName: string; kind: string };
        if (findGroup(pb, name)) throw new Error(`Group "${name}" already exists.`);
        const groups = pb.solutions as PB[];
        const isRep = kind === 'repeatable';
        groups.push({ name, displayedName, guid: null, versionGUID: pb.versionGUID, ordinal: groups.length, cpr: '', cprValid: true, enableCPR: false, global: false, globalBefore: true, showAsTable: isRep, tableColumnWidth: 220, showGroupNameColumn: false, enableSingleAddButton: false, addButtonLabel: 'Add new', enableMultiselectForTable: false, multiSelectButtonLabel: 'Select and add products', multiselectEntityType: 'PRODUCTS', enableCustomObject: false, customObjectBtnLabel: 'Get Subscriptions', customObjectQueryId: '', getAllSubscriptionsAutomatically: false, showExternalObjectButton: true, automaticRunCustomObject: false, automaticRunRefresh: false, automaticRunRefreshSolutions: [], showCustomObjectRefreshBtn: false, customObjectRefreshBtnLabel: 'Refresh Results', enableBulkDuplication: false, showRemoveSelectedRowsBtn: true, removeSelectedRowsBtnLabel: 'Remove selected rows', showSolutionTitle: true, isNewSolution: true, enablePreventImportUponErrors: false, enableDownloadTemplateButton: true, groupType: isRep ? 'REPEATABLE_GROUP' : 'QUESTIONS_GROUP', pinByDefaultList: [], repetitive: isRep, repetitiveName: isRep ? displayedName : null, enableProductSelectionPR: isRep ? { guid: null, rule: 'true', solutionAttributeGUID: null, ordinal: 0, accountGUID: pb.accountGUID, versionGUID: pb.versionGUID, presentationRuleType: 'ENABLE_PRODUCT_SELECTION' } : null, solutionAttributes: [], enableCommonPresentationRule: false, commonPresentationRule: null });
        return `Created group "${name}" (${kind}).`;
      }
      case 'group_delete': {
        if (!pb) return 'No playbook loaded.';
        const g = requireGroup(pb, input.groupName as string);
        pb.solutions = (pb.solutions as PB[]).filter((s) => s !== g);
        if (g.guid) pb.deletedItems = [...((pb.deletedItems as unknown[]) ?? []), { deletedType: 'SOLUTION', parentGUID: pb.guid, entityGUID: g.guid }];
        return `Deleted group "${input.groupName}".`;
      }
      case 'question_create': {
        if (!pb) return 'No playbook loaded.';
        const { groupName, name, label, type, textListValues, textListDefault, numericMin, numericMax, formula, isMandatory, defaultValue } = input as { groupName: string; name: string; label: string; type: string; textListValues?: string[]; textListDefault?: string; numericMin?: number; numericMax?: number; formula?: string; isMandatory?: boolean; defaultValue?: string };
        const g = requireGroup(pb, groupName);
        const qs = g.solutionAttributes as PB[];
        if (qs.some((q) => q.name === name)) throw new Error(`Question "${name}" already exists in group "${groupName}".`);
        const q: PB = { guid: null, type: TYPE_MAP[type] ?? 'Text answer', description: '', name, note: '', tooltip: '', question: label, ordinalValue: qs.length, solutionGUID: g.guid ?? null, value: [], valueLabels: {}, excludedFilterValues: [], conditionalRules: [], presentationRules: [], showMode: 'ALWAYS', readOnlyRule: (type === 'date_formula' || type === 'calculated') ? 'true' : 'false', hiddenRule: 'false', billingAttributeType: null, timezoneIndependent: false, dayOfMonth: 'ANY', calculateWhenRule: 'true', versionGUID: pb.versionGUID, pinByDefault: false, tableColumnWidth: 220, hidden: false, defaultValue: defaultValue ?? '', readOnly: type === 'date_formula' || type === 'calculated', step: null, isRichText: type === 'textarea', multiSelect: false, calculatedAnswer: type === 'calculated', dateAttributeValueType: null, displayNumberType: 'NUMBER', isMandatory: !!isMandatory, allowEmpty: false, mantissa: 0 };
        if (type === 'numeric') { q.value = [{ id: numericMin == null ? '5e-324' : String(numericMin), text: numericMin == null ? '5e-324' : String(numericMin) }, { id: numericMax == null ? '' : String(numericMax), text: numericMax == null ? '' : String(numericMax) }]; q.step = '1'; }
        else if (type === 'text_list') { q.value = (textListValues ?? []).map((v) => { const e = v.replace(/"/g, '\\"'); return { id: `"${e}"`, text: `"${e}"` }; }); const def = textListDefault ?? textListValues?.[0]; if (def) q.defaultValue = `"${def}"`; }
        else if (type === 'date_formula' || type === 'calculated') { if (!formula) throw new Error(`${type} requires a formula.`); q.dateAttributeValueType = type === 'date_formula' ? 'FORMULA' : null; q.defaultValue = formula; }
        qs.push(q);
        return `Added question "${name}" (${type}) to group "${groupName}".`;
      }
      case 'question_update': {
        if (!pb) return 'No playbook loaded.';
        const { questionName, label, textListValues, textListDefault, numericMin, numericMax, formula, isMandatory, defaultValue } = input as { questionName: string; label?: string; textListValues?: string[]; textListDefault?: string; numericMin?: number; numericMax?: number; formula?: string; isMandatory?: boolean; defaultValue?: string };
        const { question: q } = findQuestion(pb, questionName);
        if (label !== undefined) q.question = label;
        if (isMandatory !== undefined) q.isMandatory = isMandatory;
        if (defaultValue !== undefined) q.defaultValue = defaultValue;
        if (textListValues !== undefined) {
          q.value = textListValues.map((v) => { const e = v.replace(/"/g, '\\"'); return { id: `"${e}"`, text: `"${e}"` }; });
          const def = textListDefault ?? textListValues[0];
          if (def) q.defaultValue = `"${def.replace(/"/g, '\\"')}"`;
        }
        if (numericMin !== undefined || numericMax !== undefined) {
          const cur = (q.value as Array<{ id: string; text: string }>) ?? [{ id: '5e-324', text: '5e-324' }, { id: '', text: '' }];
          q.value = [
            { id: numericMin == null ? (cur[0]?.id ?? '5e-324') : String(numericMin), text: numericMin == null ? (cur[0]?.text ?? '5e-324') : String(numericMin) },
            { id: numericMax == null ? (cur[1]?.id ?? '') : String(numericMax), text: numericMax == null ? (cur[1]?.text ?? '') : String(numericMax) },
          ];
        }
        if (formula !== undefined) q.defaultValue = formula;
        return `Updated question "${questionName}".`;
      }
      case 'questions_bulk_create': {
        if (!pb) return 'No playbook loaded.';
        const { groupName, questions } = input as { groupName: string; questions: Array<{ name: string; label: string; type: string; textListValues?: string[]; textListDefault?: string; numericMin?: number; numericMax?: number; formula?: string; isMandatory?: boolean; defaultValue?: string }> };
        const g = requireGroup(pb, groupName);
        const qs = g.solutionAttributes as PB[];
        const results: string[] = [];
        for (const qi of questions) {
          const { name, label, type, textListValues, textListDefault, numericMin, numericMax, formula, isMandatory, defaultValue } = qi;
          if (qs.some((q) => q.name === name)) { results.push(`SKIP "${name}" (already exists)`); continue; }
          const q: PB = { guid: null, type: TYPE_MAP[type] ?? 'Text answer', description: '', name, note: '', tooltip: '', question: label, ordinalValue: qs.length, solutionGUID: g.guid ?? null, value: [], valueLabels: {}, excludedFilterValues: [], conditionalRules: [], presentationRules: [], showMode: 'ALWAYS', readOnlyRule: (type === 'date_formula' || type === 'calculated') ? 'true' : 'false', hiddenRule: 'false', billingAttributeType: null, timezoneIndependent: false, dayOfMonth: 'ANY', calculateWhenRule: 'true', versionGUID: pb.versionGUID, pinByDefault: false, tableColumnWidth: 220, hidden: false, defaultValue: defaultValue ?? '', readOnly: type === 'date_formula' || type === 'calculated', step: null, isRichText: type === 'textarea', multiSelect: false, calculatedAnswer: type === 'calculated', dateAttributeValueType: null, displayNumberType: 'NUMBER', isMandatory: !!isMandatory, allowEmpty: false, mantissa: 0 };
          if (type === 'numeric') { q.value = [{ id: numericMin == null ? '5e-324' : String(numericMin), text: numericMin == null ? '5e-324' : String(numericMin) }, { id: numericMax == null ? '' : String(numericMax), text: numericMax == null ? '' : String(numericMax) }]; q.step = '1'; }
          else if (type === 'text_list') { q.value = (textListValues ?? []).map((v) => { const e = v.replace(/"/g, '\\"'); return { id: `"${e}"`, text: `"${e}"` }; }); const def = textListDefault ?? textListValues?.[0]; if (def) q.defaultValue = `"${def}"`; }
          else if (type === 'date_formula' || type === 'calculated') { if (!formula) { results.push(`SKIP "${name}" (formula required)`); continue; } q.dateAttributeValueType = type === 'date_formula' ? 'FORMULA' : null; q.defaultValue = formula; }
          qs.push(q);
          results.push(`Added "${name}" (${type})`);
        }
        return results.join('\n');
      }
      case 'question_delete': {
        if (!pb) return 'No playbook loaded.';
        const { group, question } = findQuestion(pb, input.questionName as string);
        group.solutionAttributes = (group.solutionAttributes as PB[]).filter((q) => q !== question);
        (group.solutionAttributes as PB[]).forEach((q, i) => { q.ordinalValue = i; });
        if (question.guid) pb.deletedItems = [...((pb.deletedItems as unknown[]) ?? []), { deletedType: 'SOLUTION_ATTRIBUTE', parentGUID: group.guid ?? pb.guid, entityGUID: question.guid }];
        return `Deleted question "${input.questionName}".`;
      }
      case 'question_set_hidden_rule': { if (!pb) return 'No playbook loaded.'; findQuestion(pb, input.questionName as string).question.hiddenRule = input.rule; return `Set hiddenRule on "${input.questionName}" → ${input.rule}`; }
      case 'question_set_readonly_rule': { if (!pb) return 'No playbook loaded.'; findQuestion(pb, input.questionName as string).question.readOnlyRule = input.rule; return `Set readOnlyRule on "${input.questionName}" → ${input.rule}`; }
      case 'question_set_presentation_rule': {
        if (!pb) return 'No playbook loaded.';
        const { question } = findQuestion(pb, input.questionName as string);
        if (!input.rule) { question.showMode = 'ALWAYS'; question.presentationRules = []; return `Cleared presentation rule on "${input.questionName}".`; }
        question.showMode = 'RULE_BASED';
        question.presentationRules = [{ accountGUID: pb.accountGUID, guid: '', rule: input.rule, versionGUID: pb.versionGUID, ordinal: 0, solutionAttributeGUID: question.guid ?? '', presentationRuleType: 'SOLUTION_ATTRIBUTE' }];
        return `Set presentation rule on "${input.questionName}" → ${input.rule}`;
      }
      case 'playbook_save': {
        if (!pb) return 'No playbook loaded.';
        // Clone to avoid mutating the in-memory playbook
        const payload: PB = { ...pb };
        // Filter null-guid solutions (system-managed groups returned by GET that POST rejects)
        // Keep newly created groups (guid: null but isNewSolution: true)
        payload.solutions = (pb.solutions as PB[]).filter((s) => s.guid !== null || !!s.isNewSolution);
        // Strip GET-only fields that POST rejects on EU1
        delete payload.syncProductsToSfRule;
        delete payload.syncDocsToSfRule;
        delete payload.collapseQuoteSettingsRule;
        const result = await callExtApi('POST', '/playbook', payload) as PB;
        if (result && typeof result === 'object' && 'solutions' in result) playbookRef.current[sid] = result;
        return `Playbook "${pb.name}" saved successfully.`;
      }
      default: return `Unknown tool: ${name}`;
    }
  };

  const handleConnect = async (silent = false) => {
    const cookieStr = [jsessionid && `JSESSIONID=${jsessionid}`, playSession && `DEALHUB_PLAY_SESSION=${playSession}`].filter(Boolean).join('; ');
    if (!baseUrl || !cookieStr) return;
    setConnecting(true);
    setConnectError('');
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, sessionCookies: cookieStr }),
      });
      const data = await res.json() as { versions?: Version[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Connection failed');
      setVersions(data.versions ?? []);
      const active = data.versions?.find((v) => v.status === 'ACTIVE') ?? data.versions?.[0];
      if (active) setSelectedVersionGuid(active.guid);
      localStorage.setItem(LS_KEY, JSON.stringify({ baseUrl, jsessionid, playSession }));
      if (!silent) setSettingsOpen(false);
    } catch (e: unknown) {
      // Silent failures (auto-connect on load) just leave the chat in "not connected" state
      // Non-silent failures show the error in the settings panel
      if (!silent) setConnectError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem(LS_KEY);
    setVersions([]);
    setJsessionid('');
    setPlaySession('');
    setHasCredentials(false);
    setSettingsOpen(false);
  };

  useEffect(() => {
    if (urlParams) {
      window.history.replaceState({}, '', window.location.pathname);
      // Save to localStorage immediately so refresh keeps the session
      localStorage.setItem(LS_KEY, JSON.stringify({
        baseUrl: urlParams.baseUrl,
        jsessionid: urlParams.jsessionid,
        playSession: urlParams.playSession,
      }));
    }
    // Load versions in background — chat is already unlocked via hasCredentials
    if (initial?.playSession) handleConnect(true);
    // Extension mode: auto-load playbook if tab URL contains a playbook GUID
    if (extensionMode && initial?.baseUrl && initial?.tabUrl) {
      const guidMatch = initial.tabUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (guidMatch) {
        const playbookGuid = guidMatch[0];
        const sid = sessionId.current;
        const id = Math.random().toString(36).slice(2);
        const handler = (e: MessageEvent) => {
          if (e.data?.type !== 'dh_api_response' || e.data?.id !== id) return;
          window.removeEventListener('message', handler);
          if (e.data.ok && e.data.data && typeof e.data.data === 'object' && 'solutions' in e.data.data) {
            playbookRef.current[sid] = e.data.data as PB;
          }
        };
        window.addEventListener('message', handler);
        window.parent.postMessage({ type: 'dh_api_request', id, baseUrl: initial.baseUrl, method: 'GET', path: `/playbook?playbookGUID=${playbookGuid}` }, '*');
      }
    }
    // Auto-fetch versions so Claude skips list_versions round-trip
    if (extensionMode && initial?.baseUrl) {
      const id = Math.random().toString(36).slice(2);
      const handler = (e: MessageEvent) => {
        if (e.data?.type !== 'dh_api_response' || e.data?.id !== id) return;
        window.removeEventListener('message', handler);
        if (e.data.ok && Array.isArray(e.data.data)) {
          const vs: Version[] = (e.data.data as Array<Record<string, unknown>>).map((v) => ({ guid: v.guid as string, name: v.name as string, status: v.status as string }));
          setVersions(vs);
          const draft = vs.find((v) => v.status === 'DRAFT') ?? vs[0];
          if (draft) setSelectedVersionGuid(draft.guid);
        }
      };
      window.addEventListener('message', handler);
      window.parent.postMessage({ type: 'dh_api_request', id, baseUrl: initial.baseUrl, method: 'GET', path: '/versions/admin?isArchived=false&versionsScreen=true' }, '*');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Extension-mode agentic loop ────────────────────────────────────────────
  const sendMessageExtension = async (userText: string) => {
    const userMsg: Message = { role: 'user', text: userText.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Keep the full Anthropic-format history for multi-turn tool use
    let history: Array<{ role: string; content: unknown }> = [
      ...[...messages, userMsg].map((m) => ({ role: m.role, content: m.text })),
    ];

    setMessages((prev) => [...prev, { role: 'assistant', text: '', toolCalls: [] }]);

    try {
      while (true) {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, baseUrl, versionGuid: selectedVersionGuid || undefined, versionName: selectedVersion?.name, tabUrl: urlParams?.tabUrl || undefined }),
        });
        if (!res.body) throw new Error('No response body');

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        const toolCalls: ToolCall[] = [];
        let stopReason = 'end_turn';
        let assistantContent: unknown[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line);
              if (ev.type === 'text') {
                setMessages((prev) => { const next = [...prev]; const last = { ...next[next.length - 1] }; last.text = (last.text || '') + ev.text; next[next.length - 1] = last; return next; });
                assistantContent.push({ type: 'text', text: (assistantContent.filter((b: unknown) => (b as { type: string }).type === 'text').reduce((t, b) => t + (b as { text: string }).text, '') + ev.text) });
              } else if (ev.type === 'tool_use') {
                toolCalls.push({ id: ev.id, name: ev.name, input: ev.input });
                assistantContent.push({ type: 'tool_use', id: ev.id, name: ev.name, input: ev.input });
                setMessages((prev) => { const next = [...prev]; const last = { ...next[next.length - 1] }; last.toolCalls = [...(last.toolCalls ?? []), { id: ev.id, name: ev.name, input: ev.input }]; next[next.length - 1] = last; return next; });
              } else if (ev.type === 'done') {
                stopReason = ev.stop_reason;
              } else if (ev.type === 'error') {
                throw new Error(ev.error);
              }
            } catch (parseErr) { if (parseErr instanceof SyntaxError) continue; throw parseErr; }
          }
        }

        if (stopReason !== 'tool_use' || toolCalls.length === 0) break;

        // Execute tools client-side
        const toolResults: Array<{ type: string; tool_use_id: string; content: string }> = [];
        for (const tc of toolCalls) {
          let content: string;
          try { content = await executeToolClient(tc.name, tc.input); }
          catch (e: unknown) { content = `Error: ${e instanceof Error ? e.message : String(e)}`; }
          setMessages((prev) => { const next = [...prev]; const last = { ...next[next.length - 1] }; last.toolCalls = (last.toolCalls ?? []).map((t) => t.id === tc.id ? { ...t, result: content } : t); next[next.length - 1] = last; return next; });
          const MAX_TOOL_RESULT = 2000;
          const trimmedContent = content.length > MAX_TOOL_RESULT
            ? content.slice(0, MAX_TOOL_RESULT) + '\n…(truncated)'
            : content;
          toolResults.push({ type: 'tool_result', tool_use_id: tc.id, content: trimmedContent });
        }

        // Rebuild assistant content (deduplicate text blocks)
        const textBlock = assistantContent.filter((b: unknown) => (b as { type: string }).type === 'text');
        const finalText = textBlock.reduce((t, b) => (b as { text: string }).text, '');
        const cleanContent = [
          ...(finalText ? [{ type: 'text', text: finalText }] : []),
          ...assistantContent.filter((b: unknown) => (b as { type: string }).type === 'tool_use'),
        ];

        history = [...history, { role: 'assistant', content: cleanContent }, { role: 'user', content: toolResults }];
        setMessages((prev) => [...prev, { role: 'assistant', text: '', toolCalls: [] }]);
      }
    } catch (e: unknown) {
      setMessages((prev) => { const next = [...prev]; next[next.length - 1] = { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'Request failed'}` }; return next; });
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (userText: string) => {
    if (!userText.trim() || loading) return;
    if (!isConnected) { setSettingsOpen(true); return; }
    if (extensionMode) { await sendMessageExtension(userText); return; }

    const userMsg: Message = { role: 'user', text: userText.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev, { role: 'assistant', text: '', toolCalls: [] }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          baseUrl,
          sessionCookies: cookies,
          sessionId: sessionId.current,
          versionGuid: selectedVersionGuid || undefined,
          versionName: selectedVersion?.name || undefined,
        }),
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            setMessages((prev) => {
              const next = [...prev];
              const last = { ...next[next.length - 1] };
              if (event.type === 'text') last.text = (last.text || '') + event.text;
              else if (event.type === 'tool_use') last.toolCalls = [...(last.toolCalls ?? []), { id: event.id, name: event.name, input: event.input }];
              else if (event.type === 'tool_result') last.toolCalls = (last.toolCalls ?? []).map((tc) => tc.id === event.id ? { ...tc, result: event.content } : tc);
              else if (event.type === 'error') last.text = (last.text || '') + `\n\nError: ${event.error}`;
              next[next.length - 1] = last;
              return next;
            });
          } catch { /* skip malformed */ }
        }
      }
    } catch (e: unknown) {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', text: `Error: ${e instanceof Error ? e.message : 'Request failed'}` };
        return next;
      });
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden relative" style={{ background: DH.bg, fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }}>

      {/* Settings overlay */}
      {settingsOpen && (
        <SettingsPanel
          baseUrl={baseUrl} setBaseUrl={setBaseUrl}
          jsessionid={jsessionid} setJsessionid={setJsessionid}
          playSession={playSession} setPlaySession={setPlaySession}
          versions={versions} selectedVersionGuid={selectedVersionGuid} setSelectedVersionGuid={setSelectedVersionGuid}
          connecting={connecting} connectError={connectError}
          isConnected={isConnected}
          onConnect={() => handleConnect(false)}
          onDisconnect={handleDisconnect}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {/* Header */}
      <header className="flex-shrink-0 flex items-center gap-3 px-4 h-12" style={{ background: DH.panel, borderBottom: `1px solid ${DH.border}` }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: DH.navy }}>
          <span className="text-[10px] font-black" style={{ color: DH.mint }}>DH</span>
        </div>
        <span className="text-sm font-semibold flex-1" style={{ color: DH.text }}>DealHub Assistant</span>

        {isConnected && selectedVersion && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: DH.mintLight, color: DH.mint }}>
            {selectedVersion.name}
          </span>
        )}

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: DH.textMuted }}
          title="Settings"
          onMouseEnter={(e) => (e.currentTarget.style.background = DH.mintLight)}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: connecting ? '#FF8B00' : isConnected ? DH.mint : DH.border }}
          title={connecting ? 'Connecting…' : isConnected ? 'Connected' : 'Not connected'}
        />
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: DH.navy }}>
              <span className="text-lg font-black" style={{ color: DH.mint }}>DH</span>
            </div>
            <h2 className="text-base font-semibold mb-2" style={{ color: DH.text }}>DealHub AI Assistant</h2>
            {connecting ? (
              <p className="text-sm" style={{ color: DH.textMuted }}>Connecting…</p>
            ) : isConnected ? (
              <p className="text-sm max-w-xs leading-relaxed" style={{ color: DH.textSub }}>
                Ask me anything — add groups, create questions, set rules, load or save a playbook.
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm max-w-xs leading-relaxed" style={{ color: DH.textSub }}>
                  Connect to your DealHub environment to get started.
                </p>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl"
                  style={{ background: DH.mint }}
                >
                  Connect
                </button>
              </div>
            )}
          </div>
        )}
        {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
        {loading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold" style={{ background: DH.mint, color: '#fff' }}>DH</div>
            <div className="rounded-2xl rounded-bl-sm px-4 py-3" style={{ background: DH.panel, border: `1px solid ${DH.border}` }}>
              <div className="flex gap-1 items-center">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: DH.textMuted, animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-3 py-3" style={{ background: DH.panel, borderTop: `1px solid ${DH.border}` }}>
        <div className="flex gap-2 items-end rounded-2xl px-3 py-2" style={{ border: `1.5px solid ${loading ? DH.borderFocus : DH.border}`, background: DH.bg, transition: 'border-color 0.15s' }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isConnected ? 'Ask anything…' : 'Connect to get started'}
            rows={1}
            disabled={loading || !isConnected}
            className="flex-1 resize-none text-sm outline-none leading-relaxed"
            style={{ background: 'transparent', color: DH.text, maxHeight: 120, minHeight: 24 }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 120) + 'px';
            }}
            onFocus={(e) => (e.currentTarget.parentElement!.style.borderColor = DH.borderFocus)}
            onBlur={(e) => (e.currentTarget.parentElement!.style.borderColor = DH.border)}
          />
          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim() || !isConnected}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white flex-shrink-0 transition-opacity disabled:opacity-30"
            style={{ background: DH.mint }}
          >
            {loading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
