import { useCallback, useEffect, useRef, useState } from "react";
import Welcome from "./Welcome";
import { loadAddresses, normalizeAddress, saveAddresses } from "../lib/addresses";
import { listOpenAddresses, onAddressWindowClosed, openAddressWindow } from "../lib/windows";

/**
 * 地址中枢：应用的主窗口内容。
 *
 * 主窗口不再承载任何远程页面（原先用 iframe 承载，导致 DSH 处于第三方上下文、
 * 登录 Cookie 被 WebView 丢弃，口令页反复闪烁且无法输入）。这里只维护
 * 「地址历史 + 已打开地址」，真正的 DeepSeek Harness 页面由
 * {@link openAddressWindow} 在独立顶层窗口中打开。
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

  /** 打开（或聚焦）某个地址的 GUI 窗口，并把它提到历史列表最前 */
  const handleEnter = useCallback(
    (raw: string) => {
      const address = normalizeAddress(raw);
      setError(null);
      void (async () => {
        try {
          const result = await openAddressWindow(address);
          setAddresses((prev) => {
            const next = [address, ...prev.filter((a) => a !== address)];
            saveAddresses(next);
            return next;
          });
          if (result === "popup") {
            showNotice("已在新标签页打开（当前是浏览器调试环境）");
          } else if (result === "external") {
            showNotice("已在系统浏览器中打开（移动端不支持多窗口）");
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
