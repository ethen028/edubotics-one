"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SubmitButton, type FormState } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { markRead } from "./actions";

const POLL_MS = 5000;

/**
 * Keeps an open Messages page up to date by asking the server every few seconds whether anything changed, and
 * reloading the page's data only when it has. It stops asking while the tab is hidden.
 */
export function LiveUpdates({ conversationId, latest, unread }: { conversationId?: string; latest?: string; unread: number }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    async function check() {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/messages/poll${conversationId ? `?c=${encodeURIComponent(conversationId)}` : ""}`, { cache: "no-store" });
        if (!res.ok) return;
        const now = (await res.json()) as { latest: string | null; unread: number };
        if (now.unread !== unread || (conversationId && (now.latest ?? undefined) !== latest)) router.refresh();
      } catch {
        // Offline for a moment: try again next time.
      }
    }
    const timer = setInterval(check, POLL_MS);
    const onShow = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [conversationId, latest, unread, router]);
  return null;
}

/** Marks the open conversation read, and scrolls to the newest message whenever one arrives. */
export function ReadAndScroll({ conversationId, latest }: { conversationId: string; latest?: string }) {
  const first = useRef(true);
  useEffect(() => {
    markRead(conversationId);
    // A search result link (#m-…) scrolls to that message instead, the first time.
    if (first.current && window.location.hash.startsWith("#m-")) {
      first.current = false;
      return;
    }
    first.current = false;
    const end = document.getElementById("chat-end");
    end?.scrollIntoView({ block: "end" });
  }, [conversationId, latest]);
  return null;
}

/**
 * The box at the bottom of a chat. Enter sends on a computer (Shift+Enter for a new line); on a phone, tap Send.
 * The paperclip attaches up to 5 files (10 MB each), sent with the message.
 */
export function Composer({
  action,
  disabled,
  placeholder,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  disabled?: string;
  placeholder: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [state, formAction] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await action(prev, data);
    if (result?.ok) {
      form.current?.reset();
      setPicked([]);
      if (box.current) box.current.style.height = "";
    }
    return result;
  }, undefined);

  if (disabled) return <div className="chat-composer text-sm text-slate-500">{disabled}</div>;
  return (
    <form ref={form} action={formAction} className="chat-composer">
      {state?.error && (
        <div role="alert" className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {picked.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
          {picked.map((name, i) => (
            <span key={i} className="chat-picked">
              <Icon name="paperclip" className="h-3 w-3" />
              {name}
            </span>
          ))}
          <button
            type="button"
            className="text-slate-500 underline hover:text-slate-800"
            onClick={() => {
              if (picker.current) picker.current.value = "";
              setPicked([]);
            }}
          >
            Remove
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <label className="icon-btn h-10 w-10 shrink-0 cursor-pointer" title="Attach files (up to 5, 10 MB each)">
          <span className="sr-only">Attach files</span>
          <Icon name="paperclip" className="h-4 w-4" />
          <input
            ref={picker}
            type="file"
            name="files"
            multiple
            className="sr-only"
            onChange={(e) => setPicked([...(e.currentTarget.files ?? [])].map((f) => f.name))}
          />
        </label>
        <label className="sr-only" htmlFor="chat-body">
          Message
        </label>
        <textarea
          id="chat-body"
          ref={box}
          name="body"
          rows={1}
          maxLength={4000}
          placeholder={placeholder}
          autoComplete="off"
          className="input max-h-40 min-h-[2.5rem] resize-none rounded-2xl"
          onInput={(e) => {
            const t = e.currentTarget;
            t.style.height = "auto";
            t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            if (window.matchMedia("(pointer: coarse)").matches) return;
            e.preventDefault();
            if (e.currentTarget.value.trim() || picked.length) form.current?.requestSubmit();
          }}
        />
        <SubmitButton className="btn-primary h-10 shrink-0 px-4" pendingLabel="Sending">
          <Icon name="send" className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </SubmitButton>
      </div>
    </form>
  );
}
