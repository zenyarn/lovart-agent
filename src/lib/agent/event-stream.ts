/** Durable SSE transport: reconnects replay the current persisted conversation. */
export function agentEventStream(
  load: () => Promise<unknown>,
  signal: AbortSignal,
) {
  const encoder = new TextEncoder();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let previous = "";
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      signal.addEventListener(
        "abort",
        () => {
          stop();
          try {
            controller.close();
          } catch {}
        },
        { once: true },
      );
      async function tick() {
        try {
          const data = JSON.stringify(await load());
          if (stopped) return;
          if (data !== previous) {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            previous = data;
          } else controller.enqueue(encoder.encode(": heartbeat\n\n"));
          timer = setTimeout(tick, 700);
        } catch {
          if (!stopped) {
            stop();
            controller.error(new Error("对话连接中断"));
          }
        }
      }
      void tick();
    },
    cancel: stop,
  });
}
