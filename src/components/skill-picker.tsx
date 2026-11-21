"use client";
import { useRef, useState, useEffect } from "react";
import { Sparkles, Upload, X } from "lucide-react";
import { api } from "@/lib/client-api";
import type { SkillInfo } from "@/lib/skills-parser";
export function SkillPicker({
  projectId,
  selected,
  onSelect,
  disabled,
  onBusy,
}: {
  projectId: string;
  selected?: SkillInfo;
  onSelect: (skill?: SkillInfo) => void;
  disabled?: boolean;
  onBusy: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false),
    [skills, setSkills] = useState<SkillInfo[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function close(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, []);
  async function show() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const data = await api<{ skills: SkillInfo[] }>(
        `/api/projects/${projectId}/skills`,
      );
      setSkills(data.skills);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function upload(f?: File) {
    if (!f) return;
    setLoading(true);
    onBusy(true);
    setError("");
    try {
      if (f.name !== "SKILL.md") throw Error("请选择名为 SKILL.md 的文件");
      if (f.size > 65536) throw Error("SKILL.md 最大 64 KiB");
      const data = await api<{ skill: SkillInfo }>(
        `/api/projects/${projectId}/skills`,
        {
          method: "POST",
          headers: { "Content-Type": "text/markdown; charset=utf-8" },
          body: f,
        },
      );
      setSkills((old) =>
        [...old, data.skill].sort((a, b) => a.name.localeCompare(b.name)),
      );
      onSelect(data.skill);
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      onBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  async function remove(s: SkillInfo) {
    setLoading(true);
    onBusy(true);
    setError("");
    try {
      await api(`/api/projects/${projectId}/skills/${s.id}`, {
        method: "DELETE",
      });
      setSkills((old) => old.filter((x) => x.id !== s.id));
      if (selected?.id === s.id) onSelect(undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      onBusy(false);
    }
  }
  return (
    <div className="skill-picker" ref={root}>
      <input
        type="file"
        hidden
        accept=".md"
        ref={file}
        onChange={(e) => void upload(e.target.files?.[0])}
      />
      <button
        className="attachment-trigger"
        disabled={disabled || loading}
        onClick={() => void show()}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Sparkles size={16} />
        Skill
      </button>
      {open && (
        <div className="popover skill-menu" role="dialog" aria-label="项目技能">
          <div className="skill-menu-heading">
            <strong>项目技能</strong>
            <button
              disabled={loading || disabled}
              onClick={() => file.current?.click()}
            >
              <Upload size={15} />
              上传 SKILL.md
            </button>
          </div>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {loading && <p className="muted">处理中…</p>}
          {!loading && !skills.length && !error && (
            <p className="muted">上传技能，为本次对话选择工作流程。</p>
          )}
          <div className="skill-list">
            {skills.map((s) => (
              <div className="skill-row" key={s.id}>
                <button
                  className="skill-option"
                  disabled={loading || disabled}
                  aria-pressed={selected?.id === s.id}
                  onClick={() => {
                    onSelect(s);
                    setOpen(false);
                  }}
                >
                  <strong>{s.name}</strong>
                  <span className="skill-description" title={s.description}>
                    {s.description}
                  </span>
                </button>
                <button
                  className="skill-remove"
                  disabled={loading || disabled}
                  aria-label={`移除技能 ${s.name}`}
                  onClick={() => void remove(s)}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
