export type HealthResult = {
  status: "ok" | "unavailable";
};

// Allow Prisma and TLS/DNS initialization on a cold container without making probes hang.
const HEALTH_TIMEOUT_MS = 5_000;

export async function checkHealth(
  checkDatabase: () => Promise<unknown>,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<HealthResult> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      checkDatabase(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Health check timed out")), timeoutMs);
      }),
    ]);
    return { status: "ok" };
  } catch {
    return { status: "unavailable" };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
