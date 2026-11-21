"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
export function LoginForm() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(
      params.has("error") ? "验证链接已失效，请重新登录或检查邮箱确认状态" : "",
    ),
    [signup, setSignup] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const fields = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: fields.get("email"),
          password: fields.get("password"),
          action: signup ? "signup" : "login",
          next: params.get("next") || "/protected",
        }),
      });
      const data = await res.json();
      if (data.redirect) window.location.assign(data.redirect);
      else setMessage(data.error || data.message);
    } catch {
      setMessage("网络连接失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark">L°</div>
        <h1>开始你的创作</h1>
        <p className="muted">你的 AI 设计工作台</p>
        <label>
          邮箱
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="你的邮箱"
          />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        {message && <p role="status">{message}</p>}
        <button className="primary" disabled={busy}>
          {busy ? "处理中…" : signup ? "注册账户" : "登录"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setSignup(!signup);
            setMessage("");
          }}
        >
          {signup ? "已有账户，返回登录" : "首次使用？注册账户"}
        </button>
        <small className="muted">
          新账号赠送 5 积分，每张图片消耗 1 积分。明确失败自动退回，暂不支持充值。
        </small>
      </form>
    </main>
  );
}
