// 地址历史的存储与规范化工具。
// 地址历史是应用自身的数据，存放在本地 WebView 的 localStorage（持久化于系统 WebView 数据目录）。

const STORAGE_KEY = "dsh.addresses";

/**
 * 校验用户输入的地址是否合法。
 * 合法形式：`192.168.1.1:3080`、`dsh.local:3080`、`http://192.168.1.1:3080`、`https://host:port/path`
 */
export function isValidAddress(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  // 不允许空白字符
  if (/\s/.test(s)) return false;
  const withoutScheme = s.replace(/^https?:\/\//i, "");
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]*(:\d{1,5})?(\/.*)?$/.test(withoutScheme);
}

/**
 * 规范化用户输入：去首尾空白、去尾部斜杠。
 * 返回用于展示与存储的形式（保留用户输入原样，如 `192.168.1.1:3080`）。
 */
export function normalizeAddress(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

/**
 * 将展示形式的地址转换为可加载的完整 URL。
 * 未带 scheme 时默认补 `http://`（内网 DeepSeek Harness 场景）。
 */
export function toUrl(display: string): string {
  if (/^https?:\/\//i.test(display)) return display;
  return `http://${display}`;
}

/** 读取输入过的地址列表（最近的在前） */
export function loadAddresses(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a): a is string => typeof a === "string");
  } catch {
    return [];
  }
}

/** 保存地址列表 */
export function saveAddresses(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 存储不可用时静默失败（不影响使用）
  }
}
