import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, ApiError, saveToken } from './api';
import { Button, Card } from './ui';
import { C } from './theme';

type Result = { token: string; mustChangePassword: boolean };

/** Email and password, then the code from the authenticator app for people who switched sign-in codes on. */
export function SignIn({ onSignedIn }: { onSignedIn: (token: string, mustChangePassword: boolean) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [askCode, setAskCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn() {
    if (!email.trim() || !password) { setError('Enter your work email and password.'); return; }
    if (askCode && !code.trim()) { setError('Type the code from your authenticator app.'); return; }
    setBusy(true); setError('');
    try {
      const body = { email: email.trim().toLowerCase(), password, ...(askCode ? { code: code.trim() } : {}) };
      const result = await api<Result>('/api/mobile/auth/login', null, { method: 'POST', body: JSON.stringify(body) });
      await saveToken(result.token);
      setPassword(''); setCode('');
      onSignedIn(result.token, result.mustChangePassword);
    } catch (e) {
      if (e instanceof ApiError && e.needsCode) { setAskCode(true); setCode(''); }
      setError(e instanceof Error ? e.message : 'Sign-in failed. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={st.page}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled">
          <View style={st.top}>
            <Image source={require('../assets/logo.png')} style={st.logo} resizeMode="contain" accessibilityLabel="Edubotics" />
            <Text style={st.app}>Orbit</Text>
          </View>
          <Card style={st.card}>
            <Text style={st.h1}>{askCode ? 'Enter your sign-in code' : 'Sign in'}</Text>
            <Text style={st.muted}>
              {askCode ? 'Open your authenticator app and type the 6-digit code for Orbit, or one of your backup codes.' : 'Use your Orbit email and password.'}
            </Text>
            {!askCode && <>
              <Text style={st.label}>Work email</Text>
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="username" style={st.input} accessibilityLabel="Work email" />
              <Text style={st.label}>Password</Text>
              <TextInput value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" style={st.input} onSubmitEditing={signIn} accessibilityLabel="Password" />
            </>}
            {askCode && <>
              <Text style={st.label}>Code</Text>
              <TextInput value={code} onChangeText={setCode} autoFocus autoCapitalize="none" keyboardType="default" autoComplete="one-time-code" textContentType="oneTimeCode" style={st.input} onSubmitEditing={signIn} accessibilityLabel="Sign-in code" />
            </>}
            {error ? <Text style={st.error} accessibilityLiveRegion="polite">{error}</Text> : null}
            <Button label={askCode ? 'Check code and sign in' : 'Sign in'} onPress={signIn} busy={busy} style={{ marginTop: 20 }} />
            {askCode && <Button kind="secondary" label="Back" onPress={() => { setAskCode(false); setError(''); setCode(''); }} style={{ marginTop: 10 }} />}
          </Card>
          <Text style={st.foot}>Forgot your password? Reset it from the Orbit sign-in page in a browser.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  top: { alignItems: 'center', marginBottom: 20 },
  logo: { width: 150, height: 141 },
  app: { color: C.navy, fontSize: 22, fontWeight: '800', marginTop: 10 },
  card: { padding: 20 },
  h1: { color: C.ink, fontSize: 22, fontWeight: '800' },
  muted: { color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 6 },
  label: { color: C.ink, fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  input: { height: 48, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, color: C.ink, fontSize: 15, backgroundColor: '#fff' },
  error: { color: C.red, fontSize: 14, lineHeight: 20, marginTop: 12 },
  foot: { color: C.muted, fontSize: 13, textAlign: 'center', marginTop: 18, lineHeight: 19 },
});
