import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import type { NativeProps } from '../../native';
import { listInstitutions } from '../../crm/data';
import type { OrgType } from '../../crm/types';
import { Chips, Empty, Loading, ORG_TYPE, orgIcon, Row, Screen, SearchBox, st, useLoad, useSettled } from '../../crm/parts';

const TYPES: { key: OrgType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' }, { key: 'SCHOOL', label: 'Schools' }, { key: 'COLLEGE', label: 'Colleges' }, { key: 'CORPORATE', label: 'Companies' }, { key: 'OTHER', label: 'Other' },
];

/** Institutions (schools, colleges, companies), native: find one by name, town or board, open it. */
export function Institutions({ token, open }: NativeProps) {
  const [find, setFind] = useState('');
  const [type, setType] = useState<OrgType | 'ALL'>('ALL');
  const q = useSettled(find);
  const { data, error, refreshing, reload } = useLoad(useCallback(() => listInstitutions(token, q, type), [token, q, type]));

  if (!data && !error) return <Loading />;
  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <SearchBox value={find} onChange={setFind} placeholder="Find a school or college" />
      <Chips options={TYPES} value={type} onChange={setType} />
      {error ? <Text style={st.error}>{error}</Text> : null}
      {data && data.length === 0 ? <Empty text={q ? `Nothing matches "${q}".` : 'Nothing here yet.'} /> : null}
      {data?.map((o) => (
        <Row key={o.id} onPress={() => open(`/crm/organizations/${o.id}`, o.name)} label={o.name} icon={orgIcon(o.type)}>
          <Text style={st.ink} numberOfLines={1}>{o.name}</Text>
          <Text style={st.muted} numberOfLines={1}>{[ORG_TYPE[o.type], o.board, o.city, o.district].filter(Boolean).join(' · ')}</Text>
          {o.owner ? <Text style={st.muted}>{o.owner.name}</Text> : null}
        </Row>
      ))}
    </Screen>
  );
}
