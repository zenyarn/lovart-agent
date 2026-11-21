"use client";
import { useEffect, useState } from "react";
export function CreditBalance() {
  const [balance, setBalance] = useState<number | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/account/credits", { cache: "no-store" });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (typeof data.balance !== "number") throw new Error();
        if (active) { setBalance(data.balance); setUnavailable(false); }
      } catch { if (active) setUnavailable(true); }
    }
    void refresh();
    const interval = setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, []);
  return <span className="credit-balance" role="status" title="每张图片 1 积分，明确失败退回；暂不支持充值">
    {unavailable ? "积分暂不可用" : balance === null ? "积分加载中…" : `剩余 ${balance} 积分`}
  </span>;
}
