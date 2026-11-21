/* eslint-disable @next/next/no-img-element */
"use client";
import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentRun } from "@/lib/agent/types";
import type { Asset } from "@/lib/types";
export function SafeMarkdown({ text }: { text: string }) {
  return (
    <div className="markdown-message">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={(url) =>
          /^(https?:|mailto:|\/|#)/i.test(url) ? defaultUrlTransform(url) : ""
        }
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          img: () => null,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
export function AgentMessage({
  run,
  assets,
  onRetry,
}: {
  onRetry?: () => Promise<void>;
  run: AgentRun;
  assets: Record<string, Asset>;
}) {
  const blocks: {
    type: "text" | "thinking" | "tool";
    text?: string;
    id?: string;
    name?: string;
    args?: unknown;
    result?: unknown;
    error?: boolean;
    done?: boolean;
  }[] = [];
  for (const e of run.events) {
    if (e.type === "text" || e.type === "thinking") {
      const last = blocks.at(-1);
      if (last?.type === e.type) last.text = (last.text || "") + e.delta;
      else blocks.push({ type: e.type, text: e.delta });
    }
    if (e.type === "tool_start")
      blocks.push({ type: "tool", id: e.id, name: e.name, args: e.args });
    if (e.type === "tool_end") {
      const b = blocks.find((b) => b.id === e.id);
      if (b) {
        b.result = e.result;
        b.error = e.error;
        b.done = true;
      }
    }
  }
  return (
    <article className="agent-message">
      <div className="user-message">
        <div className="message-attachments">
          {run.attachment_ids.map((id, i) => {
            const a = assets[id];
            return (
              <div className="sent-attachment" key={id}>
                <a
                  href={`/api/assets/${id}?preview=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {a?.mime.startsWith("image/") ? (
                    <img src={a.url} alt={`附件 ${i + 1}`} />
                  ) : (
                    <span>{a?.name || "附件"}</span>
                  )}
                </a>
                <a
                  aria-label="下载已发送附件"
                  href={`/api/assets/${id}?download=1`}
                >
                  下载
                </a>
              </div>
            );
          })}
        </div>
        <p>{run.prompt}</p>
      </div>
      <div className="assistant-message">
        {blocks.map((b, i) =>
          b.type === "text" ? (
            <SafeMarkdown key={i} text={b.text || ""} />
          ) : b.type === "thinking" ? (
            <details key={i} className="thinking">
              <summary>思考过程</summary>
              <SafeMarkdown text={b.text || ""} />
            </details>
          ) : (
            <details
              key={i}
              className={`tool-card ${b.error ? "tool-error" : ""}`}
            >
              <summary>
                {(
                  {
                    list_assets: "列出素材",
                    view_image: "查看图片",
                    generate_image: "生成图片",
                    place_on_canvas: "放入画布",
                    read_canvas: "读取画布",
                  } as Record<string, string>
                )[b.name!] || b.name}{" "}
                · {b.done ? (b.error ? "失败" : "完成") : "处理中"}
              </summary>
              <strong>参数</strong>
              <pre>{JSON.stringify(b.args, null, 2)}</pre>
              {b.done && (
                <>
                  <strong>{b.error ? "错误" : "结果"}</strong>
                  <pre>{JSON.stringify(b.result, null, 2)}</pre>
                </>
              )}
            </details>
          ),
        )}
      </div>
      {run.status === "running" && (
        <p className="muted" role="status">
          Agent 正在处理…
        </p>
      )}
      {onRetry && run.status === "failed" && (
        <button onClick={() => void onRetry()}>重试发送（保留原请求）</button>
      )}
      {run.error && (
        <p className="inline-error" role="alert">
          {run.error}
        </p>
      )}
    </article>
  );
}
