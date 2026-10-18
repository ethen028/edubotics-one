"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = { render: (element: HTMLElement, options: { sitekey: string; action: string }) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Turnstile } }

export function Captcha({ siteKey, action, nonce }: { siteKey: string | null; action: string; nonce?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!siteKey || !ready || !container.current || !window.turnstile) return;
    const widget = window.turnstile.render(container.current, { sitekey: siteKey, action });
    return () => window.turnstile?.remove(widget);
  }, [siteKey, action, ready]);
  if (!siteKey) return null;
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" nonce={nonce} onReady={() => setReady(true)} />
    <div ref={container} aria-label="Spam protection" />
    <p className="text-xs text-slate-500">Cloudflare checks this form for automated submissions. See our <a href="/privacy" className="link">privacy notice</a>.</p>
  </>;
}
