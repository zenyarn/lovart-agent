import type { AgentMessage } from "@earendil-works/pi-agent-core";
/** Preserve completed tool results after a failed turn; never invent successful execution. */
export function recoverTranscript(messages: AgentMessage[]): AgentMessage[] {
  const recovered: AgentMessage[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (
      message.role === "assistant" &&
      ["error", "aborted"].includes(message.stopReason)
    )
      continue;
    recovered.push(message);
    if (message.role !== "assistant") continue;
    const following: AgentMessage[] = [];
    while (messages[i + 1]?.role === "toolResult")
      following.push(messages[++i]);
    recovered.push(...following);
    for (const call of message.content.filter((c) => c.type === "toolCall")) {
      if (
        !following.some(
          (m) => m.role === "toolResult" && m.toolCallId === call.id,
        )
      )
        recovered.push({
          role: "toolResult",
          toolCallId: call.id,
          toolName: call.name,
          isError: true,
          content: [
            {
              type: "text",
              text: "上轮运行中断，工具结果未确认。生图可能已提交，必须先读取画布和素材，不能直接重提付费任务。",
            },
          ],
          timestamp: Date.now(),
        });
    }
  }
  return recovered;
}
