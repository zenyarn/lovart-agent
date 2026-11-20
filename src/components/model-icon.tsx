"use client";
import { OpenAI, NanoBanana } from "@lobehub/icons";
import type { Model } from "@/lib/models";
export function ModelIcon({
  model,
  size = 23,
}: {
  model: Model;
  size?: number;
}) {
  return model === "gpt" ? <OpenAI size={size} /> : <NanoBanana size={size} />;
}
