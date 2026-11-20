import { z } from "zod";
const base = "https://api.kie.ai/api/v1/jobs";
export class SubmissionUnknownError extends Error {
  constructor() {
    super("上游受理结果待核实，请勿重复提交");
  }
}
export class ProviderRejection extends Error {}
type Fetcher = typeof fetch;
export async function createTask(
  key: string,
  body: { model: string; input: Record<string, unknown> },
  fetcher: Fetcher = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(`${base}/createTask`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    throw new SubmissionUnknownError();
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new SubmissionUnknownError();
  }
  if (response.status >= 500) throw new SubmissionUnknownError();
  if (data.code !== 200) {
    if (typeof data.code === "number" && data.code >= 400 && data.code < 500)
      throw new ProviderRejection(
        String(data.msg || "上游拒绝请求").slice(0, 300),
      );
    throw new SubmissionUnknownError();
  }
  const id = data.data?.taskId;
  if (typeof id !== "string" || !id) throw new SubmissionUnknownError();
  return id;
}
const record = z.object({
  taskId: z.string(),
  state: z.enum(["waiting", "queuing", "generating", "success", "fail"]),
  resultJson: z.string().nullable().optional(),
  failMsg: z.string().nullable().optional(),
  creditsConsumed: z.number().nullable().optional(),
});
export async function queryTask(
  key: string,
  id: string,
  fetcher: Fetcher = fetch,
) {
  const response = await fetcher(
    `${base}/recordInfo?taskId=${encodeURIComponent(id)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    },
  );
  const raw = await response.json();
  if (!response.ok || raw.code !== 200) throw new Error("任务状态查询失败");
  const data = record.parse(raw.data);
  if (data.taskId !== id) throw new Error("任务标识不匹配");
  let urls: string[] = [];
  if (data.state === "success")
    urls = z
      .object({ resultUrls: z.array(z.url()).min(1).max(10) })
      .parse(JSON.parse(data.resultJson || "{}")).resultUrls;
  return { ...data, urls };
}
