import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { API_ORIGIN, ApiError, signedInAddress } from './api';
import { Icon } from './Icon';
import { Button } from './ui';
import { C } from './theme';

type Props = {
  token: string;
  path: string;
  title: string;
  /** Shown with a back arrow when the page was opened from Home or More; tab pages have none. */
  onClose?: () => void;
  /** Orbit sent the page to sign-in: the session has ended, so the app signs out too. */
  onSignedOut: () => void;
  /** Only the visible page handles the phone's back button. */
  active: boolean;
};

const pathOf = (url: string) => { try { return new URL(url).pathname; } catch { return ''; } };
const sameSite = (url: string) => { try { return new URL(url).origin === API_ORIGIN; } catch { return false; } };

/**
 * An Orbit page inside the app, signed in as the phone's own session. Everything the web app can do works
 * here, with the same role checks, because it is the same page. Links to other sites (video calls, maps)
 * and file downloads open in the phone's browser.
 */
export function OrbitPage({ token, path, title, onClose, onSignedOut, active }: Props) {
  const web = useRef<WebView>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [canGoBack, setCanGoBack] = useState(false);

  const open = useCallback(async () => {
    setError(''); setAddress(null); setLoading(true);
    try { setAddress(await signedInAddress(token, path)); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { onSignedOut(); return; }
      setError(e instanceof Error ? e.message : 'This page could not be opened.');
      setLoading(false);
    }
  }, [token, path, onSignedOut]);

  useEffect(() => { void open(); }, [open]);

  // Android back button: back inside the page first, then close it.
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBack) { web.current?.goBack(); return true; }
      if (onClose) { onClose(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [active, canGoBack, onClose]);

  async function openOutside(url: string) {
    // Downloads need the session, so they go through a fresh one-time code as well.
    const target = sameSite(url) ? await signedInAddress(token, url.slice(API_ORIGIN.length)).catch(() => url) : url;
    await WebBrowser.openBrowserAsync(target);
  }

  function shouldLoad(request: { url: string }) {
    const { url } = request;
    if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('blob:')) return true;
    if (!sameSite(url)) { void openOutside(url); return false; }
    const p = pathOf(url);
    if (p.startsWith('/api/') && !p.startsWith('/api/mobile/open')) { void openOutside(url); return false; }
    return true;
  }

  function changed(nav: WebViewNavigation) {
    setCanGoBack(nav.canGoBack);
    if (sameSite(nav.url) && pathOf(nav.url) === '/login') onSignedOut();
  }

  return (
    <View style={st.page}>
      <View style={st.head}>
        {onClose ? (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={st.headButton}>
            <Icon name="arrowLeft" color={C.ink} />
          </Pressable>
        ) : canGoBack ? (
          <Pressable onPress={() => web.current?.goBack()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} style={st.headButton}>
            <Icon name="arrowLeft" color={C.ink} />
          </Pressable>
        ) : <View style={st.headButton} />}
        <Text style={st.title} numberOfLines={1}>{title}</Text>
        <Pressable onPress={() => void open()} accessibilityRole="button" accessibilityLabel="Reload" hitSlop={10} style={st.headButton}>
          <Icon name="undo" color={C.muted} size={18} />
        </Pressable>
      </View>
      {error ? (
        <View style={st.center}>
          <Icon name="wifiOff" color={C.muted} size={28} />
          <Text style={st.error}>{error}</Text>
          <Button label="Try again" onPress={() => void open()} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : address ? (
        <WebView
          ref={web}
          source={{ uri: address }}
          style={st.web}
          applicationNameForUserAgent="OrbitApp/1.0"
          sharedCookiesEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          originWhitelist={['https://*', 'http://*']}
          onShouldStartLoadWithRequest={shouldLoad}
          onNavigationStateChange={changed}
          onLoadEnd={() => setLoading(false)}
          onError={() => { setError("Can't reach Orbit. Check your internet connection and try again."); setLoading(false); }}
        />
      ) : null}
      {loading && !error && <View style={st.loading} pointerEvents="none"><ActivityIndicator color={C.blue} /></View>}
    </View>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: C.page },
  head: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.line },
  headButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.ink, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  web: { flex: 1, backgroundColor: C.page },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  error: { color: C.ink, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  loading: { position: 'absolute', top: 60, left: 0, right: 0, alignItems: 'center' },
});
