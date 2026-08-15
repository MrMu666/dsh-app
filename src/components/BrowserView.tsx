import { useEffect, useRef, useState } from "react";
import { toUrl } from "../lib/addresses";
import type { PoolEntry } from "../lib/pool";
import "./BrowserView.css";

interface BrowserViewProps {
  /** 当前地址（展示形式，如 192.168.1.1:3080）；欢迎页时为 "" */
  current: string;
  /** 全部输入过的地址（顶栏下拉列表） */
  addresses: string[];
  /** 页面实例池：池中每个地址渲染一个常驻 iframe（非当前地址隐藏保留，不重新加载） */
  pool: Record<string, PoolEntry>;
  /** 返回（历史后退；无历史时回到欢迎页） */
  onBack: () => void;
  /** 下拉选择其他地址 */
  onSelect: (address: string) => void;
  /** 强制刷新当前页面（代次 +1 → 重建 iframe） */
  onRefresh: () => void;
}

/** 加载超时时间（毫秒），超过则提示无法加载 */
const LOAD_TIMEOUT_MS = 20000;

function BrowserView({ current, addresses, pool, onBack, onSelect, onRefresh }: BrowserViewProps) {
  /** 已成功加载过的 iframe 实例键（`地址#代次`），用于区分"复用已有实例"与"新建加载" */
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);
  const timerRef = useRef<number | null>(null);

  const currentEntry = current ? pool[current] : undefined;
  const currentKey = current ? `${current}#${currentEntry?.gen ?? 0}` : "";
  const isLoaded = loadedKeys.has(currentKey);

  // 地址切换或实例重建（代次变化）时：复用已有实例则不显示加载；
  // 新建实例启动超时检测（加载失败提示）
  useEffect(() => {
    setLoadError(false);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    if (!current || isLoaded) return;
    timerRef.current = window.setTimeout(() => {
      setLoadError(true);
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, currentKey]);

  function handleLoad(addr: string) {
    const key = `${addr}#${pool[addr]?.gen ?? 0}`;
    setLoadedKeys((prev) => new Set(prev).add(key));
    if (addr === current) {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      setLoadError(false);
    }
  }

  return (
    <div className="browser">
      <header className="browser-bar">
        <button
          type="button"
          className="bar-btn"
          onClick={onBack}
          title="返回"
          aria-label="返回"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
          </svg>
        </button>

        <select
          className="bar-address"
          value={current}
          onChange={(e) => onSelect(e.target.value)}
          title="切换地址"
          aria-label="切换地址"
        >
          {addresses.map((addr) => (
            <option key={addr} value={addr}>
              {addr}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="bar-btn"
          onClick={onRefresh}
          title="强制刷新"
          aria-label="强制刷新"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.99 5.99 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
          </svg>
        </button>
      </header>

      <div className="browser-body">
        {current && !isLoaded && !loadError && (
          <div className="browser-overlay">加载中…</div>
        )}
        {loadError && (
          <div className="browser-overlay browser-overlay-error">
            无法加载 {current}，请检查地址和网络后重试。
          </div>
        )}
        {Object.entries(pool).map(([addr, entry]) => (
          <iframe
            key={`${addr}#${entry.gen}`}
            className="browser-frame"
            src={toUrl(addr)}
            onLoad={() => handleLoad(addr)}
            title={addr}
            style={{ display: addr === current ? undefined : "none" }}
          />
        ))}
      </div>
    </div>
  );
}

export default BrowserView;
