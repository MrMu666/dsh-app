import { useCallback, useEffect, useState } from "react";
import Welcome from "./components/Welcome";
import BrowserView from "./components/BrowserView";
import { loadAddresses, saveAddresses } from "./lib/addresses";
import { MAX_POOL_SIZE, POOL_TTL_MS, type PoolEntry } from "./lib/pool";
import "./App.css";

/** 浏览模式状态：当前地址 + 浏览历史（用于顶栏返回） */
interface BrowserState {
  current: string;
  history: string[];
}

function App() {
  const [addresses, setAddresses] = useState<string[]>(() => loadAddresses());
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  /** 页面实例池：地址 → 实例条目。池中地址的 iframe 常驻（隐藏保留），避免重新加载 */
  const [pool, setPool] = useState<Record<string, PoolEntry>>({});

  // 维护页面实例池：进入某地址时，
  // - 池中已有且未过期（48 小时内）→ 复用，仅更新访问时间（不重新加载）
  // - 池中没有或已过期 → 重建（gen 变化 → iframe 重新加载）
  // - 顺带清理过期条目，并控制池容量上限
  useEffect(() => {
    if (!browser) return;
    const addr = browser.current;
    setPool((prev) => {
      const now = Date.now();
      const next: Record<string, PoolEntry> = {};
      for (const [a, e] of Object.entries(prev)) {
        if (now - e.lastUsed <= POOL_TTL_MS) next[a] = e;
      }
      const existing = next[addr];
      if (existing) {
        next[addr] = { lastUsed: now, gen: existing.gen };
      } else {
        next[addr] = { lastUsed: now, gen: 1 };
      }
      const entries = Object.entries(next).sort((x, y) => x[1].lastUsed - y[1].lastUsed);
      for (const [a] of entries.slice(0, Math.max(0, entries.length - MAX_POOL_SIZE))) {
        delete next[a];
      }
      return next;
    });
  }, [browser?.current]);

  /** 进入某个地址（欢迎页按钮 / 输入新地址）：记录到历史列表并进入浏览模式 */
  const enterAddress = useCallback((display: string) => {
    setAddresses((prev) => {
      const next = [display, ...prev.filter((a) => a !== display)];
      saveAddresses(next);
      return next;
    });
    setBrowser({ current: display, history: [display] });
  }, []);

  /** 顶栏下拉切换到其他地址：压入浏览历史 */
  const goToAddress = useCallback((display: string) => {
    setBrowser((prev) => {
      if (prev && prev.current === display) return prev;
      const base = prev ? prev.history : [];
      return { current: display, history: [...base, display] };
    });
  }, []);

  /** 顶栏返回：有历史则退回上一个地址，否则回到欢迎页 */
  const goBack = useCallback(() => {
    setBrowser((prev) => {
      if (!prev) return null;
      if (prev.history.length > 1) {
        return {
          current: prev.history[prev.history.length - 2],
          history: prev.history.slice(0, -1),
        };
      }
      return null;
    });
  }, []);

  /** 强制刷新当前页面：代次 +1，BrowserView 据此重建 iframe 重新加载 */
  const refreshCurrent = useCallback(() => {
    setBrowser((b) => {
      if (!b) return b;
      const addr = b.current;
      setPool((prev) => ({
        ...prev,
        [addr]: { lastUsed: Date.now(), gen: (prev[addr]?.gen ?? 0) + 1 },
      }));
      return b;
    });
  }, []);

  return (
    <>
      {!browser && <Welcome addresses={addresses} onEnter={enterAddress} />}
      {/* BrowserView 始终挂载（欢迎页时隐藏），保证页面实例池中的 iframe 不被销毁 */}
      <div className="app-browser" style={{ display: browser ? "block" : "none" }}>
        <BrowserView
          current={browser?.current ?? ""}
          addresses={addresses}
          pool={pool}
          onBack={goBack}
          onSelect={goToAddress}
          onRefresh={refreshCurrent}
        />
      </div>
    </>
  );
}

export default App;
