/**
 * Notifications (module 11): templates, campaigns, the delivery log and the providers page.
 *
 * Pure helpers and the API shapes, so the pages stay thin and the rules that matter are tested
 * in one place. Nothing here talks to the network.
 *
 *   * the editor's variable checks and its live preview mirror the server's rules
 *     (`servers/notifications/templating.py`); the server re-checks every one and is the
 *     authority, so these only spare a round trip and make the refusal visible while typing;
 *   * an India SMS template maps onto its DLT-approved text one placeholder per `{#var#}` slot;
 *   * the console never shows a secret: the providers page is presence (yes or no), never a
 *     value, and a recipient is whatever the server masked.
 */
import { can, type AdminAccess } from './adminScope';

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const canReadNotify = (a: AdminAccess | null) => can(a, 'notify.read');
export const canDraftTemplates = (a: AdminAccess | null) => can(a, 'notify.template');
export const canDraftCampaigns = (a: AdminAccess | null) => can(a, 'notify.campaign');

/** The country a new template starts in: the first market the operator's scopes name. */
export function defaultCountry(a: AdminAccess | null): 'IN' | 'US' {
  const code = (a?.scopes ?? []).map((s) => s.code).find((c) => /^(IN|US)(-|$)/.test(c));
  return code?.startsWith('US') ? 'US' : 'IN';
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export const CHANNELS = ['sms', 'whatsapp', 'email', 'push', 'in_app'] as const;
export type Channel = (typeof CHANNELS)[number];
export type Category = 'transactional' | 'promotional';
export type TemplateStatus = 'draft' | 'pending_approval' | 'active' | 'archived';
export type MessageStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'suppressed';
export type CampaignStatus = 'draft' | 'pending_approval' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

export type StaffRef = { id: number | null; email: string; label: string; role: string };

export type Registration = {
  id?: number; provider: string; sender_id: string; dlt_template_id: string; entity_id: string;
  registered_text: string; provider_template_id: string; whatsapp_template_name: string;
  whatsapp_namespace: string;
};

export type Problem = { code: string; field: string; message: string };

export type Template = {
  id: number; key: string; channel: Channel; country: string; locale: string; category: Category;
  subject: string; title: string; body: string; variables: string[]; personal_variables: string[];
  sample_values: Record<string, string>; version: number; status: TemplateStatus; reason: string;
  created_by: StaffRef; created_at: string; activated_at: string | null; archived_at: string | null;
  changed_via_request_id: number | null; registrations?: Registration[];
};

export type TemplateDetail = Template & {
  registrations: Registration[];
  versions: { id: number; version: number; status: TemplateStatus; created_at: string; activated_at: string | null }[];
  activation_problems: Problem[];
};

export type PreviewResult = {
  values: Record<string, string>; problems: string[]; body: string; subject: string; title: string;
  missing: string[]; registration_problems: Problem[];
};

export type Funnel = {
  total: number; not_opted_in: number; unreachable_on_channel: number; reachable: number;
  held_by_quiet_hours: number; send_now: number; quiet_hours: [number, number];
  earliest_release_at: string | null; channel: Channel;
};

export type Campaign = {
  id: number; name: string; country: string; status: CampaignStatus;
  template: { id: number; key: string; channel: Channel; version: number; status: TemplateStatus };
  audience: { role: 'drivers' | 'riders'; cities: string[]; status: string[]; last_active_days: number | null };
  template_values: Record<string, string>; scope: string | null; scheduled_at: string | null;
  audience_count: number; queued_count: number; suppressed_count: number; reason: string;
  approval_request_id: number | null; created_by: StaffRef; created_at: string;
  started_at: string | null; finished_at: string | null; cancelled_at: string | null;
};

export type CampaignDetail = Campaign & { funnel: Funnel; message_counts: Record<string, number> };

export type TimelineEvent = {
  status: MessageStatus; at: string; source: string; detail: string; provider: string;
  provider_message_id: string;
};

export type Message = {
  id: number; template_key: string; template_version: number; channel: Channel; category: Category;
  country: string; city: { code: string; name: string } | null; recipient_user_id: number;
  recipient: string; provider: string; provider_message_id: string; status: MessageStatus;
  suppression_reason: string; attempts: number; last_error: string; source: string;
  campaign_id: number | null; subject: string; title: string; body: string; body_hash: string;
  not_before: string | null; created_at: string; sent_at: string | null; timeline?: TimelineEvent[];
};

export type ProviderRow = {
  channel: Channel; country: string; provider: string; mode: 'live' | 'stub';
  effective_provider: string; internal: boolean; credentials_present: boolean;
  credential_names: string[]; recent_total: number; recent_failed: number;
};

export type ProviderState = {
  live_send: boolean; production: boolean; allowlist_size: number; allowlist_applies: boolean;
  quiet_hours: Record<string, [number, number]>; providers: ProviderRow[];
};

export type City = { code: string; name: string; country: string };

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const CHANNEL_WORDS: Record<Channel, string> = {
  sms: 'SMS', whatsapp: 'WhatsApp', email: 'Email', push: 'Push', in_app: 'In-app',
};

export const TEMPLATE_STATUS_WORDS: Record<TemplateStatus, string> = {
  draft: 'Draft', pending_approval: 'Waiting for a checker', active: 'Active', archived: 'Archived',
};

export const CAMPAIGN_STATUS_WORDS: Record<CampaignStatus, string> = {
  draft: 'Draft', pending_approval: 'Waiting for a checker', scheduled: 'Scheduled',
  sending: 'Sending', sent: 'Sent', cancelled: 'Cancelled',
};

export const MESSAGE_STATUS_WORDS: Record<MessageStatus, string> = {
  queued: 'Queued', sending: 'Sending', sent: 'Sent', delivered: 'Delivered', failed: 'Failed',
  suppressed: 'Suppressed',
};

export type Tone = 'good' | 'bad' | 'wait' | 'neutral';

export const messageTone = (s: MessageStatus): Tone =>
  s === 'delivered' || s === 'sent' ? 'good' : s === 'failed' ? 'bad' : s === 'suppressed' ? 'neutral' : 'wait';
export const templateTone = (s: TemplateStatus): Tone =>
  s === 'active' ? 'good' : s === 'pending_approval' ? 'wait' : 'neutral';
export const campaignTone = (s: CampaignStatus): Tone =>
  s === 'sent' ? 'good' : s === 'cancelled' ? 'neutral' : s === 'draft' ? 'neutral' : 'wait';

/** "21:00 to 10:00" for a [start, end] pair of hours. */
export function hoursWords(h: readonly [number, number] | undefined | null): string {
  if (!h) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h[0])}:00 to ${pad(h[1])}:00`;
}

// ---------------------------------------------------------------------------
// Placeholders, variables and the live preview (mirrors templating.py)
// ---------------------------------------------------------------------------

const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/g;
export const DLT_SLOT = '{#var#}';
export const MAX_VALUE_LENGTH = 300;
export const MAX_BODY_LENGTH = 2000;
const NAME_OK = /^[a-z][a-z0-9_]*$/;

/** Placeholder names in order of appearance, repeats kept. */
export function placeholdersOf(text: string | null | undefined): string[] {
  return Array.from((text ?? '').matchAll(PLACEHOLDER), (m) => m[1]);
}

/** Every distinct placeholder across the copy, in the order first seen: "detect from text". */
export function detectVariables(...texts: (string | null | undefined)[]): string[] {
  const seen: string[] = [];
  for (const t of texts) for (const n of placeholdersOf(t)) if (!seen.includes(n)) seen.push(n);
  return seen;
}

/** A comma or space separated list typed into a field, as clean variable names. */
export function parseNames(input: string): string[] {
  const out: string[] = [];
  for (const part of input.split(/[\s,]+/)) {
    const name = part.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

export type CopyDraft = {
  body: string; subject: string; title: string; variables: string[]; personal: string[];
};

/** What is wrong with the copy, in words. Empty means the copy is fine. */
export function validateCopy(d: CopyDraft): string[] {
  const problems: string[] = [];
  const declared = d.variables;
  if (new Set(declared).size !== declared.length) problems.push('Declared variables contain duplicates.');
  for (const name of declared) {
    if (!NAME_OK.test(name)) {
      problems.push(`Variable name "${name}" must be lowercase letters, digits and underscores.`);
    }
  }
  if (!d.body.trim()) problems.push('The body is empty.');
  if (d.body.length > MAX_BODY_LENGTH) problems.push(`The body is longer than ${MAX_BODY_LENGTH} characters.`);
  for (const [label, text] of [['body', d.body], ['subject', d.subject], ['title', d.title]] as const) {
    if (text.includes(DLT_SLOT)) {
      problems.push(`The ${label} uses ${DLT_SLOT}; write the named placeholder, for example {name}.`);
    }
    const undeclared = Array.from(new Set(placeholdersOf(text))).filter((n) => !declared.includes(n)).sort();
    if (undeclared.length) problems.push(`The ${label} uses undeclared variables: ${undeclared.join(', ')}.`);
    const leftover = text.split(DLT_SLOT).join('').replace(PLACEHOLDER, '');
    if (/[{}]/.test(leftover)) problems.push(`The ${label} has a stray brace or a malformed placeholder.`);
  }
  const used = new Set([...placeholdersOf(d.body), ...placeholdersOf(d.subject), ...placeholdersOf(d.title)]);
  const unused = declared.filter((n) => !used.has(n)).sort();
  if (unused.length) problems.push(`Declared but never used: ${unused.join(', ')}.`);
  const stray = d.personal.filter((n) => !declared.includes(n)).sort();
  if (stray.length) problems.push(`Personal variables must be declared variables: ${stray.join(', ')}.`);
  return problems;
}

export type Rendered = { text: string; missing: string[] };

/** Substitute `{name}` with sample values; names with no value are listed, not guessed. */
export function renderPreview(text: string | null | undefined, values: Record<string, string>): Rendered {
  const missing: string[] = [];
  const out = (text ?? '').replace(PLACEHOLDER, (_all, name: string) => {
    const v = values[name];
    if (v === undefined || v === null || v === '') {
      if (!missing.includes(name)) missing.push(name);
      return `{${name}}`;
    }
    return String(v).slice(0, MAX_VALUE_LENGTH);
  });
  return { text: out, missing };
}

// ---------------------------------------------------------------------------
// SMS length: how many segments a rendered body costs
// ---------------------------------------------------------------------------

const GSM7 = new RegExp(
  '^[A-Za-z0-9 \\r\\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&\'()*+,\\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\\\\\[~\\]|€]*$');

/** `{ chars, segments, unicode }` for a rendered SMS body (GSM-7: 160 / 153, Unicode: 70 / 67). */
export function smsSegments(text: string): { chars: number; segments: number; unicode: boolean } {
  const chars = Array.from(text).length;
  const unicode = !GSM7.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi);
  return { chars, segments, unicode };
}

// ---------------------------------------------------------------------------
// India DLT and registrations (mirrors template_workflow.registration_problems)
// ---------------------------------------------------------------------------

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** The body as DLT would be asked to approve it: each placeholder becomes a `{#var#}` slot. */
export function toDltText(body: string): string {
  return body.replace(PLACEHOLDER, DLT_SLOT);
}

export function dltSlotCount(registeredText: string): number {
  return registeredText.split(DLT_SLOT).length - 1;
}

/** Why `body` cannot be sent under the registered DLT text. Empty means it maps one to one. */
export function dltMappingProblems(body: string, registeredText: string): string[] {
  if (!squash(registeredText)) return ['No DLT-approved text is recorded for this template.'];
  const problems: string[] = [];
  const placeholders = placeholdersOf(body).length;
  const slots = dltSlotCount(registeredText);
  if (placeholders !== slots) {
    problems.push(`The body has ${placeholders} placeholder(s) but the DLT text has ${slots} ${DLT_SLOT} slot(s); they must map one to one, in order.`);
  }
  if (squash(toDltText(body)) !== squash(registeredText)) {
    problems.push(`The body does not match the DLT-approved text once placeholders are replaced by ${DLT_SLOT}. The fixed words must be exactly what was registered.`);
  }
  return problems;
}

/** Which registration inputs the editor must offer for a channel and country. */
export function registrationKind(channel: Channel, country: string): 'india_sms' | 'whatsapp' | null {
  if (channel === 'sms' && country === 'IN') return 'india_sms';
  if (channel === 'whatsapp') return 'whatsapp';
  return null;
}

export const emptyRegistration = (provider = 'msg91'): Registration => ({
  provider, sender_id: '', dlt_template_id: '', entity_id: '', registered_text: '',
  provider_template_id: '', whatsapp_template_name: '', whatsapp_namespace: '',
});

/** The same refusal the server gives, computed from the unsaved registration, for the editor. */
export function registrationProblems(
  channel: Channel, country: string, body: string, reg: Registration | undefined | null,
): Problem[] {
  const out: Problem[] = [];
  const has = (v: string | undefined) => !!v && v.trim() !== '';
  const kind = registrationKind(channel, country);
  if (kind === 'india_sms') {
    const missing: string[] = [];
    if (!has(reg?.dlt_template_id)) missing.push('DLT template ID');
    if (!has(reg?.sender_id)) missing.push('sender ID');
    if (!has(reg?.provider_template_id)) missing.push('msg91 flow ID');
    if (missing.length) {
      out.push({
        code: 'DLT_REGISTRATION_REQUIRED', field: 'registrations',
        message: `An India SMS template cannot be activated without its ${missing.join(' and ')} registered for msg91. Add the registration, then submit again.`,
      });
    }
    if (has(reg?.registered_text) || missing.length === 0) {
      for (const message of dltMappingProblems(body, reg?.registered_text ?? '')) {
        out.push({ code: 'DLT_PLACEHOLDER_MISMATCH', field: 'registrations', message });
      }
    }
  } else if (kind === 'whatsapp' && !has(reg?.whatsapp_template_name)) {
    out.push({
      code: 'WHATSAPP_REGISTRATION_REQUIRED', field: 'registrations',
      message: 'A WhatsApp template cannot be activated without the approved template name registered for msg91.',
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Campaign audience words
// ---------------------------------------------------------------------------

/** The funnel as sentences a checker can read: who is in, who is out, and why. */
export function funnelLines(f: Funnel): string[] {
  const lines = [`${f.total} in the audience`];
  if (f.not_opted_in) lines.push(`${f.not_opted_in} left out: promotional messages go only to people who opted in`);
  if (f.unreachable_on_channel) lines.push(`${f.unreachable_on_channel} left out: nothing on file to reach them on ${CHANNEL_WORDS[f.channel]}`);
  lines.push(`${f.reachable} will receive it`);
  if (f.held_by_quiet_hours) {
    lines.push(`${f.held_by_quiet_hours} of those are held by quiet hours (${hoursWords(f.quiet_hours)}, their local time) and go at the end of the window`);
  }
  return lines;
}

/** The share of recent sends that failed, as "12%", or a dash with nothing sent. */
export function failureRate(row: Pick<ProviderRow, 'recent_total' | 'recent_failed'>): string {
  return row.recent_total === 0 ? '—' : `${Math.round((row.recent_failed / row.recent_total) * 100)}%`;
}

/** Extra query for the delivery log filters (starts with `&`, to follow `?limit=..`); blanks left out. */
export function logQuery(f: { status: string; channel: string; provider: string; template: string; userId: string }): string {
  const q = new URLSearchParams();
  if (f.status) q.set('status', f.status);
  if (f.channel) q.set('channel', f.channel);
  if (f.provider) q.set('provider', f.provider);
  if (f.template.trim()) q.set('template', f.template.trim());
  if (f.userId.trim()) q.set('user_id', f.userId.trim());
  const s = q.toString();
  return s ? `&${s}` : '';
}
