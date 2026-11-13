import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { lastPart, type NativeProps } from '../../native';
import { C } from '../../theme';
import { getInstitution } from '../../crm/data';
import { ActivityLine, Empty, Facts, Hero, Loading, ORG_TYPE, Pill, Reach, Row, Screen, Section, Segments, STAGE, rupeesShort, st, useLoad } from '../../crm/parts';

/** One institution: call the office, its people, its deals and what has happened with it. */
export function InstitutionPage({ token, path, open }: NativeProps) {
  const id = lastPart(path);
  const { data: org, error, refreshing, reload } = useLoad(useCallback(() => getInstitution(token, id), [token, id]));
  const [tab, setTab] = useState<'overview' | 'people' | 'deals' | 'activity'>('overview');

  if (!org && !error) return <Loading hero rows={3} />;
  if (!org) return <Screen refreshing={refreshing} onRefresh={reload}><Text style={st.error}>{error || 'This institution is not there any more.'}</Text></Screen>;
  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <Hero kicker={ORG_TYPE[org.type]} title={org.name} line={[org.city, org.district].filter(Boolean).join(', ')}>
        {org.board ? <Pill label={org.board} tone="gray" /> : null}
      </Hero>
      <Segments value={tab} onChange={setTab} options={[
        { key: 'overview', label: 'Overview' },
        { key: 'people', label: `People (${org.contacts.length})` },
        { key: 'deals', label: `Deals (${org.deals.length})` },
        { key: 'activity', label: 'Activity' },
      ]} />

      {tab === 'overview' ? <>
        <Reach phone={org.phone} email={org.email} />
        <Facts rows={[['Board', org.board], ['Town', org.city], ['District', org.district], ['Phone', org.phone], ['Email', org.email], ['Owner', org.owner?.name]]} />
      </> : null}

      {tab === 'people' ? <Section title="People" count={org.contacts.length}>
        {org.contacts.length === 0 ? <Empty text="No contacts yet." /> : org.contacts.map((c) => (
          <View key={c.id} style={[st.form, { paddingBottom: 2 }]}>
            <Text style={st.ink}>{c.name}</Text>
            {c.designation ? <Text style={[st.muted, { marginBottom: 10 }]}>{c.designation}</Text> : null}
            <Reach phone={c.phone} email={c.email} />
          </View>
        ))}
      </Section> : null}

      {tab === 'deals' ? <Section title="Deals" count={org.deals.length}>
        {org.deals.length === 0 ? <Empty text="No deals yet." /> : org.deals.map((d) => (
          <Row key={d.id} onPress={() => open(`/crm/deals/${d.id}`, d.title)} label={d.title}>
            <View style={st.rowTop}>
              <Text style={[st.ink, { flex: 1 }]} numberOfLines={1}>{d.title}</Text>
              <Text style={[st.ink, { color: C.navy }]}>{rupeesShort(d.value)}</Text>
            </View>
            <View style={{ marginTop: 6 }}><Pill {...STAGE[d.stage]} /></View>
          </Row>
        ))}
      </Section> : null}

      {tab === 'activity' ? <Section title="Activity" count={org.activities.length}>
        {org.activities.length === 0 ? <Empty text="Nothing logged yet." /> : org.activities.map((a) => (
          <ActivityLine key={a.id} a={a} showAbout={false} onPress={a.deal ? () => open(`/crm/deals/${a.deal!.id}`, a.deal!.title) : undefined} />
        ))}
      </Section> : null}

      <Pressable onPress={() => open(path, org.name, { web: true })} accessibilityRole="link" hitSlop={8}>
        <Text style={st.link}>Open in Orbit for invoices, programmes and edits</Text>
      </Pressable>
    </Screen>
  );
}
