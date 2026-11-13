import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { lastPart, type NativeProps } from '../../native';
import { Button } from '../../ui';
import { C, radius } from '../../theme';
import { getDeal, moveDeal, restoreDeal } from '../../crm/data';
import type { DealStage } from '../../crm/types';
import {
  ActivityLine, Empty, Facts, Hero, Loading, LogForm, NextStep, OPEN_STAGES, Pill, Reach, Screen, Section, STAGE, dayLabel, rupees, st, toast, toastError, useLoad,
} from '../../crm/parts';

/** One deal: value and school, where it stands in the pipeline, move it on, mark it won or lost, log calls. */
export function DealPage({ token, path, open, changed }: NativeProps) {
  const id = lastPart(path);
  const { data: deal, error, refreshing, reload } = useLoad(useCallback(() => getDeal(token, id), [token, id]));
  const [busy, setBusy] = useState<DealStage | null>(null);
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState('');

  async function move(stage: DealStage) {
    setBusy(stage);
    try {
      const res = await moveDeal(token, id, stage, reason);
      setLosing(false); setReason('');
      changed();
      const before = res.before;
      toast(res.ok, before ? { action: { label: 'Undo', run: async () => { await restoreDeal(token, id, before); changed(); } } } : {});
    } catch (e) { toastError(e); }
    finally { setBusy(null); }
  }

  if (!deal && !error) return <Loading hero rows={3} />;
  if (!deal) return <Screen refreshing={refreshing} onRefresh={reload}><Text style={st.error}>{error || 'This deal is not there any more.'}</Text></Screen>;
  const at = OPEN_STAGES.indexOf(deal.stage);
  const next = at >= 0 && at < OPEN_STAGES.length - 1 ? OPEN_STAGES[at + 1] : null;
  const closed = deal.stage === 'WON' || deal.stage === 'LOST';

  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <Hero kicker={deal.organization?.name ?? 'Deal'} title={deal.title} line={`${rupees(deal.value)}${deal.students ? ` · ${deal.students} students` : ''}`}>
        <Pill {...STAGE[deal.stage]} />
      </Hero>

      <View style={x.steps} accessibilityLabel={`Stage: ${STAGE[deal.stage].label}`}>
        {OPEN_STAGES.map((s, i) => {
          const done = deal.stage === 'WON' || (at >= 0 && i <= at);
          return (
            <View key={s} style={x.step}>
              <View style={[x.bar, done && { backgroundColor: deal.stage === 'WON' ? C.green : C.blue }, deal.stage === 'LOST' && { backgroundColor: C.line }]} />
              <Text style={[x.stepText, s === deal.stage && { color: C.ink, fontWeight: '700' }]}>{STAGE[s].label}</Text>
            </View>
          );
        })}
      </View>

      {closed ? (
        <View style={[st.form, { gap: 8 }]}>
          <Text style={st.ink}>{deal.stage === 'WON' ? 'Won' : 'Lost'}{deal.closedAt ? ` on ${dayLabel(deal.closedAt)}` : ''}</Text>
          {deal.lostReason ? <Text style={st.muted}>{deal.lostReason}</Text> : null}
          <Button kind="secondary" label="Reopen" busy={busy === 'NEGOTIATION'} onPress={() => move('NEGOTIATION')} />
        </View>
      ) : losing ? (
        <View style={st.form}>
          <Text style={st.formLabel}>Why was it lost?</Text>
          <TextInput value={reason} onChangeText={setReason} placeholder="Budget, chose someone else, timing…" placeholderTextColor={C.muted} style={st.input} accessibilityLabel="Why it was lost" />
          <View style={x.buttons}>
            <Button kind="secondary" label="Cancel" onPress={() => { setLosing(false); setReason(''); }} style={{ flex: 1 }} />
            <Button kind="danger" label="Mark lost" busy={busy === 'LOST'} onPress={() => move('LOST')} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <View style={[x.buttons, { marginBottom: 14 }]}>
          {next ? <Button label={`Move to ${STAGE[next].label}`} busy={busy === next} onPress={() => move(next)} style={{ flex: 1.4 }} /> : null}
          <Button kind={next ? 'secondary' : 'primary'} label="Won" busy={busy === 'WON'} onPress={() => move('WON')} style={{ flex: 1 }} />
          <Button kind="danger" label="Lost" onPress={() => setLosing(true)} style={{ flex: 1 }} />
        </View>
      )}

      {closed ? null : <NextStep token={token} activities={deal.activities} onChanged={changed} />}

      {deal.contact ? (
        <Section title={deal.contact.name}>
          <Reach phone={deal.contact.phone} />
        </Section>
      ) : null}

      <Facts rows={[
        ['Value', rupees(deal.value)],
        ['Programme', deal.program],
        ['Students', deal.students],
        ['Close by', deal.expectedClose && !closed ? dayLabel(deal.expectedClose) : null],
        ['Contact', deal.contact?.name],
        ['Owner', deal.owner?.name],
      ]} />

      {deal.organization ? (
        <Pressable onPress={() => open(`/crm/organizations/${deal.organization!.id}`, deal.organization!.name)} accessibilityRole="link" hitSlop={8} style={{ marginBottom: 14 }}>
          <Text style={st.link}>See {deal.organization.name}</Text>
        </Pressable>
      ) : null}

      <Section title="Log a call or set a follow-up">
        <LogForm token={token} on={{ dealId: id }} onSaved={changed} />
      </Section>

      <Section title="Activity" count={deal.activities.length}>
        {deal.activities.length === 0 ? <Empty text="Nothing logged yet." /> : deal.activities.map((a) => <ActivityLine key={a.id} a={a} showAbout={false} />)}
      </Section>

      <Pressable onPress={() => open(path, deal.title, { web: true })} accessibilityRole="link" hitSlop={8}>
        <Text style={st.link}>Open in Orbit for quotes, invoices and edits</Text>
      </Pressable>
    </Screen>
  );
}

const x = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  step: { flex: 1, gap: 6 },
  bar: { height: 6, borderRadius: radius.pill, backgroundColor: C.line },
  stepText: { color: C.muted, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 8 },
});
