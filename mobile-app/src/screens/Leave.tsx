import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { api } from '../api';
import { Button, Card } from '../ui';
import { badge, C, radius } from '../theme';

type Balance = { leaveTypeId: string; code: string; name: string; quota: number; used: number; pending: number; remaining: number | null };
type Request = {
  id: string; type: string; code: string; startDate: string; endDate: string; halfDay: boolean; days: number; reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'; approver: string | null; decisionNote: string | null; canCancel: boolean;
};
type LeaveData = { year: number; today: string; balances: Balance[]; requests: Request[]; holidays: { date: string; name: string; optional: boolean }[] };

const STATUS: Record<Request['status'], { label: string; fg: string; bg: string }> = {
  PENDING: { label: 'Waiting', ...badge.amber },
  APPROVED: { label: 'Approved', ...badge.green },
  REJECTED: { label: 'Rejected', ...badge.red },
  CANCELLED: { label: 'Cancelled', ...badge.gray },
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
const nice = (v: string) => fromIso(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const range = (a: string, b: string) => (a === b ? nice(a) : `${nice(a)} to ${nice(b)}`);
const daysText = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** My leave, native: balances, asking for leave, cancelling, and the next holidays. Rules: src/lib/leave-requests.ts. */
export function Leave({ token }: { token: string }) {
  const [data, setData] = useState<LeaveData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setData(await api<LeaveData>('/api/mobile/leave', token)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Your leave could not be loaded.'); }
    finally { setRefreshing(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  function cancel(r: Request) {
    Alert.alert('Cancel this leave?', `${r.type}, ${range(r.startDate, r.endDate)}`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel leave', style: 'destructive', onPress: async () => {
        try { const res = await api<{ ok?: string }>(`/api/mobile/leave/${r.id}/cancel`, token, { method: 'POST', body: '{}' }); Alert.alert(res.ok ?? 'Leave cancelled.'); void load(); }
        catch (e) { Alert.alert('Not cancelled', e instanceof Error ? e.message : 'Try again.'); }
      } },
    ]);
  }

  if (!data && !error) return <View style={st.center}><ActivityIndicator color={C.blue} /></View>;
  return (
    <ScrollView style={st.page} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.blue} />}>
      {error ? <Text style={st.error}>{error}</Text> : null}
      {data && <>
        <Text style={st.section}>Balances for {data.year}</Text>
        <View style={st.grid}>
          {data.balances.map((b) => (
            <Card key={b.leaveTypeId} style={st.balance}>
              <Text style={st.balanceName} numberOfLines={1}>{b.name}</Text>
              <Text style={st.balanceBig}>{b.remaining === null ? 'No limit' : b.remaining}</Text>
              <Text style={st.muted}>{b.remaining === null ? `${b.used} used` : `left of ${b.quota}`}{b.pending ? `, ${b.pending} waiting` : ''}</Text>
            </Card>
          ))}
        </View>

        {asking
          ? <AskLeave token={token} balances={data.balances} today={data.today} onDone={(sent) => { setAsking(false); if (sent) void load(); }} />
          : <Button label="Ask for leave" onPress={() => setAsking(true)} style={{ marginBottom: 18 }} />}

        <Text style={st.section}>My requests</Text>
        {data.requests.length === 0 && <Card><Text style={st.muted}>No leave asked for yet.</Text></Card>}
        {data.requests.map((r) => (
          <Card key={r.id} style={st.request}>
            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={st.reqTitle}>{r.type}</Text>
                <Text style={st.muted}>{range(r.startDate, r.endDate)} · {r.halfDay ? 'Half day' : daysText(r.days)}</Text>
              </View>
              <View style={[st.pill, { backgroundColor: STATUS[r.status].bg }]}><Text style={[st.pillText, { color: STATUS[r.status].fg }]}>{STATUS[r.status].label}</Text></View>
            </View>
            <Text style={st.reason}>{r.reason}</Text>
            {r.decisionNote ? <Text style={st.muted}>Note: {r.decisionNote}</Text> : null}
            {r.status === 'PENDING' && r.approver ? <Text style={st.muted}>With {r.approver}</Text> : null}
            {r.canCancel && <Button kind="secondary" label="Cancel leave" onPress={() => cancel(r)} style={{ marginTop: 10, minHeight: 40 }} />}
          </Card>
        ))}

        {data.holidays.length > 0 && <>
          <Text style={[st.section, { marginTop: 10 }]}>Coming holidays</Text>
          <Card style={{ paddingVertical: 4 }}>
            {data.holidays.map((h, i) => (
              <View key={h.date + h.name} style={[st.holiday, i > 0 && st.line]}>
                <Text style={st.holidayDate}>{fromIso(h.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                <Text style={st.holidayName}>{h.name}{h.optional ? ' (optional)' : ''}</Text>
              </View>
            ))}
          </Card>
        </>}
      </>}
    </ScrollView>
  );
}

function AskLeave({ token, balances, today, onDone }: { token: string; balances: Balance[]; today: string; onDone: (sent: boolean) => void }) {
  const [typeId, setTypeId] = useState(balances[0]?.leaveTypeId ?? '');
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function picked(e: DateTimePickerEvent, d?: Date) {
    const which = picking;
    if (Platform.OS === 'android') setPicking(null);
    if (e.type !== 'set' || !d || !which) return;
    const v = iso(d);
    if (which === 'start') { setStart(v); if (v > end) setEnd(v); } else setEnd(v);
  }

  async function send() {
    if (!typeId) { setError('Choose a leave type.'); return; }
    if (reason.trim().length < 3) { setError('Please add a short reason.'); return; }
    setBusy(true); setError('');
    try {
      const res = await api<{ ok?: string }>('/api/mobile/leave', token, { method: 'POST', body: JSON.stringify({ leaveTypeId: typeId, startDate: start, endDate: halfDay ? start : end, halfDay, reason: reason.trim() }) });
      Alert.alert('Leave asked for', res.ok ?? 'Your manager will see it in Approvals.');
      onDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Not sent. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <Card style={{ marginBottom: 18 }}>
      <Text style={st.reqTitle}>Ask for leave</Text>
      <Text style={st.label}>Type</Text>
      <View style={st.chips}>
        {balances.map((b) => (
          <Pressable key={b.leaveTypeId} onPress={() => setTypeId(b.leaveTypeId)} accessibilityRole="radio" accessibilityState={{ selected: typeId === b.leaveTypeId }}
            style={[st.chip, typeId === b.leaveTypeId && st.chipOn]}>
            <Text style={[st.chipText, typeId === b.leaveTypeId && { color: '#fff' }]}>{b.name}</Text>
          </Pressable>
        ))}
      </View>
      <View style={st.dates}>
        <View style={{ flex: 1 }}>
          <Text style={st.label}>From</Text>
          <Pressable onPress={() => setPicking('start')} style={st.dateBox} accessibilityRole="button" accessibilityLabel={`From ${nice(start)}`}><Text style={st.dateText}>{nice(start)}</Text></Pressable>
        </View>
        {!halfDay && <View style={{ flex: 1 }}>
          <Text style={st.label}>To</Text>
          <Pressable onPress={() => setPicking('end')} style={st.dateBox} accessibilityRole="button" accessibilityLabel={`To ${nice(end)}`}><Text style={st.dateText}>{nice(end)}</Text></Pressable>
        </View>}
      </View>
      {picking && (
        <DateTimePicker value={fromIso(picking === 'start' ? start : end)} mode="date" minimumDate={picking === 'end' ? fromIso(start) : undefined}
          display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={picked} />
      )}
      {Platform.OS === 'ios' && picking && <Button kind="secondary" label="Done" onPress={() => setPicking(null)} style={{ marginTop: 8 }} />}
      <View style={st.switchRow}>
        <Text style={st.switchText}>Half day</Text>
        <Switch value={halfDay} onValueChange={setHalfDay} trackColor={{ true: C.blue, false: C.line }} thumbColor="#fff" />
      </View>
      <Text style={st.label}>Reason</Text>
      <TextInput value={reason} onChangeText={setReason} multiline style={[st.input, { minHeight: 80 }]} accessibilityLabel="Reason" textAlignVertical="top" />
      {error ? <Text style={st.error}>{error}</Text> : null}
      <Button label="Send request" onPress={send} busy={busy} style={{ marginTop: 14 }} />
      <Button kind="secondary" label="Back" onPress={() => onDone(false)} style={{ marginTop: 8 }} />
    </Card>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.page },
  scroll: { padding: 16, paddingBottom: 28 },
  section: { color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  balance: { width: '47%', flexGrow: 1, padding: 14 },
  balanceName: { color: C.muted, fontSize: 13, fontWeight: '600' },
  balanceBig: { color: C.navy, fontSize: 26, fontWeight: '800', marginTop: 4 },
  muted: { color: C.muted, fontSize: 13, marginTop: 2 },
  error: { color: C.red, fontSize: 14, marginVertical: 8 },
  request: { marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  reqTitle: { color: C.ink, fontSize: 15, fontWeight: '700' },
  reason: { color: C.ink, fontSize: 14, marginTop: 8 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '700' },
  holiday: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  line: { borderTopWidth: 1, borderTopColor: C.line },
  holidayDate: { width: 100, color: C.muted, fontSize: 14 },
  holidayName: { flex: 1, color: C.ink, fontSize: 14 },
  label: { color: C.ink, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipOn: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { color: C.ink, fontSize: 14 },
  dates: { flexDirection: 'row', gap: 10 },
  dateBox: { height: 46, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: '#fff' },
  dateText: { color: C.ink, fontSize: 15 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  switchText: { color: C.ink, fontSize: 15 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 15, backgroundColor: '#fff' },
});
