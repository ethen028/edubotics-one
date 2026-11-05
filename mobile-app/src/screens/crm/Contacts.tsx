import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeProps } from '../../native';
import { Icon } from '../../Icon';
import { C, radius } from '../../theme';
import { listContacts } from '../../crm/data';
import { Empty, Loading, Screen, SearchBox, st, useLoad, useSettled } from '../../crm/parts';

/** Contacts, native: the people at schools and colleges, with a one-tap call and WhatsApp on each. */
export function Contacts({ token, open }: NativeProps) {
  const [find, setFind] = useState('');
  const q = useSettled(find);
  const { data, error, refreshing, reload } = useLoad(useCallback(() => listContacts(token, q), [token, q]));

  if (!data && !error) return <Loading />;
  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <SearchBox value={find} onChange={setFind} placeholder="Find a person, school or number" />
      {error ? <Text style={st.error}>{error}</Text> : null}
      {data && data.length === 0 ? <Empty text={q ? `No one matches "${q}".` : 'No contacts yet.'} /> : null}
      {data?.map((c) => {
        const digits = c.phone?.replace(/[^\d]/g, '') ?? '';
        return (
          <View key={c.id} style={[st.row, { paddingVertical: 12 }]}>
            <View style={x.avatar}><Text style={x.avatarText}>{initials(c.name)}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.ink} numberOfLines={1}>{c.name}</Text>
              {c.designation ? <Text style={st.muted} numberOfLines={1}>{c.designation}</Text> : null}
              {c.organization ? (
                <Pressable onPress={() => open(`/crm/organizations/${c.organization!.id}`, c.organization!.name)} accessibilityRole="link" hitSlop={6}>
                  <Text style={[st.muted, { color: C.blue, fontWeight: '600' }]} numberOfLines={1}>{c.organization.name}</Text>
                </Pressable>
              ) : null}
            </View>
            {c.phone ? (
              <>
                <IconButton icon="chat" label={`WhatsApp ${c.name}`} onPress={() => void Linking.openURL(`https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`)} />
                <IconButton icon="phone" label={`Call ${c.name}`} onPress={() => void Linking.openURL(`tel:${c.phone!.replace(/\s/g, '')}`)} />
              </>
            ) : null}
          </View>
        );
      })}
    </Screen>
  );
}

const initials = (name: string) => name.replace(/^(Dr|Mr|Ms|Mrs|Sr|Prof)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

function IconButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={4} style={({ pressed }) => [x.icon, pressed && { backgroundColor: C.grey }]}>
      <Icon name={icon} color={C.blue} size={18} />
    </Pressable>
  );
}

const x = StyleSheet.create({
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.blue, fontWeight: '800', fontSize: 14 },
  icon: { width: 44, height: 44, borderRadius: radius.button, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
});
