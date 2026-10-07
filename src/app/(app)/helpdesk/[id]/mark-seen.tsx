"use client";

import { useEffect } from "react";
import { markSeen } from "../actions";

/** Clears the "updated" badge once the requester has opened the request. */
export function MarkSeen({ ticketId }: { ticketId: string }) {
  useEffect(() => {
    markSeen(ticketId);
  }, [ticketId]);
  return null;
}
