import "server-only";
import type { CurrentUser } from "@/lib/auth";
import { createClaimsAgent } from "./claims-api";
import { CLAIMS_API_METHODS, CLAIMS_CATALOG } from "./claims-rules";
import { runAgentTask, type AgentTaskResult } from "./claude-loop";

/**
 * Answers a question about expense claims, as the signed-in person. Read-only.
 * Not wired to any page or route yet: call it from a server action or a script that has already
 * authenticated the person.
 */
export async function askAboutClaims(user: CurrentUser, task: string): Promise<AgentTaskResult> {
  const agent = createClaimsAgent(user) as unknown as Record<string, (args: unknown) => Promise<unknown>>;
  return runAgentTask({
    task,
    catalog: CLAIMS_CATALOG,
    callApi: async (method, args) => {
      if (!(CLAIMS_API_METHODS as readonly string[]).includes(method)) throw new Error(`No such function: ${method}`);
      return agent[method](args);
    },
  });
}
