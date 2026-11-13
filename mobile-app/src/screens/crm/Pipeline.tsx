import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeProps } from '../../native';
import { Button } from '../../ui';
import { badge, C, radius } from '../../theme';
import { listDeals } from '../../crm/data';
import type { Deal, DealStage } from '../../crm/types';
import { Chips, Empty, Segments, Loading, OPEN_STAGES, Pill, Row, Screen, Section, STAGE, STAGES, dayLabel, rupees, rupeesShort, st, useLoad } from '../../crm/parts';

type View_ = DealStage | 'OPEN';
const sum = (deals: Deal[]) => deals.reduce((t, d) => t + d.value, 0);

/** The deal pipeline by stage: open value at the top, a chip per stage, deals grouped under their stage. */
export function Pipeline({ token, open }: NativeProps) {
  const [show, setShow] = useState<View_>('OPEN');
  const [layout, setLayout] = useState<'board' | 'list'>('board');
  const { data, error, refreshing, reload } = useLoad(useCallback(() => listDeals(token), [token]));

  if (!data && !error) return <Loading hero />;
  const deals = data ?? [];
  const openDeals = deals.filter((d) => OPEN_STAGES.includes(d.stage));
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const wonThisMonth = deals.filter((d) => d.stage === 'WON' && d.closedAt && new Date(d.closedAt) >= monthStart);
  // "All open" leaves out stages with nothing in them; picking a stage shows it even when empty.
  const stages = show === 'OPEN' ? OPEN_STAGES.filter((s) => openDeals.some((d) => d.stage === s)) : [show];

  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <View style={st.hero}>
        <View style={st.heroBar} />
        <Text style={st.heroKicker}>Open pipeline</Text>
        <Text style={[st.heroTitle, { fontSize: 26 }]}>{rupees(sum(openDeals))}</Text>
        <Text style={st.heroLine}>
          {openDeals.length} open {openDeals.length === 1 ? 'deal' : 'deals'} · Won this month {rupeesShort(sum(wonThisMonth))}
        </Text>
      </View>

      <Segments options={[{ key: 'board' as const, label: 'Board' }, { key: 'list' as const, label: 'List' }]} value={layout} onChange={setLayout} />

      {layout === 'board' ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={x.boardWrap} contentContainerStyle={x.board} snapToInterval={COLUMN + 10} decelerationRate="fast">
          {OPEN_STAGES.map((stage) => {
            const here = deals.filter((d) => d.stage === stage);
            return (
              <View key={stage} style={[x.column, { backgroundColor: badge[STAGE[stage].tone].bg }]}>
                <Text style={[x.columnTitle, { color: badge[STAGE[stage].tone].fg }]}>{STAGE[stage].label} ({here.length})</Text>
                <Text style={[x.columnSum, { color: badge[STAGE[stage].tone].fg }]}>{rupeesShort(sum(here))}</Text>
                {here.length === 0 ? <Text style={x.columnEmpty}>No deals</Text> : here.map((d) => (
                  <Pressable key={d.id} onPress={() => open(`/crm/deals/${d.id}`, d.title)} accessibilityRole="button" accessibilityLabel={d.title}
                    style={({ pressed }) => [x.card, pressed && { backgroundColor: C.grey }]}>
                    <Text style={st.ink} numberOfLines={2}>{d.organization?.name ?? d.title}</Text>
                    <Text style={[st.muted, { marginTop: 1 }]} numberOfLines={1}>{d.title}</Text>
                    <Text style={x.value}>{rupees(d.value)}</Text>
                    {d.expectedClose ? <Text style={st.muted}>Close by {dayLabel(d.expectedClose)}</Text> : null}
                  </Pressable>
                ))}
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {layout === 'list' ? <>
      <Chips
        options={[
          { key: 'OPEN' as View_, label: 'All open', count: openDeals.length },
          ...STAGES.map((s) => ({ key: s as View_, label: STAGE[s].label, count: deals.filter((d) => d.stage === s).length })),
        ]}
        value={show}
        onChange={setShow}
      />
      {error ? <Text style={st.error}>{error}</Text> : null}

      {stages.length === 0 ? <Empty text="No open deals." /> : null}
      {stages.map((stage) => {
        const here = deals.filter((d) => d.stage === stage);
        return (
          <Section key={stage} title={STAGE[stage].label} count={here.length}
            action={here.length ? <Text style={[st.muted, { marginTop: 0, fontWeight: '700' }]}>{rupeesShort(sum(here))}</Text> : null}>
            {here.length === 0 ? <Empty text="No deals at this stage." /> : here.map((d) => (
              <Row key={d.id} onPress={() => open(`/crm/deals/${d.id}`, d.title)} label={d.title}>
                <View style={st.rowTop}>
                  <Text style={[st.ink, { flex: 1 }]} numberOfLines={1}>{d.title}</Text>
                  <Text style={[st.ink, { color: C.navy }]}>{rupees(d.value)}</Text>
                </View>
                {d.organization ? <Text style={st.muted} numberOfLines={1}>{d.organization.name}</Text> : null}
                <View style={[st.rowTop, { marginTop: 6 }]}>
                  <Text style={[st.muted, { flex: 1 }]} numberOfLines={1}>
                    {[d.closedAt ? `Closed ${dayLabel(d.closedAt)}` : d.expectedClose ? `Close by ${dayLabel(d.expectedClose)}` : null, d.owner?.name].filter(Boolean).join(' · ')}
                  </Text>
                  {show === 'OPEN' ? null : <Pill {...STAGE[d.stage]} />}
                </View>
              </Row>
            ))}
          </Section>
        );
      })}
      </> : null}
      <Button kind="secondary" label="Add a deal" onPress={() => open('/crm/deals/new', 'New deal', { web: true })} />
    </Screen>
  );
}

const COLUMN = 236;
const x = StyleSheet.create({
  boardWrap: { flexGrow: 0, marginHorizontal: -16, marginBottom: 14 },
  board: { gap: 10, paddingHorizontal: 16 },
  column: { width: COLUMN, borderRadius: radius.card, padding: 10, gap: 8 },
  columnTitle: { fontSize: 14, fontWeight: '700', paddingHorizontal: 4, paddingTop: 2 },
  columnSum: { fontSize: 12, fontWeight: '600', paddingHorizontal: 4, marginTop: -6, opacity: 0.85 },
  columnEmpty: { color: C.muted, fontSize: 13, paddingHorizontal: 4, paddingBottom: 6 },
  card: { backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.line, padding: 12 },
  value: { color: C.navy, fontSize: 17, fontWeight: '800', marginTop: 6 },
});
