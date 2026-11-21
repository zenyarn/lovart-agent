import { createModels } from "@earendil-works/pi-ai";
import { moonshotaiCnProvider } from "@earendil-works/pi-ai/providers/moonshotai-cn";
import { kimiCodingProvider } from "@earendil-works/pi-ai/providers/kimi-coding";
export function kimiConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  if (!env.KIMI_API_KEY?.trim()) throw new Error("Kimi 尚未配置");
  const url = new URL(env.KIMI_BASE_URL || "https://api.kimi.com/coding/");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Kimi 地址必须是 HTTPS API 地址");
  url.pathname = url.pathname.replace(/\/$/, "");
  if (!url.pathname.endsWith("/v1")) url.pathname += "/v1";
  const coding = url.pathname.includes("/coding");
  const models = createModels();
  models.setProvider(coding ? kimiCodingProvider() : moonshotaiCnProvider());
  const registered = models.getModel(
    coding ? "kimi-coding" : "moonshotai-cn",
    env.KIMI_MODEL || (coding ? "kimi-for-coding" : "kimi-k3.1-pro"),
  );
  if (!registered) throw new Error("不支持的 Kimi 模型");
  return {
    models,
    model: { ...registered, baseUrl: url.toString().replace(/\/$/, "") },
    apiKey: env.KIMI_API_KEY,
  };
}
