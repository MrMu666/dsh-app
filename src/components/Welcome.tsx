import { useState, type FormEvent } from "react";
import { isValidAddress, normalizeAddress } from "../lib/addresses";
import { isMobileShell } from "../lib/windows";
import "./Welcome.css";

interface WelcomeProps {
  /** 输入过的地址列表（展示形式，最近的在前） */
  addresses: string[];
  /** 已经在本应用内打开的地址（用于标记「已打开」；移动端恒为空） */
  opened: ReadonlySet<string>;
  /** 进入某个地址（桌面端：新建/聚焦独立窗口；移动端：本窗口内打开） */
  onEnter: (address: string) => void;
  /** 从历史列表中移除某个地址 */
  onRemove: (address: string) => void;
}

function Welcome({ addresses, opened, onEnter, onRemove }: WelcomeProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** 移动端没有多窗口：点地址就是本窗口导航过去，返回只能靠系统返回键 */
  const mobileShell = isMobileShell();

  function submit(e: FormEvent) {
    e.preventDefault();
    const normalized = normalizeAddress(input);
    if (!isValidAddress(normalized)) {
      setError("地址格式不正确，请输入如 192.168.1.1:3080");
      return;
    }
    onEnter(normalized);
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1 className="welcome-title">DeepSeek Harness</h1>
        <p className="welcome-hint">
          请选择或输入您的 DeepSeek Harness 地址，如 192.168.1.1:3080
        </p>

        {addresses.length > 0 && (
          <div className="address-list">
            {addresses.map((addr) => (
              <div key={addr} className="address-item">
                <button
                  type="button"
                  className="address-btn"
                  onClick={() => onEnter(addr)}
                  title={addr}
                >
                  <span className="address-text">{addr}</span>
                  {opened.has(addr) && <span className="address-badge">已打开</span>}
                </button>
                <button
                  type="button"
                  className="address-remove"
                  onClick={() => onRemove(addr)}
                  title="从列表中移除"
                  aria-label={`从列表中移除 ${addr}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <form className="address-form" onSubmit={submit}>
          <input
            className="address-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            placeholder="输入新的地址，如 192.168.1.1:3080"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="address-go" disabled={!input.trim()}>
            打开
          </button>
        </form>

        {error && <p className="address-error">{error}</p>}

        <p className="welcome-note">
          {mobileShell
            ? "点击地址会在本应用内打开该页面（同一个窗口，Cookie 与登录状态与浏览器一致）；" +
              "按系统返回键 / 返回手势回到本页，再次打开会重新加载页面。"
            : "每个地址在独立窗口中打开（Cookie 与登录状态各自独立、窗口存活期间不会自动重载）；" +
              "再次点击同一地址只切换到已打开的窗口，需要重新加载时关闭窗口再打开即可。"}
        </p>
      </div>
    </div>
  );
}

export default Welcome;
