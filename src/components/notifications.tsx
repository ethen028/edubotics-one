"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

const Notifications = createContext<(message: string) => void>(() => {});
export const useNotification = () => useContext(Notifications);

type Notice = { id: number; message: string };
/** How many messages stay on screen at once; an older one drops off when a fourth arrives. */
const MAX_SHOWN = 3;
const SHOW_MS = 6000;

/**
 * Short "saved" messages in the top right. Several in a row stack up with the newest in front and the older
 * ones peeking out behind it; pointing at the stack (or tabbing into it) opens it out and holds every message
 * until you move away. The stack that fans out on hover is an idea from the toast component on uiarc.dev.
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const sequence = useRef(0);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [held, setHeld] = useState(false);
  const notify = useCallback((message: string) => {
    setNotices((list) => [{ id: ++sequence.current, message }, ...list].slice(0, MAX_SHOWN));
  }, []);
  const dismiss = useCallback((id: number) => setNotices((list) => list.filter((n) => n.id !== id)), []);

  // Each message tucks itself away after a few seconds, oldest first; none go while the stack is held open.
  useEffect(() => {
    if (held || notices.length === 0) return;
    const oldest = notices[notices.length - 1];
    const timer = setTimeout(() => dismiss(oldest.id), notices.length > 1 ? SHOW_MS / 2 : SHOW_MS);
    return () => clearTimeout(timer);
  }, [notices, held, dismiss]);
  useEffect(() => {
    // Once the last message has gone, the stack is no longer held (focus left with the button that closed it).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (notices.length === 0) setHeld(false);
  }, [notices.length]);

  return (
    <Notifications.Provider value={notify}>
      {children}
      <div className="notification-region" role="status" aria-live="polite" aria-atomic="false">
        {notices.length > 0 && (
          <div
            className="notification-stack"
            data-open={held || undefined}
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false);
            }}
          >
            {notices.map((n, i) => (
              <div className="workspace-notification" key={n.id} data-depth={i} aria-hidden={!held && i > 0 ? true : undefined}>
                <span className="notification-check" aria-hidden="true">
                  ✓
                </span>
                <p>{n.message}</p>
                <button type="button" aria-label="Dismiss notification" tabIndex={!held && i > 0 ? -1 : undefined} onClick={() => dismiss(n.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Notifications.Provider>
  );
}
