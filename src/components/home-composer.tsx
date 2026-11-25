"use client";
import { Composer, type Draft } from "./composer";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";
export function HomeComposer({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  useEffect(() => {
    const last = Number(sessionStorage.getItem("lovart-cleanup"));
    if (Date.now() - last > 3600000) {
      api("/api/assets/cleanup", { method: "POST" })
        .then(() =>
          sessionStorage.setItem("lovart-cleanup", String(Date.now())),
        )
        .catch(() => {});
    }
  }, []);
  async function send(draft: Draft) {
    let projectId = localStorage.getItem(
      `lovart-request-project:${draft.requestKey}`,
    );
    if (!projectId) {
      projectId = crypto.randomUUID();
      localStorage.setItem(
        `lovart-request-project:${draft.requestKey}`,
        projectId,
      );
    }
    const result = await api<{ projectId: string }>("/api/generations", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        requestKey: draft.requestKey,
        prompt: draft.prompt,
        ...draft.settings,
        referenceAssetId: draft.reference?.id,
        editing: draft.editing,
        newProject: true,
      }),
    });
    localStorage.removeItem(`lovart-request-project:${draft.requestKey}`);
    router.push(`/canvas?projectId=${result.projectId}`);
  }
  return <Composer home ownerId={ownerId} onSend={send} />;
}
