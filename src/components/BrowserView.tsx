import { useEffect, useRef, useState } from "react";
import { toUrl } from "../lib/addresses";
import "./BrowserView.css";

interface BrowserViewProps {
  /** 当前地址（展示形式，如 192.168.1.1:3080） */
  current: string;
  /** 全部输入过的地址（顶栏下拉列表） */
  addresses: string[];
  /** 返回（历史后退；无历史时回到欢迎页） */
  onBack: () => void;
  /** 下拉选择其他地址 */
  onSelect: (address: string) => void;
}

/** 加载超时时间（毫秒），超过则提示无法加载 */
const LOAD_TIMEOUT_MS = 20000;

function BrowserView({ current, addresses, onBack, onSelect }: BrowserViewProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const timerRef = useRef<number | null>(null);

  const url = toUrl(current);

  // 地址切换或强制刷新时：重置加载状态，并启动超时检测
  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setLoading(false);
      setLoadError(true);
    }, LOAD_TIMEOUT_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [url, reloadKey]);

  function handleLoad() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setLoading(false);
    setLoadError(false);
  }

  // 强制刷新：更换 iframe 的 key 以重建元素，重新发起加载
  function refresh() {
    setReloadKey((k) => k + 1);
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
          onClick={refresh}
          title="强制刷新"
          aria-label="强制刷新"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08a5.99 5.99 0 0 1-5.65 4c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
          </svg>
        </button>
      </header>

      <div className="browser-body">
        {loading && <div className="browser-overlay">加载中…</div>}
        {loadError && (
          <div className="browser-overlay browser-overlay-error">
            无法加载 {current}，请检查地址和网络后重试。
          </div>
        )}
        <iframe
          key={`${url}#${reloadKey}`}
          className="browser-frame"
          src={url}
          onLoad={handleLoad}
          title={current}
        />
      </div>
    </div>
  );
}

export default BrowserView;
