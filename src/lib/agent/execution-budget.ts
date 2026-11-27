/** Leave time for persistence before the hosting platform terminates the request. */
export function agentExecutionBudget(env: { VERCEL?: string }): number {
  return env.VERCEL === "1" ? 260_000 : 900_000;
}
