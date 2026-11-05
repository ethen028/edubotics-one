import React, { useCallback, useState } from 'react';
import { Text } from 'react-native';
import type { NativeProps } from '../../native';
import { listInstitutions } from '../../crm/data';
import { Empty, Loading, ORG_TYPE, Row, Screen, SearchBox, st, useLoad, useSettled } from '../../crm/parts';

/** Institutions (schools, colleges, companies), native: find one by name, town or board, open it. */
export function Institutions({ token, open }: NativeProps) {
  const [find, setFind] = useState('');
  const q = useSettled(find);
  const { data, error, refreshing, reload } = useLoad(useCallback(() => listInstitutions(token, q), [token, q]));

  if (!data && !error) return <Loading />;
  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <SearchBox value={find} onChange={setFind} placeholder="Find a school or college" />
      {error ? <Text style={st.error}>{error}</Text> : null}
      {data && data.length === 0 ? <Empty text={q ? `Nothing matches "${q}".` : 'No institutions yet.'} /> : null}
      {data?.map((o) => (
        <Row key={o.id} onPress={() => open(`/crm/organizations/${o.id}`, o.name)} label={o.name}>
          <Text style={st.ink} numberOfLines={1}>{o.name}</Text>
          <Text style={st.muted} numberOfLines={1}>{[ORG_TYPE[o.type], o.board, o.city, o.district].filter(Boolean).join(' · ')}</Text>
          {o.owner ? <Text style={st.muted}>{o.owner.name}</Text> : null}
        </Row>
      ))}
    </Screen>
  );
}
