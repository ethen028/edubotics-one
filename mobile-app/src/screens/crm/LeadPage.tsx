import React, { useCallback, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { lastPart, type NativeProps } from '../../native';
import { getLead, setLeadStatus } from '../../crm/data';
import type { LeadStatus } from '../../crm/types';
import {
  ActivityLine, Chips, Empty, Facts, Hero, LEAD_STATUS, Loading, LogForm, NextStep, ORG_TYPE, Pill, Reach, Screen, Section, SOURCE, dayLabel, st, toast, toastError, useLoad,
} from '../../crm/parts';

const CHANGEABLE: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED'];

/** One lead: who and what they asked for, call or WhatsApp them, move the status, log calls and set follow-ups. */
export function LeadPage({ token, path, open, changed }: NativeProps) {
  const id = lastPart(path);
  const { data: lead, error, refreshing, reload } = useLoad(useCallback(() => getLead(token, id), [token, id]));
  const [saving, setSaving] = useState(false);

  async function move(status: LeadStatus) {
    if (!lead || status === lead.status || saving) return;
    setSaving(true);
    try {
      const res = await setLeadStatus(token, id, status);
      changed();
      toast(`Marked ${LEAD_STATUS[status].label.toLowerCase()}`, { action: { label: 'Undo', run: async () => { await setLeadStatus(token, id, res.before); changed(); } } });
    } catch (e) { toastError(e); }
    finally { setSaving(false); }
  }

  if (!lead && !error) return <Loading hero rows={3} />;
  if (!lead) return <Screen refreshing={refreshing} onRefresh={reload}><Text style={st.error}>{error || 'This lead is not there any more.'}</Text></Screen>;
  return (
    <Screen refreshing={refreshing} onRefresh={reload}>
      <Hero kicker="Lead" title={lead.organizationName ?? lead.name} line={lead.interest}>
        <Pill {...LEAD_STATUS[lead.status]} />
        {lead.orgType ? <Pill label={ORG_TYPE[lead.orgType]} tone="gray" /> : null}
      </Hero>
      <Reach phone={lead.phone} email={lead.email} />

      {lead.status === 'CONVERTED' ? null : (
        <Section title="Status">
          <Chips options={CHANGEABLE.map((k) => ({ key: k, label: LEAD_STATUS[k].label }))} value={lead.status as 'NEW'} onChange={move} />
        </Section>
      )}

      <NextStep token={token} activities={lead.activities} onChanged={changed} />

      <Facts rows={[
        ['Contact', lead.name],
        ['Phone', lead.phone],
        ['Email', lead.email],
        ['Town', lead.city],
        ['Came from', SOURCE[lead.source]],
        ['Came in', dayLabel(lead.createdAt)],
        ['Owner', lead.owner?.name],
      ]} />
      {lead.notes ? <Section title="Notes"><Text style={[st.muted, { fontSize: 14 }]}>{lead.notes}</Text></Section> : null}

      <Section title="Log a call or set a follow-up">
        <LogForm token={token} on={{ leadId: id }} onSaved={changed} />
      </Section>

      <Section title="Activity" count={lead.activities.length}>
        {lead.activities.length === 0 ? <Empty text="Nothing logged yet." /> : lead.activities.map((a) => <ActivityLine key={a.id} a={a} showAbout={false} />)}
      </Section>

      <Pressable onPress={() => open(path, lead.organizationName ?? lead.name, { web: true })} accessibilityRole="link" hitSlop={8}>
        <Text style={st.link}>Open in Orbit to edit or turn into a deal</Text>
      </Pressable>
    </Screen>
  );
}
