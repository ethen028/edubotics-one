import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '../Icon';
import { badge, C, radius } from '../theme';
import { Button } from '../ui';
import { CRM_IS_SAMPLE, logActivity, markDone, onCrmChange, setDue } from './data';
import type { ActivityType, DealStage, FollowUp, LeadSource, LeadStatus, OrgType } from './types';

/** Pieces shared by the CRM phone screens. Words and pill colours match the web CRM (src/app/(app)/crm/constants.ts). */

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: keyof typeof badge }> = {
  NEW: { label: 'New', tone: 'blue' },
  CONTACTED: { label: 'Contacted', tone: 'purple' },
  QUALIFIED: { label: 'Qualified', tone: 'green' },
  UNQUALIFIED: { label: 'Not a fit', tone: 'gray' },
  CONVERTED: { label: 'Converted', tone: 'green' },
};
export const STAGE: Record<DealStage, { label: string; tone: keyof typeof badge }> = {
  PROSPECT: { label: 'Prospect', tone: 'gray' },
  DEMO: { label: 'Demo', tone: 'blue' },
  PROPOSAL: { label: 'Proposal', tone: 'purple' },
  NEGOTIATION: { label: 'Negotiation', tone: 'amber' },
  WON: { label: 'Won', tone: 'green' },
  LOST: { label: 'Lost', tone: 'red' },
};
export const STAGES: DealStage[] = ['PROSPECT', 'DEMO', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];
export const OPEN_STAGES: DealStage[] = ['PROSPECT', 'DEMO', 'PROPOSAL', 'NEGOTIATION'];
export const SOURCE: Record<LeadSource, string> = {
  WEBSITE: 'Website', REFERRAL: 'Referral', WALK_IN: 'Walk-in', PHONE: 'Phone call', EMAIL: 'Email', SOCIAL: 'Social media', EVENT: 'Event', OTHER: 'Other',
};
export const ORG_TYPE: Record<OrgType, string> = {
  SCHOOL: 'School', COLLEGE: 'College', UNIVERSITY: 'University', CORPORATE: 'Company', GOVERNMENT: 'Government', NGO: 'NGO', PARTNER: 'Partner', OTHER: 'Other',
};
export const ACTIVITY: Record<ActivityType, { label: string; icon: string }> = {
  CALL: { label: 'Call', icon: 'phone' },
  MEETING: { label: 'Meeting', icon: 'users' },
  VISIT: { label: 'Visit', icon: 'compass' },
  EMAIL: { label: 'Email', icon: 'send' },
  TASK: { label: 'Task', icon: 'check' },
  NOTE: { label: 'Note', icon: 'file' },
};

/** The round icon at the start of a lead or institution row: a school, another kind of institution, or a person. */
export const orgIcon = (type: OrgType | null) => (type === 'SCHOOL' ? 'school' : type ? 'building' : 'user');
export function RoundIcon({ name }: { name: string }) {
  return <View style={st.roundIcon}><Icon name={name} color={C.blue} size={20} /></View>;
}

/** Two to four side-by-side tabs inside a screen (Overview / People / Deals, Board / List). */
export function Segments<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={st.segments} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[st.segment, on && st.segmentOn]}>
            <Text style={[st.segmentText, on && st.segmentTextOn]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** ₹4,20,000 the Indian way, without leaning on the phone's Intl support. */
export function rupees(n: number) {
  const whole = Math.round(n).toString();
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹${rest ? `${rest},${last3}` : last3}`;
}
/** ₹4.2 L / ₹1.05 Cr for totals in small spaces. */
export function rupeesShort(n: number) {
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)} L`;
  return rupees(n);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function dayLabel(iso: string) {
  const d = new Date(iso);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - start.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== start.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}
export function timeLabel(iso: string) {
  const d = new Date(iso);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
export const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

/** Loads a screen's data, with pull to refresh and a plain error line. */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const reload = useCallback(async () => {
    setRefreshing(true);
    try { setData(await load()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'This could not be loaded. Pull down to try again.'); }
    finally { setRefreshing(false); }
  }, [load]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => onCrmChange(() => { load().then(setData, () => undefined); }), [load]);
  return { data, error, refreshing, reload };
}

/**
 * A CRM screen: an optional header that stays on top while the list scrolls (search, chips), pull to refresh,
 * the sample-data note, and the toast area at the bottom.
 */
export function Screen({ children, refreshing, onRefresh, header }: { children: React.ReactNode; refreshing: boolean; onRefresh: () => void; header?: React.ReactNode }) {
  return (
    <View style={st.page}>
      {header ? <View style={st.stickyHead}>{header}</View> : null}
      <ScrollView style={st.page} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}>
        {CRM_IS_SAMPLE ? <SampleNote /> : null}
        {children}
      </ScrollView>
      <ToastHost />
    </View>
  );
}

/** Grey placeholder cards in the shape of the list, while it loads. Still, not shimmering. */
export function Loading({ rows = 5, hero = false }: { rows?: number; hero?: boolean }) {
  return (
    <View style={[st.page, st.scroll]} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {hero ? <View style={[st.skeleton, { height: 120, marginBottom: 12, borderRadius: radius.card }]} /> : <View style={[st.skeleton, { height: 48, marginBottom: 12 }]} />}
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={[st.row, { gap: 12 }]}>
          <View style={[st.skeleton, { width: 40, height: 40, borderRadius: 20 }]} />
          <View style={{ flex: 1, gap: 8 }}>
            <View style={[st.skeleton, { width: '70%', height: 14 }]} />
            <View style={[st.skeleton, { width: '45%', height: 12 }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ---- toasts: "Lead updated · Undo" at the bottom of the screen -------------------------------------------------
type ToastMessage = { id: number; text: string; tone: 'ok' | 'error'; action?: { label: string; run: () => unknown } };
const toastListeners = new Set<(t: ToastMessage) => void>();
let toastId = 0;
/** Shows a short message at the bottom of the screen for five seconds, with one optional button (Undo, Open). */
export function toast(text: string, options: { tone?: 'ok' | 'error'; action?: ToastMessage['action'] } = {}) {
  const message = { id: ++toastId, text, tone: options.tone ?? 'ok', action: options.action };
  toastListeners.forEach((l) => l(message));
}
export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : 'Not saved. Check your connection and try again.', { tone: 'error' });

function ToastHost() {
  const [message, setMessage] = useState<ToastMessage | null>(null);
  useEffect(() => {
    const show = (t: ToastMessage) => setMessage(t);
    toastListeners.add(show);
    return () => { toastListeners.delete(show); };
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage((m) => (m?.id === message.id ? null : m)), message.action ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [message]);
  if (!message) return null;
  return (
    <View style={st.toastWrap} pointerEvents="box-none">
      <View style={[st.toast, message.tone === 'error' && st.toastError]} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Icon name={message.tone === 'error' ? 'flag' : 'check'} color={C.onNavyMuted} size={18} />
        <Text style={st.toastText}>{message.text}</Text>
        {message.action ? (
          <Pressable onPress={() => { setMessage(null); void message.action!.run(); }} accessibilityRole="button" accessibilityLabel={message.action.label} hitSlop={10} style={st.toastButton}>
            <Text style={st.toastAction}>{message.action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** 11:00 tomorrow (or in a few days), the time a snoozed follow-up moves to. */
export function laterAt(days = 1) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(11, 0, 0, 0);
  return d.toISOString();
}

/** Tick a follow-up off, with Undo in the toast. */
export async function completeFollowUp(token: string, a: FollowUp, after?: () => void) {
  try {
    await markDone(token, a.id);
    after?.();
    toast('Marked done', { action: { label: 'Undo', run: async () => { await markDone(token, a.id, false); after?.(); } } });
  } catch (e) { toastError(e); }
}
/** Move a follow-up to tomorrow morning, with Undo in the toast. */
export async function snoozeFollowUp(token: string, a: FollowUp, after?: () => void) {
  try {
    const res = await setDue(token, a.id, laterAt(1));
    after?.();
    toast('Moved to tomorrow, 11:00 am', { action: { label: 'Undo', run: async () => { if (res.before) await setDue(token, a.id, res.before); after?.(); } } });
  } catch (e) { toastError(e); }
}

/** The one open follow-up that comes next on a lead or deal, with Done and Tomorrow, or a nudge to set one. */
export function NextStep({ token, activities, onChanged }: { token: string; activities: FollowUp[]; onChanged?: () => void }) {
  const next = activities.filter((a) => !a.done && a.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  if (!next) {
    return (
      <View style={[st.next, st.nextEmpty]}>
        <Text style={st.nextKicker}>Next step</Text>
        <Text style={st.muted}>Nothing planned yet. Set a follow-up below so it isn't forgotten.</Text>
      </View>
    );
  }
  const late = new Date(next.dueAt!) < new Date(new Date().setHours(0, 0, 0, 0));
  return (
    <View style={st.next} accessible={false}>
      <View style={st.rowTop}>
        <Text style={st.nextKicker}>Next step</Text>
        <Text style={[st.nextWhen, late && { color: C.red }]}>{late ? 'Overdue · ' : ''}{dayLabel(next.dueAt!)}, {timeLabel(next.dueAt!)}</Text>
      </View>
      <View style={[st.rowTop, { justifyContent: 'flex-start', gap: 10, marginTop: 8 }]}>
        <View style={st.actIcon}><Icon name={ACTIVITY[next.type].icon} color={C.blue} size={16} /></View>
        <Text style={[st.actTitle, { flex: 1 }]}>{next.subject}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Button label="Done" onPress={() => void completeFollowUp(token, next, onChanged)} style={{ flex: 1, minHeight: 44 }} />
        <Button kind="secondary" label="Tomorrow" onPress={() => void snoozeFollowUp(token, next, onChanged)} style={{ flex: 1, minHeight: 44 }} />
      </View>
    </View>
  );
}

/** Says plainly that these screens show sample records, until they read Orbit's own. */
export function SampleNote() {
  return (
    <View style={st.sample} accessibilityRole="text">
      <View style={st.sampleDot} />
      <Text style={st.sampleText}>Sample data. Changes here are not saved to Orbit yet.</Text>
    </View>
  );
}

export function Pill({ label, tone }: { label: string; tone: keyof typeof badge }) {
  return <View style={[st.pill, { backgroundColor: badge[tone].bg }]} accessible accessibilityLabel={label}><Text style={[st.pillText, { color: badge[tone].fg }]}>{label}</Text></View>;
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={st.search}>
      <Icon name="search" color={C.muted} size={18} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} style={st.searchInput}
        accessibilityLabel={placeholder} returnKeyType="search" autoCorrect={false} clearButtonMode="while-editing" />
    </View>
  );
}

/** A row of choice chips (lead status filter, pipeline stages). Scrolls sideways when it doesn't fit. */
export function Chips<K extends string>({ options, value, onChange, edge = 16 }: { options: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void; edge?: number }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[st.chips, { paddingHorizontal: edge }]} style={[st.chipsWrap, { marginHorizontal: -edge }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            style={[st.chip, on && st.chipOn]} hitSlop={4}>
            <Text style={[st.chipText, on && st.chipTextOn]}>{o.label}{o.count != null ? `  ${o.count}` : ''}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** A tappable card in a list. */
export function Row({ onPress, children, style, label, icon }: { onPress?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle>; label?: string; icon?: string }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label} accessibilityHint={onPress ? 'Opens the details' : undefined}
      style={({ pressed }) => [st.row, icon ? { alignItems: 'flex-start' } : null, pressed && st.rowPressed, style]}>
      {icon ? <RoundIcon name={icon} /> : null}
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {onPress ? <Icon name="chevron" color={C.muted} size={16} /> : null}
    </Pressable>
  );
}

export function Section({ title, count, children, action }: { title: string; count?: number; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <View style={st.section}>
      <View style={st.sectionHead}>
        <Text style={st.sectionTitle} accessibilityRole="header">{title}{count != null ? <Text style={st.sectionCount}>  {count}</Text> : null}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export const Empty = ({ text }: { text: string }) => <View style={st.empty}><Text style={st.muted}>{text}</Text></View>;

/** The navy band at the top of a lead, deal or institution: name, a line under it, and pills. */
export function Hero({ kicker, title, line, children }: { kicker?: string; title: string; line?: string | null; children?: React.ReactNode }) {
  return (
    <View style={st.hero}>
      <View style={st.heroBar} />
      {kicker ? <Text style={st.heroKicker}>{kicker}</Text> : null}
      <Text style={st.heroTitle} accessibilityRole="header">{title}</Text>
      {line ? <Text style={st.heroLine}>{line}</Text> : null}
      {children ? <View style={st.heroPills}>{children}</View> : null}
    </View>
  );
}

/** Call, WhatsApp and email buttons for whoever the record is about. Only the ways we have show. */
export function Reach({ phone, email }: { phone?: string | null; email?: string | null }) {
  const digits = phone?.replace(/[^\d]/g, '') ?? '';
  const ways = [
    phone ? { label: 'Call', icon: 'phone', url: `tel:${phone.replace(/\s/g, '')}` } : null,
    digits ? { label: 'WhatsApp', icon: 'chat', url: `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}` } : null,
    email ? { label: 'Email', icon: 'send', url: `mailto:${email}` } : null,
  ].filter((w): w is { label: string; icon: string; url: string } => w !== null);
  if (ways.length === 0) return null;
  return (
    <View style={st.reach}>
      {ways.map((w) => (
        <Pressable key={w.label} onPress={() => void Linking.openURL(w.url)} accessibilityRole="button" accessibilityLabel={w.label}
          style={({ pressed }) => [st.reachButton, pressed && st.rowPressed]}>
          <Icon name={w.icon} color={C.blue} size={18} />
          <Text style={st.reachText}>{w.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Label and value lines inside a card. Empty values are left out. */
export function Facts({ rows }: { rows: [string, string | number | null | undefined][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  return (
    <View style={st.facts}>
      {shown.map(([k, v], i) => (
        <View key={k} style={[st.fact, i > 0 && st.factLine]}>
          <Text style={st.factKey}>{k}</Text>
          <Text style={st.factValue}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

/** One follow-up or logged activity: what, when, about what. Overdue ones say so in red. */
export function ActivityLine({ a, onPress, onDone, onSnooze, showAbout = true }: { a: FollowUp; onPress?: () => void; onDone?: () => void; onSnooze?: () => void; showAbout?: boolean }) {
  const late = !a.done && a.dueAt && new Date(a.dueAt) < new Date(new Date().setHours(0, 0, 0, 0));
  const about = [a.lead?.name, a.organization?.name, a.deal?.title].filter(Boolean).join(' · ');
  return (
    <View style={st.act}>
      <View style={[st.actIcon, a.done && { backgroundColor: C.grey }]}><Icon name={ACTIVITY[a.type].icon} color={a.done ? C.muted : C.blue} size={16} /></View>
      <Pressable style={{ flex: 1, minWidth: 0 }} onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityHint={onPress ? 'Opens what it is about' : undefined}>
        <Text style={[st.actTitle, a.done && st.actDone]}>{a.subject}</Text>
        {showAbout && about ? <Text style={st.muted} numberOfLines={1}>{about}</Text> : null}
        <Text style={[st.actWhen, late ? { color: C.red } : null]}>
          {ACTIVITY[a.type].label}
          {a.dueAt ? ` · ${late ? 'Overdue, ' : ''}${dayLabel(a.dueAt)}, ${timeLabel(a.dueAt)}` : ''}
          {a.done ? ' · Done' : ''}
          {a.assignee ? ` · ${a.assignee.name}` : ''}
        </Text>
      </Pressable>
      {onSnooze && !a.done ? (
        <Pressable onPress={onSnooze} accessibilityRole="button" accessibilityLabel={`Move "${a.subject}" to tomorrow`} hitSlop={6} style={({ pressed }) => [st.snoozeButton, pressed && st.rowPressed]}>
          <Icon name="clock" color={C.muted} size={18} />
        </Pressable>
      ) : null}
      {onDone && !a.done ? (
        <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel={`Mark "${a.subject}" done`} hitSlop={6} style={({ pressed }) => [st.doneButton, pressed && { opacity: 0.7 }]}>
          <Icon name="check" color={C.green} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The search text, settled for a moment so a list isn't fetched on every key. */
export function useSettled(value: string, ms = 250) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const t = setTimeout(() => setSettled(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return settled;
}

const WHEN = [
  { key: 'none', label: 'Done now' },
  { key: 'today', label: 'Later today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'Next week' },
] as const;
type When = (typeof WHEN)[number]['key'];
function dueFor(when: When): string | null {
  if (when === 'none') return null;
  const d = new Date();
  if (when === 'today') { d.setHours(Math.min(d.getHours() + 2, 18), 0, 0, 0); return d.toISOString(); }
  d.setDate(d.getDate() + (when === 'tomorrow' ? 1 : 7));
  d.setHours(11, 0, 0, 0);
  return d.toISOString();
}

/** Log a call, visit, meeting or note on a lead or deal, or set it as a follow-up for later. */
export function LogForm({ token, on, onSaved }: { token: string; on: { leadId?: string; dealId?: string }; onSaved?: () => void }) {
  const [type, setType] = useState<ActivityType>('CALL');
  const [when, setWhen] = useState<When>('none');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    if (!subject.trim()) { setError('Say in a few words what happened or what to do.'); return; }
    setBusy(true); setError('');
    try {
      const res = await logActivity(token, on, { type, subject, dueAt: dueFor(when) });
      setSubject(''); setWhen('none');
      toast(res.ok);
      onSaved?.();
    } catch (e) { setError(e instanceof Error ? e.message : 'Not saved. Try again.'); }
    finally { setBusy(false); }
  }
  return (
    <View style={st.form} accessibilityLabel="Log a call or set a follow-up">
      <Chips options={(['CALL', 'VISIT', 'MEETING', 'NOTE'] as const).map((k) => ({ key: k, label: ACTIVITY[k].label }))} value={type as 'CALL'} onChange={setType} edge={14} />
      <TextInput value={subject} onChangeText={(v) => { setSubject(v); if (error) setError(''); }} placeholder={type === 'NOTE' ? 'Note' : 'What happened, or what to do'}
        placeholderTextColor={C.muted} style={st.input} accessibilityLabel="What happened" multiline />
      <Text style={st.formLabel}>Follow up</Text>
      <Chips options={WHEN.map((w) => ({ key: w.key, label: w.label }))} value={when} onChange={setWhen} edge={14} />
      {error ? <Text style={st.error}>{error}</Text> : null}
      <Button label={when === 'none' ? 'Save' : 'Set follow-up'} onPress={save} busy={busy} />
    </View>
  );
}

export const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.page },
  scroll: { padding: 16, paddingBottom: 88 },
  muted: { color: C.muted, fontSize: 13, marginTop: 2 },
  ink: { color: C.ink, fontSize: 15, fontWeight: '700' },
  error: { color: C.red, fontSize: 14, marginBottom: 10 },
  sample: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: radius.button, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  sampleDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.orange },
  sampleText: { flex: 1, color: C.muted, fontSize: 12, fontWeight: '600' },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, backgroundColor: C.card, borderRadius: radius.button, borderWidth: 1, borderColor: C.line, marginBottom: 12 },
  searchInput: { flex: 1, color: C.ink, fontSize: 16, minHeight: 46, paddingVertical: 10 },
  chipsWrap: { flexGrow: 0, marginBottom: 12 },
  chips: { gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, justifyContent: 'center' },
  chipOn: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { color: C.ink, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: radius.card, borderWidth: 1, borderColor: C.line, padding: 14, marginBottom: 8 },
  rowPressed: { backgroundColor: C.grey },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  section: { marginBottom: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { color: C.ink, fontSize: 15, fontWeight: '700' },
  sectionCount: { color: C.muted, fontWeight: '600' },
  empty: { backgroundColor: C.card, borderRadius: radius.card, borderWidth: 1, borderColor: C.line, padding: 16, alignItems: 'center' },
  hero: { backgroundColor: C.navy, borderRadius: radius.card, padding: 18, paddingLeft: 20, overflow: 'hidden', marginBottom: 12 },
  heroBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.orange },
  heroKicker: { color: C.onNavyMuted, fontSize: 13, fontWeight: '600' },
  heroTitle: { color: '#fff', fontSize: 21, fontWeight: '800', marginTop: 3 },
  heroLine: { color: C.onNavyMuted, fontSize: 14, marginTop: 4 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  reach: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  reachButton: { flex: 1, minHeight: 48, borderRadius: radius.button, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 2 },
  reachText: { color: C.blue, fontSize: 12, fontWeight: '700' },
  facts: { backgroundColor: C.card, borderRadius: radius.card, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14, marginBottom: 14 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11 },
  factLine: { borderTopWidth: 1, borderTopColor: C.line },
  factKey: { color: C.muted, fontSize: 14 },
  factValue: { color: C.ink, fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  act: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: C.card, borderRadius: radius.card, borderWidth: 1, borderColor: C.line, padding: 12, marginBottom: 8 },
  actIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  actTitle: { color: C.ink, fontSize: 15, fontWeight: '600' },
  actDone: { color: C.muted, textDecorationLine: 'line-through' },
  actWhen: { color: C.muted, fontSize: 12, marginTop: 3 },
  doneButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.greenSoft },
  link: { color: C.blue, fontSize: 14, fontWeight: '600' },
  roundIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', backgroundColor: C.grey, borderRadius: radius.button, padding: 4, marginBottom: 14 },
  segment: { flex: 1, minHeight: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentOn: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  segmentText: { color: C.muted, fontSize: 13, fontWeight: '600' },
  segmentTextOn: { color: C.blue, fontWeight: '700' },
  stickyHead: { paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.page, borderBottomWidth: 1, borderBottomColor: C.line },
  skeleton: { backgroundColor: C.line, borderRadius: 6 },
  toastWrap: { position: 'absolute', left: 12, right: 12, bottom: 16, alignItems: 'center' },
  toast: { width: '100%', maxWidth: 480, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.navy, borderRadius: radius.button, paddingLeft: 14, paddingRight: 6, minHeight: 50 },
  toastError: { backgroundColor: C.red },
  toastText: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600', paddingVertical: 12 },
  toastButton: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 8 },
  toastAction: { color: '#fff', fontSize: 14, fontWeight: '800', textDecorationLine: 'underline' },
  next: { backgroundColor: C.card, borderRadius: radius.card, borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: C.blue, padding: 14, marginBottom: 14 },
  nextEmpty: { borderLeftColor: C.line },
  nextKicker: { color: C.blue, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  nextWhen: { color: C.muted, fontSize: 13, fontWeight: '600' },
  snoozeButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card },
  form: { backgroundColor: C.card, borderRadius: radius.card, borderWidth: 1, borderColor: C.line, padding: 14, paddingBottom: 14, marginBottom: 14, overflow: 'hidden' },
  formLabel: { color: C.ink, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: { minHeight: 48, borderWidth: 1, borderColor: C.line, borderRadius: radius.button, paddingHorizontal: 12, paddingVertical: 12, color: C.ink, fontSize: 15, marginBottom: 12, textAlignVertical: 'top' },
});
