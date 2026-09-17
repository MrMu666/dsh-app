// 在本机打开 DeepSeek Harness 页面所必需的窗口能力。
//
// 为什么不使用 iframe：DSH（配合 dsh-LAN 的局域网口令）在 iframe 里属于
// **第三方上下文**，DSH 种下的会话 Cookie 是 `HttpOnly; SameSite=Strict`，
// 在第三方 iframe 中会被现代 WebView 的跟踪防护丢弃，于是 DSH 登录页
// （/dsh-lan/）会「静默续登 → 跳回主界面 → 又被服务器弹回登录页」无限循环，
// 表现为口令页不断闪烁、无法输入。
//
// 因此本 App 改为**每个地址一个独立顶层窗口**：GUI 成为顶层文档，Cookie /
// localStorage 都是第一方，行为与系统浏览器里直接打开该地址完全一致
// （口令只需输入一次，窗口存活期间不会自动重载）。

import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

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
 * - `opened`：新建了一个 GUI 窗口；
 * - `focused`：该地址的窗口已存在，已把它带到前台；
 * - `external`：移动端不支持多窗口，已交给系统浏览器（同样是顶层第一方上下文）；
 * - `popup`：不在 Tauri 环境（浏览器里跑前端调试），改用 `window.open` 新标签页。
 */
export type OpenAddressResult = "opened" | "focused" | "external" | "popup";

/** 移动端（Android / iOS）——Tauri 移动端不支持在运行时创建多窗口 */
function isMobileRuntime(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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
 * 在**顶层窗口**中打开一个 DeepSeek Harness 地址。
 *
 * 同一地址重复调用只会聚焦已有窗口：不重复打开、也不重载页面（与原「页面实例
 * 常驻、SPA 状态不丢」的语义一致）。窗口由系统管理，关闭即结束该会话。
 * 移动端没有多窗口能力，改为在系统浏览器中打开（同为顶层第一方上下文）。
 *
 * @param address - 展示形式的地址（如 `192.168.1.5:3080`）。
 * @returns 打开结果，见 {@link OpenAddressResult}。
 * @throws 窗口创建失败（如缺少
 * `core:webview:allow-create-webview-window` 权限）时抛出。
 */
export async function openAddressWindow(address: string): Promise<OpenAddressResult> {
  const label = labelFor(address);
  const url = urlFor(address);

  if (isTauri()) {
    if (isMobileRuntime()) {
      // 移动端不能多窗口：交给系统浏览器，同样是顶层第一方上下文
      // （不要用 "inAppBrowser"：那是 WebView 内的受管浏览器，仍是第三方上下文）
      await openUrl(url);
      return "external";
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
