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
  const [menu, setMenu] = useState<"reference" | "config" | "model" | null>(
      null,
    ),
    [uploading, setUploading] = useState(false),
    [sending, setSending] = useState(false),
    [error, setError] = useState("");
  const [recoveringReference, setRecoveringReference] = useState(false),
    [pendingReferenceId, setPendingReferenceId] = useState<string>(),
    [referenceError, setReferenceError] = useState("");
  const recoveryVersion = useRef(0),
    consumedRestore = useRef<Partial<Draft>>(undefined);
  const editingLocked = !ready || sending || uploading || recoveringReference;
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
    const stored = localStorage.getItem(storageKey);
    if (stored)
      try {
        const draft = JSON.parse(stored);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- Restore browser storage after hydration.
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
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Consume an explicit selection from the external canvas.
      setReference(selectedReference);
      setPendingReferenceId(undefined);
      setReferenceError("");
      let stored = {};
      try {
        stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
      } catch {}
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ...stored, referenceId: selectedReference.id }),
      );
      onReferenceUsed?.();
      setMenu(null);
    }
  }, [selectedReference, onReferenceUsed, storageKey, editingLocked]);
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
  }, [props.restoreDraft, editingLocked]);
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
      setReference(data.asset);
      remember(prompt, data.asset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }
  async function send() {
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
      className={`composer ${props.home ? "composer-home" : ""}`}
    >
      <input
        hidden
        disabled={editingLocked}
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      {!props.home && (
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
      {!valid && (
        <p className="inline-error">
          当前分辨率不支持 {config.ratio}，请选择其他比例。
        </p>
      )}
      <div className="composer-toolbar">
        {props.home ? (
          <button
            className="icon-button"
            title="上传参考图"
            disabled={editingLocked}
            onClick={() => file.current?.click()}
          >
            {uploading ? <span className="spinner" /> : <Plus size={25} />}
          </button>
        ) : (
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
        )}
        <div className="toolbar-spacer" />
        {!props.home && (
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
            !valid
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
