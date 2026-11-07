import React, { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { C } from './theme';
import { Leave } from './screens/Leave';
import { Approvals } from './screens/Approvals';
import { Work } from './screens/Work';
import { Timesheet } from './screens/Timesheet';
import { Leads } from './screens/crm/Leads';
import { LeadPage } from './screens/crm/LeadPage';
import { Pipeline } from './screens/crm/Pipeline';
import { DealPage } from './screens/crm/DealPage';
import { Institutions } from './screens/crm/Institutions';
import { InstitutionPage } from './screens/crm/InstitutionPage';
import { Contacts } from './screens/crm/Contacts';
import { FollowUps } from './screens/crm/FollowUps';

export type NativeProps = {
  token: string;
  /** The Orbit address this screen stands for, e.g. /crm/leads/abc123 (detail screens read the id from it). */
  path: string;
  /** Opens another page: its phone screen if it has one, else (or with web) the Orbit page inside the app. */
  open: (path: string, title: string, how?: { web?: boolean }) => void;
  /** Something changed that the counts on Home and the tabs should show. */
  changed: () => void;
};

/**
 * Pages that have their own phone screens. Everything else opens as the Orbit page inside the app until its
 * screen is built; adding a page here is all it takes for Home, More and the tabs to use the native one.
 */
export const NATIVE: Record<string, (props: NativeProps) => React.ReactElement> = {
  '/hr/leave': Leave,
  '/approvals': Approvals,
  '/work': Work,
  '/timesheets': Timesheet,
  '/crm/leads': Leads,
  '/crm/deals': Pipeline,
  '/crm/organizations': Institutions,
  '/crm/contacts': Contacts,
  '/crm/activities': FollowUps,
};

/** Phone screens for one record, matched by the web address with its id: /crm/leads/<id> and so on. */
const NATIVE_RECORDS: [RegExp, (props: NativeProps) => React.ReactElement][] = [
  [/^\/crm\/leads\/(?!new$)[\w-]+$/, LeadPage],
  [/^\/crm\/deals\/(?!new$)[\w-]+$/, DealPage],
  [/^\/crm\/organizations\/(?!new$)[\w-]+$/, InstitutionPage],
];

/** The phone screen for an Orbit address, or undefined when that page still opens as the web page. */
export function nativeFor(path: string) {
  return NATIVE[path] ?? NATIVE_RECORDS.find(([pattern]) => pattern.test(path))?.[1];
}

/** The record id at the end of a detail address. */
export const lastPart = (path: string) => path.split('/').filter(Boolean).at(-1) ?? '';

/** A native screen opened from Home or More: the title bar with a back arrow, and the Android back button. */
export function NativePage({ title, onClose, children, active = true }: { title: string; onClose: () => void; children: React.ReactNode; active?: boolean }) {
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose, active]);
  return (
    <View style={st.page}>
      <View style={st.head}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={st.button}>
          <Icon name="arrowLeft" color={C.ink} />
        </Pressable>
        <Text style={st.title} numberOfLines={1}>{title}</Text>
        <View style={st.button} />
      </View>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  head: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line },
  button: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
});
