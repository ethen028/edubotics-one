import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '../../Icon';
import { Button } from '../../ui';
import { C, radius } from '../../theme';
import { addLead } from '../../crm/data';
import type { LeadSource, OrgType } from '../../crm/types';
import { Chips, SOURCE, st, toast } from '../../crm/parts';

const SOURCES: LeadSource[] = ['PHONE', 'WALK_IN', 'REFERRAL', 'WEBSITE', 'SOCIAL', 'EVENT', 'EMAIL', 'OTHER'];
const KINDS: { key: OrgType | 'PERSON'; label: string }[] = [
  { key: 'SCHOOL', label: 'School' }, { key: 'COLLEGE', label: 'College' }, { key: 'CORPORATE', label: 'Company' }, { key: 'PERSON', label: 'Person' },
];

/**
 * Quick add, for the moment a call comes in or someone walks up at an event: only the school or person is
 * needed. Everything else can wait for the full form in Orbit.
 */
export function AddLeadSheet({ token, visible, onClose, onAdded }: { token: string; visible: boolean; onClose: () => void; onAdded: (id: string, title: string) => void }) {
  const [org, setOrg] = useState('');
  const [kind, setKind] = useState<OrgType | 'PERSON'>('SCHOOL');
  const [person, setPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [interest, setInterest] = useState('');
  const [source, setSource] = useState<LeadSource>('PHONE');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setOrg(''); setPerson(''); setPhone(''); setCity(''); setInterest(''); setSource('PHONE'); setKind('SCHOOL'); setError(''); };
  const phoneOk = !phone.trim() || phone.replace(/[^\d]/g, '').length >= 10;

  async function save() {
    if (!org.trim()) { setError(kind === 'PERSON' ? 'Enter the person’s name.' : 'Enter the name of the school, college or company.'); return; }
    if (!phoneOk) { setError('The phone number looks short. Check it has 10 digits.'); return; }
    setBusy(true); setError('');
    try {
      const res = await addLead(token, { organizationName: org, name: person, phone, city, interest, source, orgType: kind === 'PERSON' ? null : kind });
      reset();
      onClose();
      toast(res.ok, { action: { label: 'Open', run: () => onAdded(res.id, res.title) } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Not saved. Try again.'); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={x.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={x.sheetWrap} pointerEvents="box-none">
        <View style={x.sheet} accessibilityViewIsModal>
          <View style={x.grab} />
          <View style={x.head}>
            <Text style={x.title} accessibilityRole="header">New lead</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={x.close}>
              <Text style={x.closeText}>✕</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
            <Chips options={KINDS} value={kind} onChange={setKind} edge={20} />
            <Field label={kind === 'PERSON' ? 'Name' : 'School, college or company'} required value={org} onChange={(v) => { setOrg(v); if (error) setError(''); }}
              placeholder={kind === 'PERSON' ? 'e.g. Anil Kumar' : 'e.g. St. Thomas HSS'} autoFocus />
            {kind === 'PERSON' ? null : <Field label="Who you spoke to" value={person} onChange={setPerson} placeholder="Name and role, e.g. Principal" />}
            <Field label="Phone" value={phone} onChange={setPhone} placeholder="10-digit mobile" keyboardType="phone-pad" invalid={!phoneOk} />
            <Field label="Town" value={city} onChange={setCity} placeholder="e.g. Thrissur" />
            <Field label="What they asked about" value={interest} onChange={setInterest} placeholder="e.g. Robotics lab for classes 6-9" />
            <Text style={x.label}>How they found us</Text>
            <Chips options={SOURCES.map((k) => ({ key: k, label: SOURCE[k] }))} value={source} onChange={setSource} edge={20} />
            {error ? <View style={x.error} accessibilityLiveRegion="polite"><Icon name="flag" color={C.red} size={16} /><Text style={x.errorText}>{error}</Text></View> : null}
          </ScrollView>
          <Button label="Add lead" onPress={save} busy={busy} />
          <Text style={x.hint}>Email, notes and owner can be added from the full form in Orbit.</Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, value, onChange, placeholder, required, keyboardType, invalid, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean;
  keyboardType?: 'phone-pad' | 'default'; invalid?: boolean; autoFocus?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={x.label}>{label}{required ? <Text style={{ color: C.red }}> *</Text> : null}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted} keyboardType={keyboardType}
        autoFocus={autoFocus} accessibilityLabel={required ? `${label}, required` : label}
        style={[st.input, { marginBottom: 0 }, invalid && { borderColor: C.red }]} />
    </View>
  );
}

const x = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,45,87,0.45)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: 20, maxHeight: '92%' },
  grab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  title: { color: C.ink, fontSize: 19, fontWeight: '800' },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.grey, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: C.ink, fontSize: 16, fontWeight: '700' },
  label: { color: C.ink, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.redSoft, borderRadius: radius.button, padding: 10, marginBottom: 10 },
  errorText: { flex: 1, color: C.red, fontSize: 14, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
