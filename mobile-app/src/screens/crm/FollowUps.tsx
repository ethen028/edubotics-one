import React, { useCallback } from 'react';
import { Alert, Text, View } from 'react-native';
import type { NativeProps } from '../../native';
import { listFollowUps, markDone } from '../../crm/data';
import type { FollowUp } from '../../crm/types';
import { ActivityLine, Empty, Loading, Screen, Section, st, useLoad } from '../../crm/parts';

/** Follow-ups due today, with anything overdue above them and the next few days below. Tick one off in place. */
export function FollowUps({ token, open, changed }: NativeProps) {
  const { data, error, refreshing, reload } = useLoad(useCallback(() => listFollowUps(token), [token]));

  async function done(a: FollowUp) {
    try { await markDone(token, a.id); changed(); }
    catch (e) { Alert.alert('Not saved', e instanceof Error ? e.message : 'Try again.'); }
  }
  const openAbout = (a: FollowUp) =>
    a.deal ? () => open(`/crm/deals/${a.deal!.id}`, a.deal!.title)
      : a.lead ? () => open(`/crm/leads/${a.lead!.id}`, a.lead!.name)
        : a.organization ? () => open(`/crm/organizations/${a.organization!.id}`, a.organization!.name)
          : undefined;
  const list = (items: FollowUp[]) => items.map((a) => <ActivityLine key={a.id} a={a} onPress={openAbout(a)} onDone={() => void done(a)} />);

  if (!data && !error) return <Loading />;
  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      {data ? (
        <View style={st.hero}>
          <View style={st.heroBar} />
          <Text style={st.heroKicker}>Due today</Text>
          <Text style={[st.heroTitle, { fontSize: 26 }]}>{data.today.length} {data.today.length === 1 ? 'follow-up' : 'follow-ups'}</Text>
          <Text style={st.heroLine}>{data.overdue.length ? `${data.overdue.length} overdue from before` : 'Nothing overdue'}</Text>
        </View>
      ) : null}
      {error ? <Text style={st.error}>{error}</Text> : null}
      {data?.overdue.length ? <Section title="Overdue" count={data.overdue.length}>{list(data.overdue)}</Section> : null}
      {data ? (
        <Section title="Today" count={data.today.length}>
          {data.today.length ? list(data.today) : <Empty text="Nothing due today." />}
        </Section>
      ) : null}
      {data?.later.length ? <Section title="Coming up" count={data.later.length}>{list(data.later)}</Section> : null}
    </Screen>
  );
}
