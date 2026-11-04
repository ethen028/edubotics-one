import React, { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type Dashboard, type Menu } from './api';
import { Icon } from './Icon';
import { Badge, Button, Card } from './ui';
import { C, radius } from './theme';

type Props = {
  token: string;
  dashboard: Dashboard | null;
  dashboardError: string;
  menu: Menu | null;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (path: string, title: string) => void;
};

/** Shortcuts on Home, shown only when the person's menu has the page. */
const SHORTCUTS = [
  { href: '/hr/leave', label: 'My leave', icon: 'palm' },
  { href: '/timesheets', label: 'Timesheet', icon: 'clock' },
  { href: '/expenses', label: 'Expenses', icon: 'receipt' },
  { href: '/payroll/my', label: 'My payslips', icon: 'payslip' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '/crm/activities', label: 'Follow-ups', icon: 'handshake' },
];

const time = (v?: string | null) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '–');
const dateLabel = (v: string) => new Date(`${v}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

export function Home({ token, dashboard, dashboardError, menu, refreshing, onRefresh, onOpen }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pages = new Set(menu?.groups.flatMap((g) => g.items.map((i) => i.href)) ?? []);
  const att = dashboard?.attendance;
  const open = att?.openSession ?? null;
  const worked = (att?.sessions ?? []).reduce((sum, x) => sum + ((x.checkOut ? new Date(x.checkOut).getTime() : Date.now()) - new Date(x.checkIn).getTime()), 0) / 36e5;
  const waiting = [
    { n: menu?.counts.approvals ?? 0, label: 'to approve', href: '/approvals', title: 'Approvals' },
    { n: menu?.counts.inbox ?? 0, label: 'unread in Inbox', href: '/inbox', title: 'Inbox' },
    { n: menu?.counts.messages ?? 0, label: 'unread messages', href: '/messages', title: 'Messages' },
  ].filter((w) => w.n > 0 && pages.has(w.href));

  async function attendance(action: 'check-in' | 'check-out') {
    setBusy(true); setError('');
    try {
      const result = await api<{ message: string }>('/api/mobile/attendance', token, { method: 'POST', body: JSON.stringify({ action }) });
      onRefresh();
      Alert.alert(action === 'check-in' ? 'Checked in' : 'Checked out', result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Attendance could not be saved. Try again.'); }
    finally { setBusy(false); }
  }

  const name = dashboard?.user.name.split(/\s+/)[0] ?? '';
  return (
    <ScrollView style={st.page} contentContainerStyle={st.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}>
      <View style={st.banner}>
        <View style={st.bannerBar} />
        <Text style={st.bannerSmall}>{menu?.company ?? 'Orbit'}</Text>
        <Text style={st.bannerName}>{greeting()}{name ? `, ${name}` : ''}</Text>
        {dashboard && <Text style={st.bannerDate}>{dateLabel(dashboard.date)}</Text>}
      </View>

      {dashboard ? (
        <Card style={st.block}>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>Today's attendance</Text>
              <Text style={st.muted}>{open ? `Checked in at ${time(open.checkIn)}` : att?.sessions.length ? 'Checked out' : 'Not checked in yet'}</Text>
            </View>
            <View style={[st.pill, open ? st.pillOn : st.pillOff]}>
              <Text style={[st.pillText, { color: open ? C.green : C.muted }]}>{open ? 'Working' : 'Off'}</Text>
            </View>
          </View>
          <Text style={st.hours}>{worked.toFixed(1)} <Text style={st.hoursUnit}>hours today</Text></Text>
          <Button label={open ? 'Check out' : 'Check in'} kind={open ? 'secondary' : 'primary'} busy={busy} onPress={() => attendance(open ? 'check-out' : 'check-in')} />
          {att && att.sessions.length > 0 && (
            <View style={st.sessions}>
              {att.sessions.map((x, i) => (
                <Text key={x.id} style={st.session}>Session {i + 1}: {time(x.checkIn)} to {x.checkOut ? time(x.checkOut) : 'now'}</Text>
              ))}
            </View>
          )}
          {error ? <Text style={st.error}>{error}</Text> : null}
        </Card>
      ) : dashboardError ? (
        <Card style={st.block}><Text style={st.muted}>{dashboardError}</Text></Card>
      ) : null}

      {waiting.length > 0 && (
        <Card style={st.block}>
          <Text style={st.cardTitle}>Waiting on you</Text>
          {waiting.map((w) => (
            <Pressable key={w.href} onPress={() => onOpen(w.href, w.title)} style={({ pressed }) => [st.waitRow, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <Text style={st.waitText}>{w.n} {w.label}</Text>
              <Icon name="chevron" color={C.muted} size={18} />
            </Pressable>
          ))}
        </Card>
      )}

      <Text style={st.section}>Shortcuts</Text>
      <View style={st.grid}>
        {SHORTCUTS.filter((x) => pages.has(x.href)).map((x) => (
          <Pressable key={x.href} onPress={() => onOpen(x.href, x.label)} style={({ pressed }) => [st.tile, pressed && { opacity: 0.7 }]} accessibilityRole="button">
            <View style={st.tileIcon}><Icon name={x.icon} color={C.blue} size={20} /></View>
            <Text style={st.tileLabel}>{x.label}</Text>
          </Pressable>
        ))}
      </View>
      {dashboard && dashboard.attendance.pendingLeave > 0 && (
        <View style={st.note}><Badge n={dashboard.attendance.pendingLeave} /><Text style={st.noteText}>leave request{dashboard.attendance.pendingLeave === 1 ? '' : 's'} waiting for a decision</Text></View>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  scroll: { padding: 16, paddingBottom: 28 },
  banner: { backgroundColor: C.navy, borderRadius: radius.card, padding: 18, overflow: 'hidden', marginBottom: 14 },
  bannerBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.orange },
  bannerSmall: { color: C.onNavyMuted, fontSize: 13, fontWeight: '600' },
  bannerName: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 4 },
  bannerDate: { color: C.onNavyMuted, fontSize: 14, marginTop: 4 },
  block: { marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { color: C.ink, fontSize: 16, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 14, marginTop: 4 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillOn: { backgroundColor: C.greenSoft },
  pillOff: { backgroundColor: C.grey },
  pillText: { fontSize: 12, fontWeight: '700' },
  hours: { color: C.navy, fontSize: 30, fontWeight: '800', marginTop: 12, marginBottom: 12 },
  hoursUnit: { color: C.muted, fontSize: 14, fontWeight: '600' },
  sessions: { marginTop: 12, gap: 4 },
  session: { color: C.muted, fontSize: 13 },
  error: { color: C.red, fontSize: 14, marginTop: 10 },
  waitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, borderTopWidth: 1, borderTopColor: C.line, marginTop: 8 },
  waitText: { color: C.ink, fontSize: 15, fontWeight: '600' },
  section: { color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 10, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '31%', flexGrow: 1, minHeight: 84, backgroundColor: C.card, borderRadius: radius.card, borderWidth: 1, borderColor: C.line, padding: 12, justifyContent: 'space-between' },
  tileIcon: { width: 34, height: 34, borderRadius: 9, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { color: C.ink, fontSize: 13, fontWeight: '600', marginTop: 8 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  noteText: { color: C.muted, fontSize: 14 },
});
