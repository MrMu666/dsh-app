import { useCallback, useState } from "react";
import Welcome from "./components/Welcome";
import BrowserView from "./components/BrowserView";
import { loadAddresses, saveAddresses } from "./lib/addresses";
import "./App.css";

/** 浏览模式状态：当前地址 + 浏览历史（用于顶栏返回） */
interface BrowserState {
  current: string;
  history: string[];
}

function App() {
  const [addresses, setAddresses] = useState<string[]>(() => loadAddresses());
  const [browser, setBrowser] = useState<BrowserState | null>(null);

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

  if (browser) {
    return (
      <BrowserView
        current={browser.current}
        addresses={addresses}
        onBack={goBack}
        onSelect={goToAddress}
      />
    );
  }

  return <Welcome addresses={addresses} onEnter={enterAddress} />;
}

export default App;
