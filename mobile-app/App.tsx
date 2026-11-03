import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, forgetToken, readToken, type Dashboard, type Menu } from './src/api';
import { SignIn } from './src/SignIn';
import { Home } from './src/Home';
import { More } from './src/More';
import { OrbitPage } from './src/OrbitPage';
import { NATIVE, NativePage } from './src/native';
import { Icon } from './src/Icon';
import { Badge } from './src/ui';
import { C } from './src/theme';

/**
 * Orbit on the phone. Home, More and the pages listed in src/native.tsx are phone screens; every other page
 * (and for now the My work, Messages and Approvals tabs) is the real Orbit page inside the app, signed in
 * (src/OrbitPage.tsx), until its phone screen is built.
 * Tabs only appear when the person's menu has the page, so roles see what they see on the web.
 */

type Tab = { key: string; label: string; icon: string; href?: string };
const TABS: Tab[] = [
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'work', label: 'My work', icon: 'check', href: '/work' },
  { key: 'messages', label: 'Messages', icon: 'chat', href: '/messages' },
  { key: 'approvals', label: 'Approvals', icon: 'stamp', href: '/approvals' },
  { key: 'more', label: 'More', icon: 'grid' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Orbit />
    </SafeAreaProvider>
  );
}

function Orbit() {
  const [token, setToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardError, setDashboardError] = useState('');
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuError, setMenuError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('home');
  const [visited, setVisited] = useState<string[]>(['home']);
  const [opened, setOpened] = useState<{ path: string; title: string } | null>(null);

  const signOutHere = useCallback(async () => {
    await forgetToken();
    setToken(null); setDashboard(null); setMenu(null); setOpened(null); setTab('home'); setVisited(['home']);
  }, []);

  const load = useCallback(async (t: string) => {
    setRefreshing(true);
    const [d, m] = await Promise.allSettled([api<Dashboard>('/api/mobile/dashboard', t), api<Menu>('/api/mobile/menu', t)]);
    setRefreshing(false);
    const ended = [d, m].some((r) => r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 401);
    if (ended) { await signOutHere(); return; }
    if (d.status === 'fulfilled') { setDashboard(d.value); setDashboardError(''); }
    else setDashboardError(d.reason instanceof Error ? d.reason.message : 'Your day could not be loaded.');
    if (m.status === 'fulfilled') { setMenu(m.value); setMenuError(''); }
    else setMenuError(m.reason instanceof Error ? m.reason.message : 'The menu could not be loaded.');
  }, [signOutHere]);

  useEffect(() => {
    readToken()
      .then((saved) => { if (saved) { setToken(saved); void load(saved); } })
      .finally(() => setStarting(false));
  }, [load]);

  async function signOut() {
    const old = token;
    try { if (old) await api('/api/mobile/auth/logout', old, { method: 'POST', body: '{}' }); } catch { /* signing out on the phone must work offline too */ }
    await signOutHere();
  }

  if (starting) return <View style={st.center}><ActivityIndicator size="large" color={C.blue} /></View>;
  if (!token) {
    return (
      <SignIn onSignedIn={(t, mustChange) => {
        setToken(t); void load(t);
        if (mustChange) {
          Alert.alert('Choose a new password', 'Your password has to be changed before you can use Orbit.');
          setOpened({ path: '/change-password', title: 'New password' });
        }
      }} />
    );
  }

  const pages = new Set(menu?.groups.flatMap((g) => g.items.map((i) => i.href)) ?? []);
  const tabs = TABS.filter((t) => !t.href || pages.has(t.href));
  const badge: Record<string, number> = { messages: menu?.counts.messages ?? 0, approvals: menu?.counts.approvals ?? 0 };
  const go = (key: string) => { setTab(key); setVisited((v) => (v.includes(key) ? v : [...v, key])); };
  const open = (path: string, title: string) => {
    const asTab = tabs.find((t) => t.href === path);
    if (asTab) go(asTab.key); else setOpened({ path, title });
  };
  const refresh = () => void load(token);
  const close = () => { setOpened(null); refresh(); };

  return (
    <SafeAreaView style={st.app} edges={['top', 'left', 'right']}>
      <View style={st.body}>
        <View style={[st.fill, tab !== 'home' && st.hidden]}>
          <Home token={token} dashboard={dashboard} dashboardError={dashboardError} menu={menu} refreshing={refreshing} onRefresh={refresh} onOpen={open} />
        </View>
        {tabs.filter((t) => t.href && visited.includes(t.key)).map((t) => (
          <View key={t.key} style={[st.fill, tab !== t.key && st.hidden]}>
            <OrbitPage token={token} path={t.href!} title={t.label} onSignedOut={signOutHere} active={tab === t.key && !opened} />
          </View>
        ))}
        <View style={[st.fill, tab !== 'more' && st.hidden]}>
          <More dashboard={dashboard} menu={menu} menuError={menuError} refreshing={refreshing} onRefresh={refresh} onOpen={open} onSignOut={signOut} />
        </View>
        {opened && (
          <View style={st.fill}>
            {NATIVE[opened.path] ? (
              <NativePage title={opened.title} onClose={close}>{React.createElement(NATIVE[opened.path], { token })}</NativePage>
            ) : (
              <OrbitPage token={token} path={opened.path} title={opened.title} onClose={close} onSignedOut={signOutHere} active />
            )}
          </View>
        )}
      </View>
      <SafeAreaView edges={['bottom']} style={st.tabBar}>
        {tabs.map((t) => {
          const on = tab === t.key && !opened;
          return (
            <Pressable key={t.key} onPress={() => { setOpened(null); go(t.key); }} style={st.tab} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={t.label}>
              {on && <View style={st.tabMark} />}
              <View>
                <Icon name={t.icon} color={on ? C.blue : C.muted} size={22} />
                {badge[t.key] ? <View style={st.tabBadge}><Badge n={badge[t.key]} /></View> : null}
              </View>
              <Text style={[st.tabLabel, on && { color: C.blue }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </SafeAreaView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  app: { flex: 1, backgroundColor: C.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.page },
  body: { flex: 1 },
  fill: { ...StyleSheet.absoluteFillObject },
  hidden: { display: 'none' },
  tabBar: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, gap: 3, paddingTop: 6 },
  tabMark: { position: 'absolute', top: 0, width: 24, height: 3, borderRadius: 2, backgroundColor: C.orange },
  tabLabel: { color: C.muted, fontSize: 11, fontWeight: '600' },
  tabBadge: { position: 'absolute', top: -6, right: -12 },
});
