import "server-only";
import { cookies } from "next/headers";

export const FLASH_COOKIE = "orbit-flash";

/**
 * Leaves a one-off message ("Lead added.") for the next page, for actions that move the person on with
 * redirect() and so can't hand a message back to the form. The page shows it as a notification and clears it.
 * It is readable by the page's script on purpose and holds nothing but the message.
 */
export async function flash(message: string) {
  (await cookies()).set(FLASH_COOKIE, `${Date.now().toString(36)}|${message}`, {
    path: "/",
    maxAge: 30,
    sameSite: "lax",
    httpOnly: false,
  });
}
