import { it, expect, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ sessionClient: vi.fn() }));
import { errorResponse } from "../auth";
it("returns 400 for invalid input without echoing submitted values", async () => {
  const parsed = z.object({ id: z.uuid() }).safeParse({ id: "private-input" });
  expect(parsed.success).toBe(false);
  const response = errorResponse(parsed.error);
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("private-input");
});
it("returns 400 for malformed JSON and 500 for unexpected errors", () => {
  expect(errorResponse(new SyntaxError("bad JSON")).status).toBe(400);
  expect(errorResponse(new Error("secret implementation detail")).status).toBe(
    500,
  );
});
