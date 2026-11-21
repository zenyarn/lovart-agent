export type AgentEvent =
  | { type: "text" | "thinking"; delta: string }
  | { type: "tool_start"; id: string; name: string; args: unknown }
  | {
      type: "tool_end";
      id: string;
      name: string;
      result: unknown;
      error: boolean;
    }
  | { type: "error"; message: string }
  | { type: "done" };
export type AgentRun = {
  id: string;
  prompt: string;
  attachment_ids: string[];
  skill_id?: string | null;
  skill_name?: string | null;
  status: "running" | "completed" | "failed";
  events: AgentEvent[];
  error: string | null;
  created_at: string;
};
