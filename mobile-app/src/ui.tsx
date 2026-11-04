import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { C, radius } from './theme';

/** The few shared pieces every screen uses, matching the web app's buttons and white cards. */

export function Button({ label, onPress, busy, kind = 'primary', style }: {
  label: string; onPress: () => void; busy?: boolean; kind?: 'primary' | 'secondary' | 'danger'; style?: StyleProp<ViewStyle>;
}) {
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? C.red : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [s.button, s[kind], pressed && s.pressed, busy && s.busy, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return <View style={s.badge}><Text style={s.badgeText}>{n > 99 ? '99+' : n}</Text></View>;
}

export const s = StyleSheet.create({
  button: { minHeight: 48, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: C.blue },
  secondary: { backgroundColor: C.grey },
  danger: { backgroundColor: C.redSoft, borderWidth: 1, borderColor: '#f3d1d1' },
  pressed: { opacity: 0.8 },
  busy: { opacity: 0.6 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: radius.card, borderWidth: 1, borderColor: C.line, padding: 16 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: C.blue, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
