import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { api } from '../api';
import { Button, Card } from '../ui';
import { badge, C, radius } from '../theme';
import type { NativeProps } from '../native';

type Entry = { id: string; date: string; hours: number; startTime: string | null; endTime: string | null; title: string | null; note: string | null; project: string | null; task: string | null };
type Week = {
  today: string; weekStart: string; sheetId: string | null; status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'; decisionNote: string | null; open: boolean;
  total: number; days: { date: string; hours: number }[]; entries: Entry[];
  tasks: { id: string; title: string; project: string; progress: number }[]; projects: { id: string; name: string }[];
};

const STATUS = {
  DRAFT: { label: 'Not sent', ...badge.gray },
  SUBMITTED: { label: 'With your manager', ...badge.amber },
  APPROVED: { label: 'Approved', ...badge.green },
  REJECTED: { label: 'Sent back', ...badge.red },
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromIso = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
const shift = (v: string, days: number) => { const d = fromIso(v); d.setDate(d.getDate() + days); return iso(d); };
const nice = (v: string) => fromIso(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const weekday = (v: string) => fromIso(v).toLocaleDateString('en-IN', { weekday: 'short' });
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const atTime = (v: string) => { const [h, m] = v.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const hoursText = (n: number) => `${n} h`;

/** Timesheet, native: a week's logged time, logging more, removing entries and sending the week. Rules: src/lib/timesheet-entries.ts. */
export function Timesheet({ token, open, changed }: NativeProps) {
  const [week, setWeek] = useState<string | null>(null);
  const [data, setData] = useState<Week | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setData(await api<Week>(`/api/mobile/timesheet${week ? `?week=${week}` : ''}`, token)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Your timesheet could not be loaded.'); }
    finally { setRefreshing(false); }
  }, [token, week]);
  useEffect(() => { void load(); }, [load]);

  function remove(e: Entry) {
    Alert.alert('Remove this entry?', `${hoursText(e.hours)} on ${nice(e.date)}`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api(`/api/mobile/timesheet/entries/${e.id}/delete`, token, { method: 'POST', body: '{}' }); void load(); }
        catch (err) { Alert.alert('Not removed', err instanceof Error ? err.message : 'Try again.'); }
      } },
    ]);
  }

  function submit() {
    if (!data?.sheetId) return;
    Alert.alert('Send this week?', `${hoursText(data.total)} for the week of ${nice(data.weekStart)}. You can't change it after sending unless your manager sends it back.`, [
      { text: 'Not yet', style: 'cancel' },
      { text: 'Send', onPress: async () => {
        setSending(true);
        try { const res = await api<{ ok?: string }>(`/api/mobile/timesheet/${data.sheetId}/submit`, token, { method: 'POST', body: '{}' }); Alert.alert(res.ok ?? 'Week sent.'); changed(); void load(); }
        catch (err) { Alert.alert('Not sent', err instanceof Error ? err.message : 'Try again.'); }
        finally { setSending(false); }
      } },
    ]);
  }

  if (!data && !error) return <View style={st.center}><ActivityIndicator color={C.blue} /></View>;
  const thisWeek = data ? data.weekStart <= data.today && data.today <= shift(data.weekStart, 6) : true;
  const future = data ? data.weekStart > data.today : false;
  return (
    <ScrollView style={st.page} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.blue} />}>
      {error ? <Text style={st.error}>{error}</Text> : null}
      {data && <>
        <View style={st.weekNav}>
          <Button kind="secondary" label="Previous" onPress={() => { setLogging(false); setWeek(shift(data.weekStart, -7)); }} style={st.navButton} />
          <Text style={st.weekText}>Week of {nice(data.weekStart)}</Text>
          <Button kind="secondary" label="Next" onPress={() => { setLogging(false); setWeek(shift(data.weekStart, 7)); }} style={st.navButton} />
        </View>
        {!thisWeek && <Pressable onPress={() => setWeek(null)} accessibilityRole="button"><Text style={[st.link, { textAlign: 'center', marginBottom: 12 }]}>Back to this week</Text></Pressable>}

        <Card style={{ marginBottom: 14 }}>
          <View style={st.row}>
            <Text style={st.big}>{data.total}</Text>
            <Text style={[st.muted, { flex: 1, marginTop: 10 }]}> hours this week</Text>
            <View style={[st.pill, { backgroundColor: STATUS[data.status].bg }]}><Text style={[st.pillText, { color: STATUS[data.status].fg }]}>{STATUS[data.status].label}</Text></View>
          </View>
          {data.status === 'REJECTED' && data.decisionNote ? <Text style={st.warn}>Your manager said: {data.decisionNote}</Text> : null}
          <View style={st.days}>
            {data.days.map((d) => (
              <View key={d.date} style={[st.day, d.date === data.today && st.today]}>
                <Text style={st.dayName}>{weekday(d.date)}</Text>
                <Text style={st.dayHours}>{d.hours || '·'}</Text>
              </View>
            ))}
          </View>
        </Card>

        {data.open && !future && (logging
          ? <LogTime token={token} week={data} onDone={(saved) => { setLogging(false); if (saved) { changed(); void load(); } }} />
          : <Button label="Log time" onPress={() => setLogging(true)} style={{ marginBottom: 16 }} />)}

        <Text style={st.section}>Entries</Text>
        {data.entries.length === 0 && <Card><Text style={st.muted}>Nothing logged this week yet.</Text></Card>}
        {data.entries.map((e) => (
          <Card key={e.id} style={st.entry}>
            <View style={st.row}>
              <View style={{ flex: 1 }}>
                <Text style={st.entryTitle}>{e.task ?? e.project ?? e.title ?? 'Other work'}</Text>
                <Text style={st.muted}>
                  {weekday(e.date)} {nice(e.date)}{e.startTime && e.endTime ? ` · ${e.startTime} to ${e.endTime}` : ''}{e.task && e.project ? ` · ${e.project}` : ''}
                </Text>
              </View>
              <Text style={st.hours}>{hoursText(e.hours)}</Text>
            </View>
            {(e.task || e.project) && e.title ? <Text style={st.note}>{e.title}</Text> : null}
            {e.note ? <Text style={st.note}>{e.note}</Text> : null}
            {data.open && <Pressable onPress={() => remove(e)} accessibilityRole="button" hitSlop={6}><Text style={st.remove}>Remove</Text></Pressable>}
          </Card>
        ))}

        {data.open && data.entries.length > 0 && <Button label="Send week to my manager" onPress={submit} busy={sending} style={{ marginTop: 8 }} />}
        <Pressable onPress={() => open(`/timesheets?week=${data.weekStart}`, 'Timesheet', { web: true })} accessibilityRole="link" hitSlop={6}>
          <Text style={[st.link, { marginTop: 16, textAlign: 'center' }]}>Edit entries or attach files in Orbit</Text>
        </Pressable>
      </>}
    </ScrollView>
  );
}

function LogTime({ token, week, onDone }: { token: string; week: Week; onDone: (saved: boolean) => void }) {
  const lastDay = shift(week.weekStart, 6) < week.today ? shift(week.weekStart, 6) : week.today;
  const [date, setDate] = useState(lastDay);
  const [target, setTarget] = useState('');
  const [byClock, setByClock] = useState(true);
  const [start, setStart] = useState('09:30');
  const [end, setEnd] = useState('13:00');
  const [hours, setHours] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [picking, setPicking] = useState<'date' | 'start' | 'end' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function picked(e: DateTimePickerEvent, d?: Date) {
    const which = picking;
    if (Platform.OS === 'android') setPicking(null);
    if (e.type !== 'set' || !d || !which) return;
    if (which === 'date') setDate(iso(d)); else if (which === 'start') setStart(hhmm(d)); else setEnd(hhmm(d));
  }

  async function save() {
    if (!target && !title.trim() && !note.trim()) { setError('Pick a task or project, or say what the time was for.'); return; }
    setBusy(true); setError('');
    const body = byClock
      ? { date, target, startTime: start, endTime: end, title: title.trim(), note: note.trim() }
      : { date, target, hours: hours.trim(), title: title.trim(), note: note.trim() };
    try {
      const res = await api<{ ok?: string }>('/api/mobile/timesheet', token, { method: 'POST', body: JSON.stringify(body) });
      Alert.alert(res.ok ?? 'Time logged.');
      onDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Not saved. Try again.'); }
    finally { setBusy(false); }
  }

  const options = [
    ...week.tasks.map((t) => ({ value: `task:${t.id}`, label: t.title, sub: t.project })),
    ...week.projects.map((p) => ({ value: `project:${p.id}`, label: p.name, sub: 'Project' })),
    { value: '', label: 'Other work', sub: 'Say what it was below' },
  ];

  return (
    <Card style={{ marginBottom: 18 }}>
      <Text style={st.entryTitle}>Log time</Text>
      <Text style={st.label}>Day</Text>
      <Pressable onPress={() => setPicking('date')} style={st.box} accessibilityRole="button" accessibilityLabel={`Day ${nice(date)}`}>
        <Text style={st.boxText}>{weekday(date)} {nice(date)}</Text>
      </Pressable>
      {picking === 'date' && (
        <DateTimePicker value={fromIso(date)} mode="date" minimumDate={fromIso(week.weekStart)} maximumDate={fromIso(lastDay)}
          display={Platform.OS === 'ios' ? 'inline' : 'default'} onChange={picked} />
      )}

      <Text style={st.label}>For</Text>
      <View style={{ gap: 6 }}>
        {options.map((o) => (
          <Pressable key={o.value || 'other'} onPress={() => setTarget(o.value)} accessibilityRole="radio" accessibilityState={{ selected: target === o.value }}
            style={[st.option, target === o.value && st.optionOn]}>
            <Text style={[st.optionText, target === o.value && { color: C.blue, fontWeight: '700' }]} numberOfLines={1}>{o.label}</Text>
            <Text style={st.optionSub} numberOfLines={1}>{o.sub}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[st.chips, { marginTop: 14 }]}>
        {[{ on: true, label: 'Start and end' }, { on: false, label: 'Just hours' }].map((m) => (
          <Pressable key={m.label} onPress={() => setByClock(m.on)} accessibilityRole="radio" accessibilityState={{ selected: byClock === m.on }} style={[st.chip, byClock === m.on && st.chipOn]}>
            <Text style={[st.chipText, byClock === m.on && { color: '#fff' }]}>{m.label}</Text>
          </Pressable>
        ))}
      </View>
      {byClock ? (
        <View style={st.pair}>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>Start</Text>
            <Pressable onPress={() => setPicking('start')} style={st.box} accessibilityRole="button" accessibilityLabel={`Start ${start}`}><Text style={st.boxText}>{start}</Text></Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.label}>End</Text>
            <Pressable onPress={() => setPicking('end')} style={st.box} accessibilityRole="button" accessibilityLabel={`End ${end}`}><Text style={st.boxText}>{end}</Text></Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={st.label}>Hours</Text>
          <TextInput value={hours} onChangeText={setHours} keyboardType="decimal-pad" placeholder="2.5" placeholderTextColor={C.muted} style={st.input} accessibilityLabel="Hours" />
        </>
      )}
      {(picking === 'start' || picking === 'end') && (
        <DateTimePicker value={atTime(picking === 'start' ? start : end)} mode="time" is24Hour minuteInterval={5}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={picked} />
      )}
      {Platform.OS === 'ios' && picking && <Button kind="secondary" label="Done" onPress={() => setPicking(null)} style={{ marginTop: 8 }} />}
      {byClock && <Text style={st.muted}>Lunch is taken off by itself, as on the web.</Text>}

      <Text style={st.label}>What you did</Text>
      <TextInput value={title} onChangeText={setTitle} style={st.input} accessibilityLabel="What you did" maxLength={200} />
      <Text style={st.label}>Note (optional)</Text>
      <TextInput value={note} onChangeText={setNote} multiline style={[st.input, { minHeight: 70 }]} textAlignVertical="top" accessibilityLabel="Note" />
      {error ? <Text style={st.error}>{error}</Text> : null}
      <Button label="Save" onPress={save} busy={busy} style={{ marginTop: 14 }} />
      <Button kind="secondary" label="Back" onPress={() => onDone(false)} style={{ marginTop: 8 }} />
    </Card>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.page },
  scroll: { padding: 16, paddingBottom: 28 },
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  navButton: { minHeight: 40, paddingHorizontal: 12 },
  weekText: { flex: 1, textAlign: 'center', color: C.ink, fontSize: 15, fontWeight: '700' },
  section: { color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  error: { color: C.red, fontSize: 14, marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  big: { color: C.navy, fontSize: 28, fontWeight: '800' },
  muted: { color: C.muted, fontSize: 13, marginTop: 2 },
  warn: { color: C.red, fontSize: 13, marginTop: 8 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  pillText: { fontSize: 12, fontWeight: '700' },
  days: { flexDirection: 'row', gap: 4, marginTop: 14 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 8, backgroundColor: C.grey },
  today: { backgroundColor: C.tint },
  dayName: { color: C.muted, fontSize: 11, fontWeight: '600' },
  dayHours: { color: C.ink, fontSize: 14, fontWeight: '700', marginTop: 2 },
  entry: { marginBottom: 10 },
  entryTitle: { color: C.ink, fontSize: 15, fontWeight: '700' },
  hours: { color: C.navy, fontSize: 15, fontWeight: '800' },
  note: { color: C.ink, fontSize: 14, marginTop: 6 },
  remove: { color: C.red, fontSize: 14, fontWeight: '600', marginTop: 10 },
  link: { color: C.blue, fontSize: 14, fontWeight: '700' },
  label: { color: C.ink, fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  box: { height: 46, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: '#fff' },
  boxText: { color: C.ink, fontSize: 15 },
  pair: { flexDirection: 'row', gap: 10 },
  option: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fff' },
  optionOn: { borderColor: C.blue, backgroundColor: C.tint },
  optionText: { color: C.ink, fontSize: 14 },
  optionSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipOn: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { color: C.ink, fontSize: 14 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: C.ink, fontSize: 15, backgroundColor: '#fff' },
});
