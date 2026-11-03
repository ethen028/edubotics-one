import React, { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Dashboard, Menu } from './api';
import { Icon } from './Icon';
import { Badge, Button, Card } from './ui';
import { C, radius } from './theme';

const ROLE: Record<string, string> = { ADMIN: 'Admin', HR: 'HR', MANAGER: 'Manager', EMPLOYEE: 'Employee' };
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

/** Every page of Orbit this person may open, grouped as in the web menu, with a search box and sign out. */
export function More({ dashboard, menu, menuError, refreshing, onRefresh, onOpen, onSignOut }: {
  dashboard: Dashboard | null; menu: Menu | null; menuError: string; refreshing: boolean;
  onRefresh: () => void; onOpen: (path: string, title: string) => void; onSignOut: () => void;
}) {
  const [find, setFind] = useState('');
  const q = find.trim().toLowerCase();
  const groups = (menu?.groups ?? [])
    .map((g) => ({ ...g, items: g.items.filter((i) => !q || i.label.toLowerCase().includes(q) || g.title.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0);
  const user = dashboard?.user;

  return (
    <ScrollView style={st.page} contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.blue} />}>
      {user && (
        <Pressable onPress={() => onOpen('/account', 'My account')} accessibilityRole="button">
          <Card style={st.me}>
            <View style={st.avatar}><Text style={st.avatarText}>{initials(user.name)}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{user.name}</Text>
              <Text style={st.muted}>{[user.employee.designation, ROLE[user.role] ?? user.role].filter(Boolean).join(' · ')}</Text>
            </View>
            <Icon name="chevron" color={C.muted} size={18} />
          </Card>
        </Pressable>
      )}
      <View style={st.search}>
        <Icon name="search" color={C.muted} size={18} />
        <TextInput value={find} onChangeText={setFind} placeholder="Find a page" placeholderTextColor={C.muted} style={st.searchInput} accessibilityLabel="Find a page" />
      </View>
      {menuError ? <Text style={st.error}>{menuError}</Text> : null}
      {groups.map((g) => (
        <View key={g.title} style={st.group}>
          <View style={st.groupHead}>
            <Icon name={g.icon} color={C.blue} size={16} />
            <Text style={st.groupTitle}>{g.title}</Text>
          </View>
          <Card style={st.list}>
            {g.items.map((i, n) => (
              <Pressable key={i.href} onPress={() => onOpen(i.href, i.label)} accessibilityRole="button"
                style={({ pressed }) => [st.item, n > 0 && st.itemLine, pressed && { backgroundColor: C.grey }]}>
                <Text style={st.itemText}>{i.label}</Text>
                <Badge n={i.badge} />
                <Icon name="chevron" color={C.muted} size={16} />
              </Pressable>
            ))}
          </Card>
        </View>
      ))}
      {q && groups.length === 0 ? <Text style={st.muted}>No page matches "{find.trim()}".</Text> : null}
      <Button kind="danger" label="Sign out" onPress={onSignOut} style={{ marginTop: 20 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  scroll: { padding: 16, paddingBottom: 28 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.blue, fontWeight: '800', fontSize: 15 },
  name: { color: C.ink, fontSize: 16, fontWeight: '700' },
  muted: { color: C.muted, fontSize: 14, marginTop: 2 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 12, backgroundColor: C.card, borderRadius: radius.button, borderWidth: 1, borderColor: C.line, marginBottom: 16 },
  searchInput: { flex: 1, color: C.ink, fontSize: 15 },
  error: { color: C.red, fontSize: 14, marginBottom: 12 },
  group: { marginBottom: 16 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginLeft: 2 },
  groupTitle: { color: C.muted, fontSize: 13, fontWeight: '700' },
  list: { padding: 0, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14 },
  itemLine: { borderTopWidth: 1, borderTopColor: C.line },
  itemText: { flex: 1, color: C.ink, fontSize: 15 },
});
