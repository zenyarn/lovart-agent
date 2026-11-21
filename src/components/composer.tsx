/* eslint-disable @next/next/no-img-element -- Private signed assets must not pass through a public image optimization cache. */
"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUp,
  Plus,
  ImagePlus,
  ChevronDown,
  X,
  Upload,
  MousePointer2,
  Check,
} from "lucide-react";
import { ModelIcon } from "./model-icon";
import { allowedRatios, type Model, type Resolution } from "@/lib/models";
import type { Asset, Settings } from "@/lib/types";
import { api } from "@/lib/client-api";

import { SkillPicker } from "./skill-picker";
import type { SkillInfo } from "@/lib/skills-parser";

export type AgentDraft = {
  skill?: SkillInfo;
  prompt: string;
  attachments: Asset[];
  requestKey: string;
};
export type Draft = {
  prompt: string;
  reference?: Asset;
  settings: Settings;
  requestKey: string;
};
type Props = {
  projectId?: string;
  ownerId?: string;
  busy?: boolean;
  home?: boolean;
  selectedReference?: Asset;
  onReferenceUsed?: () => void;
  onPick?: () => void;
  hasImages?: boolean;
  onSend: (draft: Draft) => Promise<void>;
  onAgentSend?: (draft: AgentDraft) => Promise<void>;
  onUploaded?: (asset: Asset) => Promise<void>;
  onModeChange?: (mode: "agent" | "image") => void;
  initialSettings?: Record<string, Settings>;
  externalSettings?: Record<string, Settings>;
  onSettings?: (settings: Record<string, Settings>) => void;
  restoreDraft?: Partial<Draft>;
};
const defaults: Record<Model, Settings> = {
  nano: { model: "nano", resolution: "1K", ratio: "1:1" },
  gpt: { model: "gpt", resolution: "1K", ratio: "1:1", background: "auto" },
};
export function Composer(props: Props) {
  const { selectedReference, onReferenceUsed } = props;
  const [mode, setMode] = useState<"agent" | "image">("image");
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo>();
  const [skillBusy, setSkillBusy] = useState(false);
  const [attachments, setAttachments] = useState<Asset[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Keep server-rendered controls inert until event handlers are installed.
    setReady(true);
  }, []);
  const [prompt, setPrompt] = useState(""),
    [reference, setReference] = useState<Asset>(),
    [model, setModel] = useState<Model>("nano");
  const [configs, setConfigs] = useState({
    ...defaults,
    ...props.initialSettings,
  });
  const [menu, setMenu] = useState<
      "reference" | "config" | "model" | "mode" | null
    >(null),
    [uploading, setUploading] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState("");
  const [recoveringReference, setRecoveringReference] = useState(false),
    [pendingReferenceId, setPendingReferenceId] = useState<string>(),
    [referenceError, setReferenceError] = useState("");
  const recoveryVersion = useRef(0),
    consumedRestore = useRef<Partial<Draft>>(undefined);
  const editingLocked =
    !ready || sending || uploading || recoveringReference || skillBusy;
  const recoverReference = useCallback(async (id: string) => {
    const version = ++recoveryVersion.current;
    setPendingReferenceId(id);
    setRecoveringReference(true);
    setReferenceError("");
    try {
      const data = await api<{ asset: Asset }>(`/api/assets/${id}`);
      if (version !== recoveryVersion.current) return;
      setReference(data.asset);
      setPendingReferenceId(undefined);
    } catch {
      if (version === recoveryVersion.current)
        setReferenceError("参考图恢复失败，请重试或明确移除后再发送。");
    } finally {
      if (version === recoveryVersion.current) setRecoveringReference(false);
    }
  }, []);
  const file = useRef<HTMLInputElement>(null),
    textarea = useRef<HTMLTextAreaElement>(null),
    root = useRef<HTMLDivElement>(null),
    requestKey = useRef("");
  const config = configs[model],
    valid = allowedRatios(model, config.resolution).includes(config.ratio),
    storageKey = `lovart-draft:${props.projectId || `home:${props.ownerId || "local"}`}`;
  useEffect(() => {
    const rememberedMode = localStorage.getItem(`${storageKey}:mode`);
    if (rememberedMode === "agent" && props.onAgentSend) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore browser mode preference after hydration.
      setMode("agent");
      props.onModeChange?.("agent");
    }
    const stored = localStorage.getItem(storageKey);
    if (stored)
      try {
        const draft = JSON.parse(stored);
        setPrompt(draft.prompt || "");
        requestKey.current = draft.requestKey || "";
        if (draft.model === "nano" || draft.model === "gpt")
          setModel(draft.model);
        if (draft.configs) setConfigs({ ...defaults, ...draft.configs });
        if (draft.referenceId) void recoverReference(draft.referenceId);
      } catch {}
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- This counter invalidates async requests, not a DOM ref.
      recoveryVersion.current++;
    };
    // Restore mode once for this project, not on parent callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, recoverReference]);
  useEffect(() => {
    if (props.externalSettings && !requestKey.current) {
      setConfigs({ ...defaults, ...props.externalSettings });
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            ...stored,
            configs: { ...defaults, ...props.externalSettings },
          }),
        );
      } catch {}
    }
  }, [props.externalSettings, storageKey]);
  useEffect(() => {
    if (selectedReference && !editingLocked) {
      if (mode === "agent")
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Consume an explicit external canvas selection.
        setAttachments((old) =>
          old.some((a) => a.id === selectedReference.id)
            ? old
            : [...old, selectedReference].slice(0, 20),
        );
      else setReference(selectedReference);
      setPendingReferenceId(undefined);
      setReferenceError("");
      if (mode === "image") {
        let stored = {};
        try {
          stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
        } catch {}
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...stored, referenceId: selectedReference.id }),
        );
      }
      onReferenceUsed?.();
      setMenu(null);
    }
  }, [selectedReference, onReferenceUsed, storageKey, editingLocked, mode]);
  useEffect(() => {
    if (
      props.restoreDraft &&
      !editingLocked &&
      props.restoreDraft !== consumedRestore.current
    ) {
      consumedRestore.current = props.restoreDraft;
      if (props.restoreDraft.prompt !== undefined)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore history only after an explicit retry action.
        setPrompt(props.restoreDraft.prompt);
      setMode("image");
      props.onModeChange?.("image");
      localStorage.setItem(`${storageKey}:mode`, "image");
      setReference(props.restoreDraft.reference);
      setPendingReferenceId(undefined);
      setReferenceError("");
      if (props.restoreDraft.settings) {
        setModel(props.restoreDraft.settings.model);
        setConfigs((c) => ({
          ...c,
          [props.restoreDraft!.settings!.model]: props.restoreDraft!.settings!,
        }));
      }
      requestKey.current = "";
      textarea.current?.focus();
    }
    // Explicit history restore should not repeat on callback identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.restoreDraft, editingLocked, storageKey]);
  useEffect(() => {
    function close(e: MouseEvent) {
      if (root.current && !root.current.contains(e.target as Node))
        setMenu(null);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, []);
  function remember(
    text: string,
    ref: Asset | undefined,
    nextConfigs = configs,
    nextModel = model,
  ) {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        prompt: text,
        referenceId: ref?.id || pendingReferenceId,
        configs: nextConfigs,
        model: nextModel,
        requestKey: requestKey.current,
      }),
    );
  }
  function changeConfig(patch: Partial<Settings>) {
    const next = { ...configs, [model]: { ...config, ...patch } };
    setConfigs(next);
    remember(prompt, reference, next);
    props.onSettings?.(next);
  }
  async function uploadMany(files: File[]) {
    if (editingLocked || props.busy) return;
    for (const f of files.slice(0, 20 - attachments.length)) await upload(f);
  }
  async function upload(f?: File) {
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setError("参考图最大 10 MiB");
      return;
    }
    setUploading(true);
    setError("");
    setMenu(null);
    try {
      const body = new FormData();
      body.set("file", f);
      if (props.projectId) body.set("projectId", props.projectId);
      const data = await api<{ asset: Asset }>("/api/assets", {
        method: "POST",
        body,
      });
      if (mode === "agent")
        setAttachments((old) => [...old, data.asset].slice(0, 20));
      else {
        setReference(data.asset);
        remember(prompt, data.asset);
      }
      await props.onUploaded?.(data.asset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }
  async function send() {
    if (mode === "agent" && props.onAgentSend) {
      if (!prompt.trim() || editingLocked || props.busy) return;
      const draft = {
        prompt: prompt.trim(),
        attachments,
        skill: selectedSkill,
        requestKey: crypto.randomUUID(),
      };
      setPrompt("");
      setAttachments([]);
      setSelectedSkill(undefined);
      setReference(undefined);
      setError("");
      setMenu(null);
      setSending(true);
      localStorage.removeItem(storageKey);
      try {
        await props.onAgentSend(draft);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSending(false);
      }
      return;
    }
    if (
      !prompt.trim() ||
      editingLocked ||
      pendingReferenceId ||
      props.busy ||
      !valid
    )
      return;
    setSending(true);
    setError("");
    requestKey.current ||= crypto.randomUUID();
    remember(prompt, reference);
    try {
      await props.onSend({
        prompt: prompt.trim(),
        reference,
        settings: config,
        requestKey: requestKey.current,
      });
      setPrompt("");
      setReference(undefined);
      requestKey.current = "";
      localStorage.removeItem(storageKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }
  return (
    <div
      inert={editingLocked}
      ref={root}
      onDragOver={(e) => {
        if (mode === "agent") e.preventDefault();
      }}
      onDrop={(e) => {
        if (mode === "agent") {
          e.preventDefault();
          void uploadMany(Array.from(e.dataTransfer.files));
        }
      }}
      onPaste={(e) => {
        if (mode === "agent" && e.clipboardData.files.length) {
          e.preventDefault();
          void uploadMany(Array.from(e.clipboardData.files));
        }
      }}
      className={`composer ${props.home ? "composer-home" : ""}`}
    >
      <input
        hidden
        disabled={editingLocked}
        ref={file}
        type="file"
        accept={
          mode === "agent"
            ? "image/png,image/jpeg,image/webp,.md,.markdown"
            : "image/png,image/jpeg,image/webp"
        }
        multiple={mode === "agent"}
        onChange={(e) =>
          mode === "agent"
            ? void uploadMany(Array.from(e.target.files || []))
            : void upload(e.target.files?.[0])
        }
      />
      {mode === "agent" && (
        <div className="agent-attachments">
          {selectedSkill && (
            <div className="selected-skill">
              <span title={selectedSkill.description}>
                Skill · {selectedSkill.name}
              </span>
              <button
                aria-label="取消所选技能"
                onClick={() => setSelectedSkill(undefined)}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {attachments.map((a, i) => (
            <div className="attachment-chip" key={a.id}>
              <a
                href={`/api/assets/${a.id}?preview=1`}
                target="_blank"
                rel="noreferrer"
              >
                {a.mime.startsWith("image/") ? (
                  <>
                    <img
                      src={a.url}
                      alt={`图${attachments.slice(0, i + 1).filter((x) => x.mime.startsWith("image/")).length}`}
                    />
                    <span>
                      图
                      {
                        attachments
                          .slice(0, i + 1)
                          .filter((x) => x.mime.startsWith("image/")).length
                      }
                    </span>
                  </>
                ) : (
                  <span title={a.name}>{a.name || "Markdown 文件"}</span>
                )}
              </a>
              <button
                title="移除附件"
                onClick={() =>
                  setAttachments((old) => old.filter((x) => x.id !== a.id))
                }
              >
                <X size={14} />
              </button>
              <a aria-label="下载附件" href={`/api/assets/${a.id}?download=1`}>
                ↓
              </a>
            </div>
          ))}
        </div>
      )}
      {!props.home && mode === "image" && (
        <div className="reference-row">
          {reference && (
            <div className="reference-thumb">
              <img src={reference.url} alt="参考图" />
              <button
                title="移除参考图"
                disabled={editingLocked}
                onClick={() => {
                  setReference(undefined);
                  remember(prompt, undefined);
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <button
            className="reference-trigger"
            disabled={editingLocked || props.busy}
            onClick={() => setMenu(menu === "reference" ? null : "reference")}
          >
            <ImagePlus size={22} />
            <span>{uploading ? "上传中…" : "参考图"}</span>
          </button>
        </div>
      )}
      {props.home && reference && (
        <div className="reference-thumb">
          <img src={reference.url} alt="参考图" />
          <button
            title="移除参考图"
            disabled={editingLocked}
            onClick={() => {
              setReference(undefined);
              remember(prompt, undefined);
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <textarea
        disabled={editingLocked}
        ref={textarea}
        aria-label="生图提示词"
        placeholder={
          props.home
            ? "让 Lovart 创建一个温馨的咖啡厅风格菜单海报"
            : "今天我们要创作什么"
        }
        value={prompt}
        maxLength={20000}
        onChange={(e) => {
          setPrompt(e.target.value);
          remember(e.target.value, reference);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
      />
      {recoveringReference && <p className="muted">正在恢复参考图…</p>}
      {referenceError && (
        <div className="inline-error" role="alert">
          {referenceError}
          <button
            onClick={() =>
              pendingReferenceId && void recoverReference(pendingReferenceId)
            }
          >
            重试恢复参考图
          </button>
          <button
            onClick={() => {
              setPendingReferenceId(undefined);
              setReferenceError("");
              try {
                const stored = JSON.parse(
                  localStorage.getItem(storageKey) || "{}",
                );
                delete stored.referenceId;
                localStorage.setItem(storageKey, JSON.stringify(stored));
              } catch {}
            }}
          >
            移除未恢复参考图
          </button>
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {mode === "image" && !valid && (
        <p className="inline-error">
          当前分辨率不支持 {config.ratio}，请选择其他比例。
        </p>
      )}
      <div className="composer-toolbar">
        {!props.home && props.onAgentSend && (
          <button
            className="mode-trigger"
            aria-label={`模式：${mode === "agent" ? "Agent" : "生图"}`}
            aria-haspopup="menu"
            aria-expanded={menu === "mode"}
            disabled={editingLocked || props.busy}
            onClick={() => setMenu(menu === "mode" ? null : "mode")}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setMenu("mode");
                requestAnimationFrame(() =>
                  root.current
                    ?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')
                    ?.focus(),
                );
              }
            }}
          >
            {mode === "agent" ? "Agent" : "生图"}
            <ChevronDown size={14} />
          </button>
        )}
        {mode === "agent" && (
          <>
            <span className="agent-planning">Agent自动规划</span>
            <button
              className="attachment-trigger"
              disabled={editingLocked || props.busy}
              onClick={() => file.current?.click()}
            >
              <Plus size={16} />
              附件
            </button>
            {props.projectId && (
              <SkillPicker
                projectId={props.projectId}
                selected={selectedSkill}
                onSelect={setSelectedSkill}
                disabled={editingLocked || props.busy}
                onBusy={setSkillBusy}
              />
            )}
          </>
        )}

        {props.home ? (
          <button
            className="icon-button"
            title="上传参考图"
            disabled={editingLocked}
            onClick={() => file.current?.click()}
          >
            {uploading ? <span className="spinner" /> : <Plus size={25} />}
          </button>
        ) : mode === "image" ? (
          <>
            <span className="image-mode">
              <ImagePlus size={20} />
              图像
            </span>
            <button
              className="config-trigger"
              disabled={editingLocked}
              aria-expanded={menu === "config"}
              onClick={() => setMenu(menu === "config" ? null : "config")}
            >
              {config.resolution} · {config.ratio}
              {model === "gpt" &&
              config.resolution === "1K" &&
              config.background === "transparent"
                ? " · 透明"
                : ""}
              <ChevronDown size={14} />
            </button>
          </>
        ) : null}
        <div className="toolbar-spacer" />
        {!props.home && mode === "image" && (
          <button
            className="icon-button model-trigger"
            disabled={editingLocked}
            title="切换生图模型"
            onClick={() => setMenu(menu === "model" ? null : "model")}
          >
            <ModelIcon model={model} />
          </button>
        )}
        <button
          className="send-button"
          aria-label="发送生成请求"
          disabled={
            !prompt.trim() ||
            editingLocked ||
            !!pendingReferenceId ||
            props.busy ||
            (mode === "image" && !valid)
          }
          onClick={send}
        >
          {sending || props.busy ? (
            <span className="spinner" />
          ) : (
            <ArrowUp size={23} />
          )}
        </button>
      </div>
      {menu === "mode" && (
        <div
          className="popover mode-menu"
          role="menu"
          aria-label="选择模式"
          onKeyDown={(e) => {
            const items = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
            );
            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              items[
                (index + (e.key === "ArrowDown" ? 1 : items.length - 1)) %
                  items.length
              ]?.focus();
            }
            if (e.key === "Escape") {
              setMenu(null);
              root.current
                ?.querySelector<HTMLButtonElement>(".mode-trigger")
                ?.focus();
            }
          }}
        >
          {(["agent", "image"] as const).map((m) => (
            <button
              key={m}
              role="menuitemradio"
              aria-checked={mode === m}
              ref={(el) => {
                if (el && mode === m) el.focus();
              }}
              onClick={() => {
                setMode(m);
                localStorage.setItem(`${storageKey}:mode`, m);
                props.onModeChange?.(m);
                setMenu(null);
              }}
            >
              {m === "agent" ? "Agent" : "生图"}
            </button>
          ))}
        </div>
      )}
      {menu === "reference" && (
        <div className="popover reference-menu">
          <button onClick={() => file.current?.click()}>
            <Upload size={18} />
            从本地上传图片
          </button>
          <button
            disabled={!props.hasImages}
            title={!props.hasImages ? "画布中尚无图片" : undefined}
            onClick={() => {
              setMenu(null);
              props.onPick?.();
            }}
          >
            <MousePointer2 size={18} />
            从画布选择
          </button>
        </div>
      )}
      {menu === "model" && (
        <div className="popover model-menu">
          {(["nano", "gpt"] as Model[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setModel(m);
                remember(prompt, reference, configs, m);
                setMenu(null);
              }}
            >
              <ModelIcon model={m} />
              {m === "nano" ? "Nano Banana 2" : "GPT Image2"}
              {model === m && <Check size={17} />}
            </button>
          ))}
        </div>
      )}
      {menu === "config" && (
        <div className="popover config-popover">
          <h3>分辨率</h3>
          <div className="resolution-options">
            {(["1K", "2K", "4K"] as Resolution[]).map((r) => (
              <button
                className={r === config.resolution ? "selected" : ""}
                key={r}
                onClick={() =>
                  changeConfig({
                    resolution: r,
                    ...(r !== "1K" ? { background: undefined } : {}),
                  })
                }
              >
                {r}
              </button>
            ))}
          </div>
          <h3>图片比例</h3>
          <div className="ratio-options">
            {allowedRatios(model, config.resolution).map((r) => (
              <button
                key={r}
                className={r === config.ratio ? "selected" : ""}
                onClick={() => changeConfig({ ratio: r })}
              >
                <span
                  className="ratio-symbol"
                  style={{
                    aspectRatio: r === "auto" ? "1" : r.replace(":", "/"),
                  }}
                />
                {r === "auto" ? "自动" : r}
              </button>
            ))}
          </div>
          {model === "gpt" && config.resolution === "1K" && (
            <>
              <h3>背景</h3>
              <div className="resolution-options">
                {(["auto", "opaque", "transparent"] as const).map((b, i) => (
                  <button
                    key={b}
                    className={config.background === b ? "selected" : ""}
                    onClick={() => changeConfig({ background: b })}
                  >
                    {["自动", "不透明", "透明"][i]}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
