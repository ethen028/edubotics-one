import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, ApiError } from '../api';
import { Button, Card } from '../ui';
import { badge, C } from '../theme';
import type { NativeProps } from '../native';

type Item = {
  kind: string; id: string; who: string; lines: string[]; warning?: string; amount?: number;
  path: string; decideHere: boolean; rejectLabel: string; takesNote: boolean;
};
type Group = { kind: string; title: string; items: Item[] };
type Data = { total: number; groups: Group[] };

/** Approvals, native: everything waiting on this person, approve or reject in place. Rules: src/lib/decisions.ts. */
export function Approvals({ token, open, changed }: NativeProps) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try { setData(await api<Data>('/api/mobile/approvals', token)); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Approvals could not be loaded.'); }
    finally { setRefreshing(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const decided = () => { void load(); changed(); };

  if (!data && !error) return <View style={st.center}><ActivityIndicator color={C.blue} /></View>;
  return (
    <ScrollView style={st.page} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={C.blue} />}>
      {error ? <Text style={st.error}>{error}</Text> : null}
      {data && data.total === 0 && (
        <Card><Text style={st.title}>Nothing waiting</Text><Text style={st.muted}>You're all caught up.</Text></Card>
      )}
      {data?.groups.map((g) => (
        <View key={g.kind} style={{ marginBottom: 10 }}>
          <Text style={st.section}>{g.title} <Text style={st.count}>{g.items.length}</Text></Text>
          {g.items.map((item) => <ApprovalCard key={item.id} token={token} item={item} open={open} onDecided={decided} />)}
        </View>
      ))}
    </ScrollView>
  );
}

function ApprovalCard({ token, item, open, onDecided }: { token: string; item: Item; open: NativeProps['open']; onDecided: () => void }) {
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState(item.amount != null ? String(item.amount) : '');
  const [busy, setBusy] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [error, setError] = useState('');

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    setBusy(decision); setError('');
    try {
      const approvedAmount = item.amount != null && amount.trim() !== '' ? Number(amount) : null;
      if (approvedAmount != null && (!Number.isFinite(approvedAmount) || approvedAmount < 0)) { setError('Enter the amount in rupees.'); return; }
      const res = await api<{ ok?: string }>('/api/mobile/approvals/decide', token, {
        method: 'POST',
        body: JSON.stringify({ kind: item.kind, id: item.id, decision, note: note.trim() || undefined, approvedAmount }),
      });
      Alert.alert(res.ok ?? 'Saved.');
      onDecided();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) { onDecided(); return; }
      setError(e instanceof Error ? e.message : 'Not saved. Try again.');
    } finally { setBusy(null); }
  }

  return (
    <Card style={st.card}>
      <Text style={st.title}>{item.who}</Text>
      {item.lines.map((l, i) => <Text key={i} style={i === 0 ? st.line : st.muted}>{l}</Text>)}
      {item.warning ? <View style={st.warn}><Text style={st.warnText}>{item.warning}</Text></View> : null}
      {item.decideHere ? <>
        {item.amount != null && <>
          <Text style={st.label}>Approve ₹ (up to {item.amount})</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={st.input} accessibilityLabel="Amount to approve" />
        </>}
        {item.takesNote && <TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={C.muted} style={[st.input, { marginTop: 10 }]} accessibilityLabel="Note" />}
        {error ? <Text style={st.error}>{error}</Text> : null}
        <View style={st.buttons}>
          <Button label="Approve" onPress={() => decide('APPROVED')} busy={busy === 'APPROVED'} style={{ flex: 1 }} />
          <Button label={item.rejectLabel} kind="danger" onPress={() => decide('REJECTED')} busy={busy === 'REJECTED'} style={{ flex: 1 }} />
        </View>
      </> : null}
      <Pressable onPress={() => open(item.path, item.who, { web: true })} accessibilityRole="link" hitSlop={8} style={st.openLink}>
        <Text style={st.openText}>{item.decideHere ? 'Open in Orbit' : 'Open in Orbit to decide'}</Text>
      </Pressable>
    </Card>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.page },
  scroll: { padding: 16, paddingBottom: 28 },
  section: { color: C.ink, fontSize: 16, fontWeight: '700', marginBottom: 10 },
  count: { color: C.muted, fontWeight: '600' },
  card: { marginBottom: 10 },
  title: { color: C.ink, fontSize: 15, fontWeight: '700' },
  line: { color: C.ink, fontSize: 14, marginTop: 4 },
  muted: { color: C.muted, fontSize: 14, marginTop: 3 },
  warn: { alignSelf: 'flex-start', backgroundColor: badge.amber.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, marginTop: 8 },
  warnText: { color: badge.amber.fg, fontSize: 12, fontWeight: '700' },
  label: { color: C.ink, fontSize: 13, fontWeight: '600', marginTop: 12, marginBottom: 6 },
  input: { height: 44, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, color: C.ink, fontSize: 15, backgroundColor: '#fff' },
  error: { color: C.red, fontSize: 14, marginTop: 8 },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 12 },
  openLink: { marginTop: 12, alignSelf: 'flex-start' },
  openText: { color: C.blue, fontSize: 14, fontWeight: '600' },
});
