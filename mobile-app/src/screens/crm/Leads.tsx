import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeProps } from '../../native';
import { C, radius } from '../../theme';
import { Icon } from '../../Icon';
import { AddLeadSheet } from './AddLead';
import { countLeads, listLeads } from '../../crm/data';
import type { LeadStatus } from '../../crm/types';
import { ago, Chips, orgIcon, Empty, LEAD_STATUS, Loading, Pill, Row, Screen, SearchBox, SOURCE, st, useLoad, useSettled } from '../../crm/parts';

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
  const [adding, setAdding] = useState(false);

  const header = (
    <>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><SearchBox value={find} onChange={setFind} placeholder="Find a lead" /></View>
        <Pressable onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel="Add a lead"
          style={({ pressed }) => [{ width: 48, height: 48, borderRadius: radius.button, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.85 }]}>
          <Icon name="plus" color="#fff" size={22} />
        </Pressable>
      </View>
      <Chips options={FILTERS.map((f) => ({ ...f, count: counts?.[f.key] }))} value={filter} onChange={setFilter} />
    </>
  );
  const sheet = <AddLeadSheet token={token} visible={adding} onClose={() => setAdding(false)} onAdded={(id, title) => open(`/crm/leads/${id}`, title)} />;

  if (!data && !error) return <View style={{ flex: 1 }}><View style={st.stickyHead}>{header}</View><Loading /></View>;
  return (
    <Screen refreshing={refreshing} onRefresh={reload} header={header}>
      {sheet}
      {error ? <Text style={st.error}>{error}</Text> : null}
      {data && data.length === 0 ? <Empty text={q ? `No lead matches "${q}".` : 'No leads here.'} /> : null}
      {data?.map((l) => (
        <Row key={l.id} onPress={() => open(`/crm/leads/${l.id}`, l.organizationName ?? l.name)} label={l.organizationName ?? l.name} icon={orgIcon(l.orgType)}>
          <View style={st.rowTop}>
            <Text style={[st.ink, { flex: 1 }]} numberOfLines={1}>{l.organizationName ?? l.name}</Text>
            <Pill {...LEAD_STATUS[l.status]} />
          </View>
          {l.interest ? <Text style={[st.muted, { color: C.ink }]} numberOfLines={1}>{l.interest}</Text> : null}
          <Text style={st.muted} numberOfLines={2}>
            {[l.city, SOURCE[l.source], `came in ${ago(l.createdAt)}`, l.owner?.name].filter(Boolean).join(' · ')}
          </Text>
        </Row>
      ))}
      <Pressable onPress={() => open('/crm/leads/new', 'New lead', { web: true })} accessibilityRole="link" hitSlop={8} style={{ alignSelf: 'center', paddingVertical: 12 }}>
        <Text style={st.link}>Add a lead with every field in Orbit</Text>
      </Pressable>
    </Screen>
  );
}
