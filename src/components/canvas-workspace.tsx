/* eslint-disable @next/next/no-img-element -- Private signed assets must not pass through a public image optimization cache. */
"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ReactFlow,
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
import { Composer, type Draft } from "./composer";
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
  const save = useCallback(
    async function saveSnapshot() {
      if (!dirty.current || conflict.current || saving.current) return;
      saving.current = true;
      setSaveState("保存中…");
      const snapshot = {
        revision: revision.current,
        nodes: nodeRef.current.map((n) => ({ id: n.id, ...n.position })),
        viewport: viewportRef.current,
        settings: settingsRef.current,
      };
      dirty.current = false;
      try {
        const result = await api<{ revision: number }>(
          `/api/projects/${projectId}/canvas`,
          { method: "PUT", body: JSON.stringify(snapshot) },
        );
        revision.current = result.revision;
        if (!dirty.current) {
          if (localStorage.getItem(draftKey) === JSON.stringify(snapshot))
            localStorage.removeItem(draftKey);
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
        nodes: nodeRef.current.map((n) => ({ id: n.id, ...n.position })),
        viewport: viewportRef.current,
        settings: settingsRef.current,
      }),
    );
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), 800);
  }, [draftKey, save]);
  const refresh = useCallback(async () => {
    const next = await api<ProjectDetail>(`/api/projects/${projectId}`);
    if (!mounted.current) return;
    current.current = next;
    setDetail(next);
    if (dirty.current || saving.current) {
      if (!saving.current && next.project.revision !== revision.current) {
        conflict.current = true;
        setSaveState("画布已更新，请刷新；本地草稿已保留");
      }
      setNodes((old) => {
        const local = new Map(old.map((n) => [n.id, n]));
        const result = toNodes(next, false).map((n) =>
          local.has(n.id)
            ? {
                ...n,
                position: local.get(n.id)!.position,
                selected: local.get(n.id)!.selected,
              }
            : n,
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Browser-only preference restored after hydration.
      setWidth(Math.max(320, Math.min(620, saved)));
    }
    const local = localStorage.getItem(draftKey);
    if (local)
      try {
        const draft = JSON.parse(local);
        if (draft.revision === initial.project.revision) {
          const positions = new Map<string, { x: number; y: number }>(
            draft.nodes.map((n: { id: string; x: number; y: number }) => [
              n.id,
              { x: n.x, y: n.y },
            ]),
          );
          const restored = toNodes(initial, false).map((n) => ({
            ...n,
            position: positions.get(n.id) || n.position,
          }));
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
          }}
          onNodeDragStop={() => scheduleSave()}
          onNodeClick={(_e, n) => {
            if (picking && n.data.asset) {
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
          <h2>{detail.generations[0]?.prompt || "新对话"}</h2>
        </header>
        <div className="conversation-history" ref={history}>
          {detail.generations.length === 0 ? (
            <div className="conversation-empty">开始创作</div>
          ) : (
            detail.generations.map((g) => (
              <GenerationMessage
                key={g.id}
                generation={g}
                assets={detail.assets}
                disabled={active || busy}
                onReference={(a) => setReference(a)}
                onRetry={() => {
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
            busy={active || busy}
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
function GenerationMessage({
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
  onRetry: () => void;
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
        <ModelIcon model={g.model} size={14} />
        {g.model === "nano" ? "Nano Banana 2" : "GPT Image2"} ·{" "}
        {g.config.resolution} · {g.config.ratio}
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
            disabled={disabled}
            onClick={() => setConfirm(!confirm)}
          >
            <RotateCw size={16} />
            重新生成
          </button>
          {confirm && (
            <div className="retry-confirm">
              将复用本次输入，发送后可能再次计费。
              <button
                onClick={() => {
                  onRetry();
                  setConfirm(false);
                }}
              >
                填入输入框
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
