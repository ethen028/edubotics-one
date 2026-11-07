import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { Button, Card } from '../ui';
import { badge, C, radius } from '../theme';
import type { NativeProps } from '../native';

type Status = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
type Task = {
  id: string; title: string; project: string; onHold: boolean; status: Status; priority: 'HIGH' | 'MEDIUM' | 'LOW'; progress: number;
  dueDate: string | null; blocked: string | null; waitingOn: string | null; checklist: { done: number; total: number }; path: string;
};
type WorkData = { open: number; groups: { title: string; tasks: Task[] }[]; recentlyDone: { id: string; title: string; project: string }[] };

const STATUSES: { value: Status; label: string }[] = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'REVIEW', label: 'Review' },
  { value: 'DONE', label: 'Done' },
];
const PRIORITY = { HIGH: { label: 'High', ...badge.red }, MEDIUM: { label: 'Medium', ...badge.amber }, LOW: { label: 'Low', ...badge.gray } };
const nice = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };

/** My work, native: tasks assigned to me by when they are due, with their status. Rules: src/lib/my-work.ts. */
export function Work({ token, open, changed }: NativeProps) {
  const [data, setData] = useState<WorkData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setData(await api<WorkData>('/api/mobile/work', token)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Your tasks could not be loaded.'); }
    finally { setRefreshing(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function setStatus(t: Task, status: Status) {
    if (status === t.status) return;
    setSaving(t.id);
    try { await api(`/api/mobile/work/${t.id}/status`, token, { method: 'POST', body: JSON.stringify({ status }) }); changed(); await load(); }
    catch (e) { Alert.alert('Not saved', e instanceof Error ? e.message : 'Try again.'); }
    finally { setSaving(''); }
  }

  if (!data && !error) return <View style={st.center}><ActivityIndicator color={C.blue} /></View>;
  return (
    <ScrollView style={st.page} contentContainerStyle={st.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.blue} />}>
      {error ? <Text style={st.error}>{error}</Text> : null}
      <Button label="Log time" onPress={() => open('/timesheets', 'Timesheet')} style={{ marginBottom: 16 }} />
      {data && data.open === 0 && <Card><Text style={st.muted}>Nothing assigned to you right now.</Text></Card>}
      {data?.groups.map((g) => (
        <View key={g.title} style={{ marginBottom: 8 }}>
          <Text style={[st.section, g.title === 'Overdue' && { color: C.red }, g.title === 'Update requested' && { color: badge.amber.fg }]}>
            {g.title} <Text style={st.count}>{g.tasks.length}</Text>
          </Text>
          {g.tasks.map((t) => (
            <Card key={t.id} style={st.task}>
              <View style={st.row}>
                <Text style={st.title}>{t.title}</Text>
                <View style={[st.pill, { backgroundColor: PRIORITY[t.priority].bg }]}><Text style={[st.pillText, { color: PRIORITY[t.priority].fg }]}>{PRIORITY[t.priority].label}</Text></View>
              </View>
              <Text style={st.muted}>
                {t.project}{t.onHold ? ' (on hold)' : ''}{t.dueDate ? ` · due ${nice(t.dueDate)}` : ''}{t.checklist.total ? ` · ${t.checklist.done}/${t.checklist.total} checked` : ''}
              </Text>
              {t.blocked ? <Text style={st.warn}>Blocked: {t.blocked}</Text> : null}
              {t.waitingOn ? <Text style={st.warn}>Waiting on {t.waitingOn}</Text> : null}
              <View style={st.progressRow} accessibilityLabel={`${t.progress}% complete`}>
                <View style={st.bar}><View style={[st.fill, { width: `${t.progress}%` }]} /></View>
                <Text style={st.percent}>{t.progress}%</Text>
              </View>
              <View style={st.chips}>
                {STATUSES.map((s) => (
                  <Pressable key={s.value} onPress={() => setStatus(t, s.value)} disabled={saving === t.id} accessibilityRole="radio" accessibilityState={{ selected: t.status === s.value }}
                    style={[st.chip, t.status === s.value && st.chipOn]}>
                    <Text style={[st.chipText, t.status === s.value && { color: '#fff' }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable onPress={() => open(t.path, t.title, { web: true })} accessibilityRole="link" hitSlop={6}>
                <Text style={st.link}>Post update</Text>
              </Pressable>
            </Card>
          ))}
        </View>
      ))}
      {data && data.recentlyDone.length > 0 && <>
        <Text style={[st.section, { marginTop: 8 }]}>Done in the last 7 days</Text>
        <Card style={{ paddingVertical: 6 }}>
          {data.recentlyDone.map((t, i) => (
            <View key={t.id} style={[st.done, i > 0 && st.line]}>
              <Text style={st.doneTitle}>{t.title}</Text>
              <Text style={st.muted}>{t.project}</Text>
            </View>
          ))}
        </Card>
      </>}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.page },
  scroll: { padding: 16, paddingBottom: 28 },
  section: { color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  count: { color: C.muted, fontWeight: '600' },
  error: { color: C.red, fontSize: 14, marginVertical: 8 },
  task: { marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, color: C.ink, fontSize: 15, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 13, marginTop: 2 },
  warn: { color: badge.amber.fg, fontSize: 13, marginTop: 4 },
  pill: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '700' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: C.grey, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: C.blue },
  percent: { width: 38, textAlign: 'right', color: C.muted, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipOn: { backgroundColor: C.blue, borderColor: C.blue },
  chipText: { color: C.ink, fontSize: 13 },
  link: { color: C.blue, fontSize: 14, fontWeight: '700', marginTop: 12 },
  done: { paddingVertical: 8 },
  doneTitle: { color: C.ink, fontSize: 14 },
  line: { borderTopWidth: 1, borderTopColor: C.line },
});
