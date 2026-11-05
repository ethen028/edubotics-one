import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeProps } from '../../native';
import { Button } from '../../ui';
import { C } from '../../theme';
import { countLeads, listLeads } from '../../crm/data';
import type { LeadStatus } from '../../crm/types';
import { ago, Chips, orgIcon, Empty, LEAD_STATUS, Loading, ORG_TYPE, Pill, Row, Screen, SearchBox, SOURCE, st, useLoad, useSettled } from '../../crm/parts';

type Filter = LeadStatus | 'OPEN' | 'ALL';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'OPEN', label: 'Open' },
  { key: 'NEW', label: 'New' },
  { key: 'CONTACTED', label: 'Contacted' },
  { key: 'QUALIFIED', label: 'Qualified' },
  { key: 'ALL', label: 'All' },
];

/** Leads, native: find a lead by school, person, town or phone, filter by status, open one. */
export function Leads({ token, open }: NativeProps) {
  const [find, setFind] = useState('');
  const [filter, setFilter] = useState<Filter>('OPEN');
  const q = useSettled(find);
  const { data, error, refreshing, reload } = useLoad(useCallback(() => listLeads(token, q, filter), [token, q, filter]));
  const { data: counts } = useLoad(useCallback(() => countLeads(token), [token]));

  if (!data && !error) return <Loading />;
  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <SearchBox value={find} onChange={setFind} placeholder="Find a lead" />
      <Chips options={FILTERS.map((f) => ({ ...f, count: counts?.[f.key] }))} value={filter} onChange={setFilter} />
      {error ? <Text style={st.error}>{error}</Text> : null}
      {data && data.length === 0 ? <Empty text={q ? `No lead matches "${q}".` : 'No leads here.'} /> : null}
      {data?.map((l) => (
        <Row key={l.id} onPress={() => open(`/crm/leads/${l.id}`, l.organizationName ?? l.name)} label={l.organizationName ?? l.name} icon={orgIcon(l.orgType)}>
          <View style={st.rowTop}>
            <Text style={[st.ink, { flex: 1 }]} numberOfLines={1}>{l.organizationName ?? l.name}</Text>
            <Pill {...LEAD_STATUS[l.status]} />
          </View>
          {l.interest ? <Text style={[st.muted, { color: C.ink }]} numberOfLines={1}>{l.interest}</Text> : null}
          <Text style={st.muted} numberOfLines={1}>
            {[l.city, l.orgType ? ORG_TYPE[l.orgType] : null, SOURCE[l.source], ago(l.createdAt)].filter(Boolean).join(' · ')}
          </Text>
          {l.owner ? <Text style={st.muted}>{l.owner.name}</Text> : null}
        </Row>
      ))}
      <Button kind="secondary" label="Add a lead" onPress={() => open('/crm/leads/new', 'New lead', { web: true })} style={{ marginTop: 8 }} />
    </Screen>
  );
}
