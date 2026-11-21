/* eslint-disable @next/next/no-img-element -- Private signed assets must not pass through a public image optimization cache. */
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ReactFlow,
  NodeResizer,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Download,
  ImagePlus,
  RotateCw,
  ChevronLeft,
  Check,
  Expand,
  Minus,
  Plus,
  PanelRightClose,
  PanelRightOpen,
  X,
} from "lucide-react";
import type { Asset, ProjectDetail, Generation, Settings } from "@/lib/types";
import { api } from "@/lib/client-api";
import {
  canvasDraftMatches,
  mergeCanvasDraft,
  restoreCanvasDraft,
} from "@/lib/canvas-drafts";
import { Composer, type Draft } from "./composer";
import { AgentMessage } from "./agent-message";
import type { AgentRun } from "@/lib/agent/types";
import type { AgentDraft } from "./composer";
import { ModelIcon } from "./model-icon";

type ImageData = {
  asset?: Asset;
  status: string;
  error?: string | null;
  selectedForReference: boolean;
};
type ImageNode = Node<ImageData, "image">;
function CanvasImage({ data, selected }: NodeProps<ImageNode>) {
  return (
    <div
      className={`canvas-image ${selected ? "is-selected" : ""} ${data.selectedForReference ? "pickable" : ""}`}
    >
      {data.asset ? (
        <>
          <NodeResizer
            isVisible={selected}
            keepAspectRatio
            minWidth={40}
            minHeight={40}
            maxWidth={10000}
            maxHeight={10000}
          />
          <img draggable={false} src={data.asset.url} alt="生成结果" />
          <div className="node-actions nodrag">
            <a
              aria-label="下载图片"
              href={`/api/assets/${data.asset.id}?download=1`}
            >
              <Download size={16} />
            </a>
          </div>
        </>
      ) : (
        <div
          className={`generation-placeholder ${data.status === "failed" || data.status === "submission_unknown" ? "placeholder-error" : ""}`}
        >
          <span>
            {data.status === "failed"
              ? "生成失败"
              : data.status === "submission_unknown"
                ? "待核实"
                : data.status === "persisting"
                  ? "保存中"
                  : "Generating"}
          </span>
          {data.error && <small>{data.error}</small>}
        </div>
      )}
    </div>
  );
}
const nodeTypes = { image: CanvasImage };
const activeStates = [
  "submitting",
  "pending",
  "running",
  "persisting",
  "submission_unknown",
];
function toNodes(detail: ProjectDetail, picking: boolean): ImageNode[] {
  return detail.nodes.map((n) => ({
    id: n.id,
    type: "image",
    position: { x: n.x, y: n.y },
    width: n.width,
    height: n.height,
    style: { width: n.width, height: n.height },
    data: {
      asset: n.asset_id ? detail.assets[n.asset_id] : undefined,
      status:
        detail.generations.find((g) => g.id === n.generation_id)?.status ||
        "pending",
      error: detail.generations.find((g) => g.id === n.generation_id)?.error,
      selectedForReference: picking,
    },
  }));
}
export function CanvasWorkspace({ initial }: { initial: ProjectDetail }) {
  return (
    <ReactFlowProvider>
      <Workspace initial={initial} />
    </ReactFlowProvider>
  );
}
function Workspace({ initial }: { initial: ProjectDetail }) {
  const [detail, setDetail] = useState(initial),
    [nodes, setNodes] = useState<ImageNode[]>(() => toNodes(initial, false));
  const [width, setWidth] = useState(420),
    [picking, setPicking] = useState(false),
    [reference, setReference] = useState<Asset>(),
    [restore, setRestore] = useState<Partial<Draft>>();
  const [externalSettings, setExternalSettings] =
    useState<Record<string, Settings>>();
  const [saveState, setSaveState] = useState("已保存"),
    [error, setError] = useState(""),
    [mobileTab, setMobileTab] = useState<"canvas" | "chat">("chat"),
    [collapsed, setCollapsed] = useState(false),
    [name, setName] = useState(initial.project.name),
    [editingName, setEditingName] = useState(false),
    [zoom, setZoom] = useState(initial.project.viewport.zoom),
    [busy, setBusy] = useState(false);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [agentConnection, setAgentConnection] = useState("");
  const [mode, setMode] = useState<"agent" | "image">("image");
  const pendingAgent = useRef(
    new Map<string, { draft: AgentDraft; run: AgentRun }>(),
  );
  const retryKeys = useRef(new Map<string, string>());
  const copiedNodes = useRef<ImageNode[]>([]);
  const removedNodes = useRef(new Set<string>());
  const flow = useReactFlow<ImageNode>();
  const current = useRef(initial),
    nodeRef = useRef(nodes),
    viewportRef = useRef(initial.project.viewport),
    settingsRef = useRef(initial.project.model_settings),
    revision = useRef(initial.project.revision),
    dirty = useRef(false),
    conflict = useRef(false),
    saving = useRef(false),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    mounted = useRef(true),
    history = useRef<HTMLDivElement>(null),
    firstFit = useRef(initial.nodes.some((node) => node.asset_id !== null)),
    lastCount = useRef(initial.generations.length);
  const projectId = initial.project.id,
    draftKey = `lovart-canvas:${projectId}`;
  const pendingKey = `lovart-agent-pending:${projectId}`;
  function persistPending() {
    localStorage.setItem(
      pendingKey,
      JSON.stringify([...pendingAgent.current.values()]),
    );
  }
  const save = useCallback(
    async function saveSnapshot() {
      if (!dirty.current || conflict.current || saving.current) return;
      saving.current = true;
      setSaveState("保存中…");
      const snapshot = {
        revision: revision.current,
        nodes: nodeRef.current.map((n) => ({
          id: n.id,
          ...n.position,
          width: Number(n.width || n.style?.width),
          height: Number(n.height || n.style?.height),
        })),
        viewport: viewportRef.current,
        settings: settingsRef.current,
      };
      const savedRemovals = new Set(removedNodes.current);
      dirty.current = false;
      try {
        const result = await api<{ revision: number }>(
          `/api/projects/${projectId}/canvas`,
          { method: "PUT", body: JSON.stringify(snapshot) },
        );
        revision.current = result.revision;
        for (const id of savedRemovals) removedNodes.current.delete(id);
        if (!dirty.current) {
          try {
            const local = JSON.parse(localStorage.getItem(draftKey) || "null");
            if (local && canvasDraftMatches(local, snapshot))
              localStorage.removeItem(draftKey);
          } catch {
            /* Preserve unrecognized local content. */
          }
          setSaveState("已保存");
        }
      } catch (e) {
        dirty.current = true;
        if ((e as { status?: number }).status === 409) {
          conflict.current = true;
          setSaveState("保存冲突，请刷新；本地草稿已保留");
        } else setSaveState("保存失败，本地草稿已保留");
      } finally {
        saving.current = false;
        if (dirty.current && !conflict.current)
          saveTimer.current = setTimeout(() => void saveSnapshot(), 3000);
      }
    },
    [projectId, draftKey],
  );
  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setSaveState("尚未保存");
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        revision: revision.current,
        nodes: nodeRef.current.map((n) => ({
          id: n.id,
          ...n.position,
          width: Number(n.width || n.style?.width),
          height: Number(n.height || n.style?.height),
        })),
        viewport: viewportRef.current,
        settings: settingsRef.current,
      }),
    );
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 800);
  }, [draftKey, save]);
  const refresh = useCallback(async () => {
    const next = await api<ProjectDetail>(`/api/projects/${projectId}`);
    if (!mounted.current || next.project.revision < revision.current) return;
    const previousAssets = current.current.assets;
    current.current = next;
    setDetail((old) => ({
      ...next,
      assets: { ...old.assets, ...next.assets },
    }));
    current.current.assets = { ...previousAssets, ...next.assets };
    if (dirty.current || saving.current) {
      if (!saving.current && next.project.revision !== revision.current) {
        conflict.current = true;
        setSaveState("画布已更新，请刷新；本地草稿已保留");
      }
      setNodes((old) => {
        const result = mergeCanvasDraft(
          toNodes(next, false),
          old,
          removedNodes.current,
        );
        nodeRef.current = result;
        return result;
      });
    } else {
      if (revision.current !== next.project.revision) {
        viewportRef.current = next.project.viewport;
        settingsRef.current = next.project.model_settings;
        setExternalSettings(next.project.model_settings);
        void flow.setViewport(next.project.viewport);
      }
      revision.current = next.project.revision;
      const updated = toNodes(next, false);
      nodeRef.current = updated;
      setNodes(updated);
    }
  }, [projectId, flow]);
  useEffect(() => {
    mounted.current = true;
    const saved = Number(localStorage.getItem("lovart-panel-width"));
    if (saved) {
      setWidth(Math.max(320, Math.min(620, saved)));
    }
    const local = localStorage.getItem(draftKey);
    if (local)
      try {
        const draft = JSON.parse(local);
        const serverSnapshot = {
          nodes: initial.nodes.map((n) => ({
            id: n.id,
            x: n.x,
            y: n.y,
            width: n.width,
            height: n.height,
          })),
          viewport: initial.project.viewport,
          settings: initial.project.model_settings,
        };
        if (canvasDraftMatches(draft, serverSnapshot)) {
          localStorage.removeItem(draftKey);
        } else if (draft.revision === initial.project.revision) {
          const restored = restoreCanvasDraft(
            toNodes(initial, false),
            draft.nodes,
          );
          const retained = new Set(restored.map((n) => n.id));
          for (const n of initial.nodes)
            if (!retained.has(n.id)) removedNodes.current.add(n.id);
          nodeRef.current = restored;
          setNodes(restored);
          viewportRef.current = draft.viewport;
          settingsRef.current = draft.settings;
          void flow.setViewport(draft.viewport);
          dirty.current = true;
          setSaveState("已恢复本地草稿");
          saveTimer.current = setTimeout(() => void save(), 800);
        } else {
          setError(
            "发现较旧的本地画布草稿，服务器已有更新。已保留草稿，未覆盖服务器。",
          );
        }
      } catch {}
    return () => {
      mounted.current = false;
      clearTimeout(saveTimer.current);
    };
    // Initialization runs once for the keyed project workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  useEffect(() => {
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const tasks = current.current.generations.filter(
          (g) =>
            ["submitting", "pending", "running", "persisting"].includes(
              g.status,
            ) && !(g.status === "persisting" && g.error),
        );
        for (const g of tasks)
          await api(`/api/generations/${g.id}/sync`, { method: "POST" });
        await refresh();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
      if (!cancelled)
        timer = setTimeout(
          poll,
          current.current.generations.some((g) =>
            ["submitting", "pending", "running"].includes(g.status),
          )
            ? 4000
            : 30000,
        );
    }
    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [refresh]);
  useEffect(() => {
    if (
      detail.nodes.some((node) => node.asset_id !== null) &&
      !firstFit.current
    ) {
      firstFit.current = true;
      requestAnimationFrame(
        () => void flow.fitView({ padding: 0.3, maxZoom: 1, duration: 400 }),
      );
    }
    if (detail.generations.length !== lastCount.current) {
      lastCount.current = detail.generations.length;
      history.current?.scrollTo({
        top: history.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [detail, flow]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setPicking(false);
      if (
        e.key.toLowerCase() === "c" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        document
          .querySelector<HTMLTextAreaElement>('[aria-label="生图提示词"]')
          ?.focus();
        e.preventDefault();
      }
    }
    function before(e: BeforeUnloadEvent) {
      if (dirty.current) {
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", before);
    };
  }, []);
  async function addAsset(asset: Asset) {
    if (asset.mime.startsWith("image/")) {
      await save();
      await api(`/api/projects/${projectId}/canvas`, {
        method: "POST",
        body: JSON.stringify({ assetId: asset.id, nodeId: asset.id }),
      });
    }
    await refresh();
  }
  async function sendAgent(draft: AgentDraft) {
    const optimistic: AgentRun = {
      id: draft.requestKey,
      prompt: draft.prompt,
      attachment_ids: draft.attachments.map((a) => a.id),
      skill_id: draft.skill?.id ?? null,
      skill_name: draft.skill?.name ?? null,
      status: "running",
      events: [],
      error: null,
      created_at: new Date().toISOString(),
    };
    setDetail((old) => ({
      ...old,
      assets: {
        ...old.assets,
        ...Object.fromEntries(draft.attachments.map((a) => [a.id, a])),
      },
    }));
    pendingAgent.current.set(draft.requestKey, { draft, run: optimistic });
    persistPending();
    setAgentRuns((old) => [
      ...old.filter((r) => r.id !== optimistic.id),
      optimistic,
    ]);
    try {
      await save();
      const { run } = await api<{ run: AgentRun }>(
        `/api/projects/${projectId}/agent`,
        {
          method: "POST",
          body: JSON.stringify({
            requestKey: draft.requestKey,
            prompt: draft.prompt,
            attachmentIds: optimistic.attachment_ids,
            skillId: optimistic.skill_id,
          }),
        },
      );
      pendingAgent.current.delete(draft.requestKey);
      persistPending();
      setAgentRuns((old) => [...old.filter((r) => r.id !== run.id), run]);
    } catch (e) {
      const failed: AgentRun = {
        ...optimistic,
        status: "failed",
        error: (e as Error).message,
      };
      pendingAgent.current.set(draft.requestKey, { draft, run: failed });
      persistPending();
      setAgentRuns((old) =>
        old.map((r) =>
          r.id === optimistic.id
            ? { ...r, status: "failed", error: (e as Error).message }
            : r,
        ),
      );
      throw e;
    }
  }
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    try {
      for (const item of JSON.parse(localStorage.getItem(pendingKey) || "[]")) {
        item.run.status = "failed";
        item.run.error = "消息提交状态待确认，可使用同一请求安全重试。";
        pendingAgent.current.set(item.run.id, item);
      }
    } catch {
      /* Ignore corrupt local drafts without modifying server history. */
    }
    async function applyRuns(runs: AgentRun[]) {
      if (stopped) return;
      for (const run of runs) pendingAgent.current.delete(run.id);
      persistPending();
      const combined = [
        ...runs,
        ...[...pendingAgent.current.values()].map((p) => p.run),
      ];
      setAgentRuns(combined);
      const missing = [
        ...new Set(combined.flatMap((r) => r.attachment_ids)),
      ].filter((id) => !current.current.assets[id]);
      if (missing.length) {
        const assets = await Promise.all(
          missing.map(
            async (id) =>
              (await api<{ asset: Asset }>(`/api/assets/${id}`)).asset,
          ),
        );
        if (!stopped) {
          current.current = {
            ...current.current,
            assets: {
              ...current.current.assets,
              ...Object.fromEntries(assets.map((a) => [a.id, a])),
            },
          };
          setDetail((old) => ({
            ...old,
            assets: {
              ...old.assets,
              ...Object.fromEntries(assets.map((a) => [a.id, a])),
            },
          }));
        }
      }
    }
    let source: EventSource | undefined;
    async function pollAgent() {
      try {
        const { runs } = await api<{ runs: AgentRun[] }>(
          `/api/projects/${projectId}/agent`,
        );
        await applyRuns(runs);
      } catch {
        /* Retry transient connections without discarding messages. */
      }
      if (!stopped) timer = setTimeout(pollAgent, 2000);
    }
    if (typeof EventSource !== "undefined") {
      source = new EventSource(`/api/projects/${projectId}/agent?stream=1`);
      source.onmessage = (event) => {
        setAgentConnection("");
        void applyRuns(JSON.parse(event.data).runs).catch(() => {});
      };
      source.onerror = () => {
        if (!stopped) setAgentConnection("对话连接中断，正在重连…");
      };
      source.onopen = () => {
        if (!stopped) setAgentConnection("");
      };
      // EventSource reconnects automatically; durable snapshots avoid lost deltas.
    } else void pollAgent();
    return () => {
      stopped = true;
      source?.close();
      clearTimeout(timer);
    };
    // The pending store is scoped to this keyed project workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, pendingKey]);
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.closest('input,textarea,[contenteditable="true"]') ||
        target.closest(".conversation")
      )
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const selected = nodeRef.current.filter(
          (n) => n.selected && n.data.asset,
        );
        if (!selected.length) return;
        e.preventDefault();
        const remove = new Set(selected.map((n) => n.id));
        for (const id of remove) removedNodes.current.add(id);
        nodeRef.current = nodeRef.current.filter((n) => !remove.has(n.id));
        setNodes(nodeRef.current);
        scheduleSave();
      }
    }
    function isEditing(target: EventTarget | null) {
      return (
        !(target instanceof HTMLElement) ||
        !!target.closest(
          'input,textarea,[contenteditable="true"],.conversation',
        )
      );
    }
    function copy(event: ClipboardEvent) {
      if (isEditing(event.target) || !event.clipboardData) return;
      copiedNodes.current = nodeRef.current.filter(
        (n) => n.selected && n.data.asset,
      );
      if (!copiedNodes.current.length) return;
      event.clipboardData.setData(
        "text/plain",
        `lovart-canvas:${projectId}:` +
          JSON.stringify(
            copiedNodes.current.map((n) => ({
              assetId: n.data.asset!.id,
              x: n.position.x,
              y: n.position.y,
            })),
          ),
      );
      event.preventDefault();
    }
    function paste(event: ClipboardEvent) {
      if (isEditing(event.target)) return;
      const prefix = `lovart-canvas:${projectId}:`;
      const text = event.clipboardData?.getData("text/plain") || "";
      if (!text.startsWith(prefix)) return;
      let items: { assetId: string; x: number; y: number }[];
      try {
        items = JSON.parse(text.slice(prefix.length));
        if (
          !Array.isArray(items) ||
          items.length > 100 ||
          !items.every(
            (n) =>
              typeof n.assetId === "string" &&
              Number.isFinite(n.x) &&
              Number.isFinite(n.y),
          )
        )
          return;
      } catch {
        return;
      }
      event.preventDefault();
      void (async () => {
        await save();
        for (const n of items)
          await api(`/api/projects/${projectId}/canvas`, {
            method: "POST",
            body: JSON.stringify({
              assetId: n.assetId,
              nodeId: crypto.randomUUID(),
              x: n.x + 40,
              y: n.y + 40,
            }),
          });
        await refresh();
      })().catch((e) => setError(e.message));
    }
    window.addEventListener("keydown", handleKey, true);
    window.addEventListener("copy", copy);
    window.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("copy", copy);
      window.removeEventListener("paste", paste);
    };
  }, [projectId, save, refresh, scheduleSave]);
  async function send(draft: Draft) {
    setBusy(true);
    setError("");
    try {
      await api("/api/generations", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          requestKey: draft.requestKey,
          prompt: draft.prompt,
          ...draft.settings,
          referenceAssetId: draft.reference?.id,
        }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function rename() {
    if (!name.trim()) {
      setName(detail.project.name);
      setEditingName(false);
      return;
    }
    try {
      await api(`/api/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      setEditingName(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function resize(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = e.clientX,
      startWidth = width;
    const move = (ev: PointerEvent) => {
      const value = Math.max(
        320,
        Math.min(620, startWidth + start - ev.clientX),
      );
      setWidth(value);
      localStorage.setItem("lovart-panel-width", String(value));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
  }
  const active = detail.generations.some((g) =>
    activeStates.includes(g.status),
  );
  const onReferenceUsed = useCallback(() => setReference(undefined), []);
  return (
    <main
      className={`workspace mobile-${mobileTab} ${collapsed ? "panel-collapsed" : ""}`}
      style={{ "--panel-width": `${width}px` } as React.CSSProperties}
    >
      <section className="canvas-area">
        <header className="canvas-header">
          <Link href="/protected" className="brand-mark" aria-label="返回首页">
            L°
          </Link>
          {editingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void rename();
              }}
            >
              <input
                aria-label="项目名称"
                autoFocus
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={rename}
              />
              <button aria-label="保存名称">
                <Check size={16} />
              </button>
            </form>
          ) : (
            <button
              className="project-name"
              title="重命名项目"
              onClick={() => setEditingName(true)}
            >
              {name}
            </button>
          )}
          <Link href="/projects" title="全部项目" className="icon-button">
            <ChevronLeft size={19} />
          </Link>
        </header>
        <ReactFlow<ImageNode>
          nodes={nodes.map((n) => ({
            ...n,
            data: { ...n.data, selectedForReference: picking },
          }))}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) => {
            setNodes((old) => {
              const next = changes.applyTo(old);
              nodeRef.current = next;
              return next;
            });
            if (
              changes.getByType("dimensions").some((c) => c.resizing === false)
            )
              requestAnimationFrame(scheduleSave);
          }}
          onNodeDragStop={() => scheduleSave()}
          onNodeClick={(_e, n) => {
            if ((picking || mode === "agent") && n.data.asset) {
              setReference(n.data.asset);
              setPicking(false);
              setMobileTab("chat");
            }
          }}
          defaultViewport={initial.project.viewport}
          minZoom={0.05}
          maxZoom={4}
          onMoveEnd={(_e, v: Viewport) => {
            const previous = viewportRef.current;
            viewportRef.current = v;
            setZoom(v.zoom);
            if (
              previous.x !== v.x ||
              previous.y !== v.y ||
              previous.zoom !== v.zoom
            )
              scheduleSave();
          }}
          nodesConnectable={false}
          deleteKeyCode={null}
          selectionOnDrag={!picking}
          fitView={false}
        ></ReactFlow>
        {!nodes.length && (
          <div className="canvas-empty">
            输入你的想法开始创作， 或按 <kbd>C</kbd> 开始对话
          </div>
        )}
        {picking && (
          <div className="pick-banner">
            点击画布中的一张图片作为参考图{" "}
            <button title="取消选择" onClick={() => setPicking(false)}>
              <X size={16} />
            </button>
          </div>
        )}
        <footer className="canvas-controls">
          <button aria-label="缩小" onClick={() => flow.zoomOut()}>
            <Minus size={17} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button aria-label="放大" onClick={() => flow.zoomIn()}>
            <Plus size={17} />
          </button>
          <i />
          <button
            title="适配画布"
            onClick={() =>
              flow.fitView({ padding: 0.25, maxZoom: 1, duration: 300 })
            }
          >
            <Expand size={17} />
          </button>
          <small
            className={
              saveState.includes("失败") || saveState.includes("冲突")
                ? "inline-error"
                : "muted"
            }
          >
            {saveState}
          </small>
          {(saveState.includes("冲突") ||
            saveState.includes("已更新") ||
            saveState.includes("失败")) && (
            <button
              onClick={() =>
                conflict.current ? location.reload() : void save()
              }
            >
              重试
            </button>
          )}
        </footer>
        <button
          className="panel-toggle icon-button"
          title={collapsed ? "展开对话" : "收起对话"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <PanelRightOpen size={20} />
          ) : (
            <PanelRightClose size={20} />
          )}
        </button>
      </section>
      <div
        className="panel-resizer"
        role="separator"
        aria-label="调整对话面板宽度"
        aria-orientation="vertical"
        aria-valuenow={width}
        aria-valuemin={320}
        aria-valuemax={620}
        tabIndex={0}
        onPointerDown={resize}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            const w = Math.max(
              320,
              Math.min(620, width + (e.key === "ArrowLeft" ? 20 : -20)),
            );
            setWidth(w);
            localStorage.setItem("lovart-panel-width", String(w));
          }
        }}
      />
      <aside className="conversation">
        <header className="conversation-header">
          <h2>
            {agentRuns.at(-1)?.prompt ||
              detail.generations[0]?.prompt ||
              "新对话"}
          </h2>
        </header>
        <div className="conversation-history" ref={history}>
          {agentRuns.map((run) => (
            <AgentMessage
              key={run.id}
              run={run}
              assets={detail.assets}
              onRetry={
                pendingAgent.current.has(run.id)
                  ? () =>
                      sendAgent(pendingAgent.current.get(run.id)!.draft).catch(
                        (e) => setError(e.message),
                      )
                  : undefined
              }
            />
          ))}
          {detail.generations.length === 0 && agentRuns.length === 0 ? (
            <div className="conversation-empty">开始创作</div>
          ) : (
            detail.generations.map((g) => (
              <GenerationMessage
                key={g.id}
                generation={g}
                assets={detail.assets}
                disabled={active || busy}
                onReference={(a) => setReference(a)}
                onRetry={async () => {
                  if (g.model === "gpt25") {
                    setBusy(true);
                    const retryKey =
                      retryKeys.current.get(g.id) || crypto.randomUUID();
                    retryKeys.current.set(g.id, retryKey);
                    try {
                      await api("/api/generations", {
                        method: "POST",
                        body: JSON.stringify({
                          projectId,
                          requestKey: retryKey,
                          prompt: g.prompt,
                          model: "gpt25",
                          resolution: g.config.resolution,
                          ratio: g.config.ratio,
                          referenceAssetIds: g.config.referenceAssetIds || [],
                        }),
                      });
                      retryKeys.current.delete(g.id);
                      await refresh();
                    } finally {
                      setBusy(false);
                    }
                    return;
                  }
                  setRestore({
                    prompt: g.prompt,
                    reference: g.reference_asset_id
                      ? detail.assets[g.reference_asset_id]
                      : undefined,
                    settings: { ...g.config, model: g.model },
                  });
                }}
                onSaveRetry={async () => {
                  await api(`/api/generations/${g.id}/sync`, {
                    method: "POST",
                  });
                  await refresh();
                }}
              />
            ))
          )}
        </div>
        {agentConnection && (
          <div className="workspace-alert" role="status">
            {agentConnection}
          </div>
        )}
        {error && (
          <div className="workspace-alert" role="alert">
            {error}
            <button aria-label="关闭提示" onClick={() => setError("")}>
              <X size={14} />
            </button>
          </div>
        )}
        <div className="composer-dock">
          <Composer
            projectId={projectId}
            busy={
              active || busy || agentRuns.some((r) => r.status === "running")
            }
            onAgentSend={sendAgent}
            onUploaded={addAsset}
            onModeChange={setMode}
            onSend={send}
            initialSettings={initial.project.model_settings}
            externalSettings={externalSettings}
            onSettings={(s) => {
              settingsRef.current = s;
              scheduleSave();
            }}
            selectedReference={reference}
            onReferenceUsed={onReferenceUsed}
            restoreDraft={restore}
            hasImages={nodes.some((n) => n.data.asset)}
            onPick={() => {
              setPicking(true);
              setMobileTab("canvas");
            }}
          />
        </div>
      </aside>
      <nav className="mobile-tabs">
        <button
          className={mobileTab === "canvas" ? "selected" : ""}
          onClick={() => setMobileTab("canvas")}
        >
          画布
        </button>
        <button
          className={mobileTab === "chat" ? "selected" : ""}
          onClick={() => setMobileTab("chat")}
        >
          对话
        </button>
      </nav>
    </main>
  );
}
export function GenerationMessage({
  generation: g,
  assets,
  disabled,
  onReference,
  onRetry,
  onSaveRetry,
}: {
  generation: Generation;
  assets: Record<string, Asset>;
  disabled: boolean;
  onReference: (asset: Asset) => void;
  onRetry: () => void | Promise<void>;
  onSaveRetry: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState(false),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(""),
    [waitingLong, setWaitingLong] = useState(false);
  useEffect(() => {
    const timer = setInterval(
      () => setWaitingLong(Date.now() - Date.parse(g.created_at) > 120000),
      4000,
    );
    return () => clearInterval(timer);
  }, [g.created_at]);
  const ref = g.reference_asset_id ? assets[g.reference_asset_id] : undefined;
  return (
    <article className="generation-message">
      {ref && (
        <img className="message-reference" src={ref.url} alt="本次参考图" />
      )}
      <p className="message-prompt">{g.prompt}</p>
      <div className="message-config">
        <ModelIcon model={g.model === "gpt25" ? "gpt" : g.model} size={14} />
        {g.model === "nano"
          ? "Nano Banana 2"
          : g.model === "gpt25"
            ? "GPT Image 2.5"
            : "GPT Image2"}{" "}
        · {g.config.resolution} · {g.config.ratio}
      </div>
      <div className="message-results">
        {g.outputs.map(
          (o) =>
            assets[o.asset_id] && (
              <div key={o.asset_id}>
                <img src={assets[o.asset_id].url} alt="生成结果缩略图" />
                <div className="result-actions">
                  <a
                    title="下载图片"
                    href={`/api/assets/${o.asset_id}?download=1`}
                  >
                    <Download size={16} />
                  </a>
                  <button
                    title="设为参考图"
                    onClick={() => onReference(assets[o.asset_id])}
                  >
                    <ImagePlus size={16} />
                  </button>
                </div>
              </div>
            ),
        )}
        {!g.outputs.length &&
          !["failed", "submission_unknown"].includes(g.status) && (
            <div className="message-skeleton" />
          )}
      </div>
      {g.error && <p className="inline-error">{g.error}</p>}
      {saveError && <p className="inline-error">{saveError}</p>}
      {g.status === "persisting" && g.error && (
        <button
          className="retry-button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            setSaveError("");
            try {
              await onSaveRetry();
            } catch (e) {
              setSaveError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "保存中…" : "重试保存，不重新生图"}
        </button>
      )}
      {["succeeded", "failed"].includes(g.status) && (
        <div className="regenerate">
          <button
            title="重新生成"
            disabled={disabled || saving}
            onClick={() => setConfirm(!confirm)}
          >
            <RotateCw size={16} />
            重新生成
          </button>
          {confirm && (
            <div className="retry-confirm">
              将复用本次输入，发送后可能再次计费。
              <button
                disabled={disabled || saving}
                onClick={async () => {
                  setSaving(true);
                  setSaveError("");
                  try {
                    await onRetry();
                    setConfirm(false);
                  } catch (e) {
                    setSaveError((e as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving
                  ? "提交中…"
                  : g.model === "gpt25"
                    ? "确认使用 GPT Image 2.5 重新生成"
                    : "填入输入框"}
              </button>
            </div>
          )}
        </div>
      )}
      {["pending", "running"].includes(g.status) && waitingLong && (
        <small className="muted">仍在处理，离开后可回来继续查看。</small>
      )}
    </article>
  );
}
