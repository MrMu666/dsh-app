import { useState, type FormEvent } from "react";
import { isValidAddress, normalizeAddress } from "../lib/addresses";
import "./Welcome.css";

interface WelcomeProps {
  /** 输入过的地址列表（展示形式） */
  addresses: string[];
  /** 进入某个地址（浏览模式） */
  onEnter: (address: string) => void;
}

function Welcome({ addresses, onEnter }: WelcomeProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

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
              <button
                key={addr}
                type="button"
                className="address-btn"
                onClick={() => onEnter(addr)}
              >
                {addr}
              </button>
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
            进入
          </button>
        </form>

        {error && <p className="address-error">{error}</p>}
      </div>
    </div>
  );
}

export default Welcome;
