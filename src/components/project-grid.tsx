/* eslint-disable @next/next/no-img-element -- Private signed assets must not pass through a public image optimization cache. */
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ArrowRight, LogOut } from "lucide-react";
import { api } from "@/lib/client-api";
import type { Project } from "@/lib/types";
export function Logout() {
  const router = useRouter();
  return (
    <button
      className="icon-button"
      title="退出登录"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut size={20} />
    </button>
  );
}
export function ProjectGrid({
  initial,
  home = false,
  hasMore: initialMore = false,
}: {
  initial: Project[];
  home?: boolean;
  hasMore?: boolean;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initial),
    [more, setMore] = useState(initialMore),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      router.push(`/canvas?projectId=${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  async function load() {
    setBusy(true);
    try {
      const data = await api<{ projects: Project[]; hasMore: boolean }>(
        `/api/projects?offset=${projects.length}`,
      );
      setProjects((p) => [
        ...p,
        ...data.projects.filter((n) => !p.some((v) => v.id === n.id)),
      ]);
      setMore(data.hasMore);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="projects-section">
      {home && (
        <div className="section-heading">
          <h2>最近项目</h2>
          <Link className="muted" href="/projects">
            查看全部 <ArrowRight size={18} />
          </Link>
        </div>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <div className="project-grid">
        <button
          className="project-card new-project"
          disabled={busy}
          onClick={create}
        >
          <div className="project-cover">
            <Plus size={30} />
          </div>
          <h3>新建项目</h3>
        </button>
        {projects.map((p) => (
          <Link
            href={`/canvas?projectId=${p.id}`}
            className="project-card"
            key={p.id}
          >
            <div className="project-cover">
              {p.cover && <img src={p.cover.url} alt={p.name} />}
            </div>
            <h3>{p.name}</h3>
            <p>更新于 {new Date(p.updated_at).toLocaleDateString("zh-CN")}</p>
          </Link>
        ))}
      </div>
      {!home && more && (
        <button className="load-more" onClick={load} disabled={busy}>
          {busy ? "加载中…" : "加载更多"}
        </button>
      )}
    </section>
  );
}
