// 在本机打开 DeepSeek Harness 页面所必需的承载能力（桌面端与移动端做法不同）。
//
// 为什么不能使用 iframe：DSH（配合 dsh-LAN 的局域网口令）在 iframe 里属于
// **第三方上下文**，DSH 种下的会话 Cookie 是 `HttpOnly; SameSite=Strict`，
// 在第三方 iframe 中会被现代 WebView 的跟踪防护丢弃，于是 DSH 登录页
// （/dsh-lan/）会「静默续登 → 跳回主界面 → 又被服务器弹回登录页」无限循环，
// 表现为口令页不断闪烁、无法输入。
//
// 因此远程页面只能作为**顶层文档**承载，两端做法不同：
// - 桌面端：每个地址一个独立顶层窗口（Tauri WebviewWindow），互不干扰、常驻不重载；
// - 移动端（Android / iOS）：Tauri 移动端不支持在运行时创建窗口，改为让**本窗口自己**
//   导航到该地址。顶层导航同样是第一方上下文，Cookie / 登录状态与系统浏览器一致；
//   返回靠系统返回键 / 返回手势 —— Tauri 的 AppPlugin 会在 `canGoBack()` 为真时执行
//   `webView.goBack()`。因此**不要**在中枢页注册 `back-button` 事件监听：一旦注册，
//   返回键只会派发事件而不回退历史，等于把移动端唯一的返回路径掐断。
// - 安卓包额外注入了**原生顶部工具条**（见 `.github/android/MainActivity.kt`）：本模块
//   通过 `window.dshBar` 调它显示功能栏并让原生层执行导航；没有这个桥时（如 iOS）
//   退回 `location.assign()`。为什么工具条必须是原生的：安卓上每个 Activity 只有一个
//   WebView，远程页面又不能放进 iframe，页面内没有位置放这条栏。

import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "@tauri-apps/api/core";

/** 地址窗口的标签前缀，用于把本 App 打开的 GUI 窗口与主窗口区分开 */
const WINDOW_PREFIX = "dsh-address:";

/** GUI 窗口的初始尺寸（逻辑像素；过小的屏幕由系统的 preventOverflow 逻辑兜底） */
const WINDOW_SIZE = { width: 1280, height: 900, minWidth: 480, minHeight: 480 };

/**
 * 地址 → 窗口标签：只保留标签允许的 `a-zA-Z0-9-/:_`。
 * @param address - 展示形式的地址（如 `192.168.1.5:3080`）。
 * @returns 形如 `dsh-address:192.168.1.5:3080` 的标签。
 */
function labelFor(address: string): string {
  return WINDOW_PREFIX + address.replace(/[^a-zA-Z0-9-/:_.]/g, "_");
}

/**
 * 地址 → 可加载的完整 URL。
 * @param address - 展示形式的地址，未带 scheme 时补 `http://`（内网明文场景）。
 * @returns 完整 URL。
 */
function urlFor(address: string): string {
  return /^https?:\/\//i.test(address) ? address : `http://${address}`;
}

function isAddressLabel(label: string): boolean {
  return label.startsWith(WINDOW_PREFIX);
}

function labelToAddress(label: string): string {
  return label.slice(WINDOW_PREFIX.length);
}

/**
 * 打开结果：
 * - `opened`：新建了一个 GUI 窗口（桌面端）；
 * - `focused`：该地址的窗口已存在，已把它带到前台（桌面端）；
 * - `navigated`：移动端把当前窗口（或原生工具条里的 WebView）导航到了该地址——
 *   中枢页会被卸载，调用方不要依赖导航之后的 UI 状态；
 * - `popup`：不在 Tauri 环境（浏览器里跑前端调试），改用 `window.open` 新标签页。
 */
export type OpenAddressResult = "opened" | "focused" | "navigated" | "popup";

/** 移动端（Android / iOS）——Tauri 移动端不支持在运行时创建多窗口 */
function isMobileRuntime(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/**
 * 当前是否运行在移动端 App 内。
 *
 * 移动端与桌面端的承载方式不同（见 {@link openAddressWindow}），界面文案据此区分。
 * @returns 处于 Tauri 的移动端运行时为 true。
 */
export function isMobileShell(): boolean {
  return isTauri() && isMobileRuntime();
}

/**
 * 安卓原生顶部工具条（由 CI 注入的 `.github/android/MainActivity.kt` 提供）。
 *
 * 它叠在 WebView 上方，替代了「页面里放一条 HTML 工具条」——安卓上做不到这件事：
 * 每个 Activity 只有一个 WebView，远程页面又不能放进 iframe 承载。
 */
interface NativeTopBar {
  /**
   * 显示工具条并把 WebView 导航到该地址。
   * @param url - 完整 URL。
   * @param label - 工具条上显示的地址（中枢里的展示形式）。
   * @param origin - 中枢页 origin，原生层用它校验调用来源（远程页面调用会被忽略）。
   * @param addressesJson - 地址历史的 JSON 数组，用于工具条上的「切换地址」菜单。
   */
  openRemote(url: string, label: string, origin: string, addressesJson: string): void;
  /** 隐藏工具条（中枢页重新加载时兜底调用）。 */
  hide(): void;
}

/** 取原生工具条桥（不存在时返回 null）。 */
function nativeTopBar(): NativeTopBar | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { dshBar?: Partial<NativeTopBar> }).dshBar;
  return bridge !== undefined && typeof bridge.openRemote === "function"
    ? (bridge as NativeTopBar)
    : null;
}

/**
 * 当前环境是否带原生顶部工具条（安卓包有；桌面端 / iOS / 浏览器调试都没有）。
 *
 * 这是同步可判定的，所以界面文案用它区分，而不是 {@link isMobileShell}。
 * @returns 存在原生工具条桥时为 true。
 */
export function hasNativeTopBar(): boolean {
  return nativeTopBar() !== null;
}

/** 兜底隐藏原生工具条（中枢页重新加载时，原生层状态可能残留）。 */
export function hideNativeTopBar(): void {
  nativeTopBar()?.hide();
}

/** 把已存在的同名窗口带到前台（还原最小化 + 显示 + 聚焦）。 */
async function focusWindow(win: WebviewWindow): Promise<void> {
  try {
    await win.unminimize();
  } catch {
    // 未最小化时该调用可能直接失败，忽略
  }
  await win.show();
  await win.setFocus();
}

/**
 * 打开一个 DeepSeek Harness 地址。
 *
 * 桌面端在**顶层窗口**中打开：同一地址重复调用只会聚焦已有窗口，不重复打开、也不重载
 * 页面（与原「页面实例常驻、SPA 状态不丢」的语义一致）。移动端没有多窗口能力，改为在
 * 当前窗口内承载：安卓由原生工具条（顶部功能栏）驱动同一个 WebView，其他移动平台直接
 * 顶层导航过去。
 *
 * @param address - 展示形式的地址（如 `192.168.1.5:3080`）。
 * @param addresses - 地址历史（最近的在前），供移动端工具条的「切换地址」菜单使用。
 * @returns 打开结果，见 {@link OpenAddressResult}。
 * @throws 桌面端窗口创建失败（如缺少
 * `core:webview:allow-create-webview-window` 权限）时抛出。
 */
export async function openAddressWindow(
  address: string,
  addresses: readonly string[] = [],
): Promise<OpenAddressResult> {
  const label = labelFor(address);
  const url = urlFor(address);

  if (isTauri()) {
    if (isMobileRuntime()) {
      const bar = nativeTopBar();
      if (bar !== null) {
        // 安卓：交给原生工具条显示功能栏并执行导航（同样只做顶层导航，Cookie 仍是第一方）
        try {
          bar.openRemote(url, address, window.location.origin, JSON.stringify([...addresses]));
          return "navigated";
        } catch {
          // 原生层异常时退回下面的本窗口导航，别让用户点不动
        }
      }
      // 没有原生工具条（如 iOS）：本窗口自己顶层导航。
      // 用 assign 而不是 replace —— 中枢页必须留在历史里，否则系统返回键会直接退出 App。
      window.location.assign(url);
      return "navigated";
    }

    const existing = await WebviewWindow.getByLabel(label);
    if (existing !== null) {
      await focusWindow(existing);
      return "focused";
    }

    const win = new WebviewWindow(label, {
      url,
      title: address,
      ...WINDOW_SIZE,
      center: true,
      resizable: true,
      focus: true,
      // 不设置 parent：GUI 必须是独立顶层窗口（顶层文档 = 第一方存储上下文）
    });

    // 创建是异步的：等待 Tauri 的成功/失败事件，失败时把错误文本交给调用方展示
    await new Promise<void>((resolve, reject) => {
      void win.once("tauri://created", () => resolve());
      void win.once("tauri://error", (event) => {
        reject(new Error(String(event.payload ?? "窗口创建失败")));
      });
    });
    return "opened";
  }

  // 非 Tauri（浏览器里跑 Vite 调试）：新标签页同样是顶层文档
  const opened = window.open(url, "_blank", "noopener");
  if (opened === null) throw new Error("浏览器拦截了新标签页，请允许弹出窗口后重试");
  return "popup";
}

/**
 * 列出已打开的 GUI 窗口对应的地址。
 *
 * 移动端没有额外窗口（页面就在本窗口里），因此恒为空数组。
 * @returns 地址数组（展示形式，顺序不保证）。
 */
export async function listOpenAddresses(): Promise<string[]> {
  if (!isTauri()) return [];
  try {
    const all = await WebviewWindow.getAll();
    return all.filter((win) => isAddressLabel(win.label)).map((win) => labelToAddress(win.label));
  } catch {
    return [];
  }
}

/**
 * 监听「GUI 窗口被关闭」。
 * @param onClosed - 回调，参数为被关闭窗口对应的地址。
 * @returns 取消监听的函数（未在 Tauri 环境下为 no-op）。
 */
export async function onAddressWindowClosed(onClosed: (address: string) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  try {
    return await getCurrentWebviewWindow().listen<string>("tauri://destroyed", (event) => {
      const label = String(event.payload ?? "");
      if (isAddressLabel(label)) onClosed(labelToAddress(label));
    });
  } catch {
    return () => {};
  }
}
