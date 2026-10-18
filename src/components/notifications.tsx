"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

const Notifications = createContext<(message: string) => void>(() => {});
export const useNotification = () => useContext(Notifications);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const sequence = useRef(0);
  const [notice, setNotice] = useState<{ id: number; message: string } | null>(null);
  const notify = useCallback((message: string) => { setNotice({ id: ++sequence.current, message }); }, []);
  return <Notifications.Provider value={notify}>{children}
    <div className="notification-region" role="status" aria-live="polite" aria-atomic="true">
      {notice && <div className="workspace-notification" key={notice.id}><span className="notification-check" aria-hidden="true">✓</span><p>{notice.message}</p><button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}>×</button></div>}
    </div>
  </Notifications.Provider>;
}
