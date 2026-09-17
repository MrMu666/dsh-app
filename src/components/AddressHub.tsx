import { useCallback, useEffect, useRef, useState } from "react";
import Welcome from "./Welcome";
import { loadAddresses, normalizeAddress, saveAddresses } from "../lib/addresses";
import {
  hideNativeTopBar,
  listOpenAddresses,
  onAddressWindowClosed,
  openAddressWindow,
} from "../lib/windows";

/**
 * 地址中枢：应用的主窗口内容。
 *
 * 主窗口不承载任何远程页面（原先用 iframe 承载，导致 DSH 处于第三方上下文、
 * 登录 Cookie 被 WebView 丢弃，口令页反复闪烁且无法输入）。这里只维护
 * 「地址历史 + 已打开地址」；DeepSeek Harness 页面由 {@link openAddressWindow}
 * 打开 —— 桌面端是独立顶层窗口，移动端是本窗口顶层导航（详见 lib/windows.ts；
 * 导航会卸载本页，所以历史记录必须同步落盘）。
 */
function AddressHub() {
  const [addresses, setAddresses] = useState<string[]>(() => loadAddresses());
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);

  /** 重新读取当前已打开的地址窗口 */
  const refreshOpen = useCallback(async () => {
    const list = await listOpenAddresses();
    setOpened(new Set(list));
  }, []);

  // 监听地址窗口关闭 → 刷新「已打开」标记；挂载时先同步一次
  useEffect(() => {
    // 中枢页重新加载时兜底收起安卓原生工具条（正常路径由原生层自己隐藏）
    hideNativeTopBar();
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const off = await onAddressWindowClosed(() => {
        void refreshOpen();
      });
      if (cancelled) off();
      else unlisten = off;
      await refreshOpen();
    })();
    return () => {
      cancelled = true;
      if (unlisten !== null) unlisten();
    };
  }, [refreshOpen]);

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    };
  }, []);

  /** 显示一条底部提示，4 秒后自动消失 */
  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
  }, []);

  /** 打开（或聚焦）某个地址的页面，并把它提到历史列表最前 */
  const handleEnter = useCallback(
    (raw: string) => {
      const address = normalizeAddress(raw);
      setError(null);

      // 先**同步**把地址写进历史再打开：移动端是「本窗口导航」到目标地址，
      // 中枢页随即被卸载，而放进 setState 更新函数里的持久化要等 React 渲染，
      // 不一定来得及执行（渲染是异步调度的，导航可先发生）。
      const next = [address, ...loadAddresses().filter((a) => a !== address)];
      saveAddresses(next);
      setAddresses(next);

      void (async () => {
        try {
          // 把刚存下的历史一并交给打开逻辑：安卓原生工具条要用它做「切换地址」菜单
          const result = await openAddressWindow(address, next);
          if (result === "popup") {
            showNotice("已在新标签页打开（当前是浏览器调试环境）");
          }
          await refreshOpen();
        } catch (reason) {
          setError(
            `无法打开 ${address}：${reason instanceof Error ? reason.message : String(reason)}`,
          );
        }
      })();
    },
    [refreshOpen, showNotice],
  );

  /** 从历史列表中移除一个地址（不影响已打开的窗口） */
  const handleRemove = useCallback((address: string) => {
    setAddresses((prev) => {
      const next = prev.filter((a) => a !== address);
      saveAddresses(next);
      return next;
    });
    setError(null);
  }, []);

  return (
    <>
      <Welcome
        addresses={addresses}
        opened={opened}
        onEnter={handleEnter}
        onRemove={handleRemove}
      />
      {error !== null && (
        <div className="hub-toast hub-toast-error" role="alert">
          {error}
        </div>
      )}
      {notice !== null && <div className="hub-toast">{notice}</div>}
    </>
  );
}

export default AddressHub;
