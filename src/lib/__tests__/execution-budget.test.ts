import { expect, it } from "vitest";
import { agentExecutionBudget } from "../agent/execution-budget";
it("leaves time to persist results before the Vercel Hobby hard timeout", () => {
  expect(agentExecutionBudget({ VERCEL: "1" })).toBe(260000);
  expect(agentExecutionBudget({})).toBe(900000);
});
