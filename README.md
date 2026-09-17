# dsh-app

> ## ⭐ 搭配 [dsh-LAN](https://github.com/MrMu666/dsh-LAN) 体验最佳
>
> 本项目与 **dsh-LAN** 结合使用可获得最佳体验，建议搭配部署使用。

DeepSeek Harness 客户端：在 App 内打开局域网内指定地址的 DeepSeek Harness 页面。

基于 **Tauri 2 + React 19 + TypeScript + Vite**。

> 打包完全依赖 GitHub Actions，本机不进行打包（本机只用于编写和调试代码）。

## 功能

- **地址中枢（主窗口）**：提示"请选择或输入您的 DeepSeek Harness 地址，如 192.168.1.1:3080"；
  下方列出所有输入过的地址（按钮，可单个移除，已打开的地址带「已打开」标记），
  列表下方输入框可添加新地址；无历史地址时不显示按钮区。
- **每个地址一个独立顶层窗口**：点击地址在**新的顶层窗口**中打开该 DeepSeek Harness 页面
  （同一地址再次点击只聚焦已打开的窗口，不重复打开、不重载页面）。
- **桌面端不使用 iframe**：iframe 里页面属于「第三方上下文」，DSH 的登录状态会被
  WebView 的跟踪防护拦截，dsh-LAN 的局域网口令页会反复闪烁、无法输入口令。
  改用独立顶层窗口后，口令只需输入一次，行为与系统浏览器一致。
- **Cookie 与存储**：每个地址窗口（源）独立，由系统 WebView 原生管理并持久化
  （Windows WebView2、Android WebView、iOS WKWebView）：重启 App 后保留，与系统浏览器数据隔离。
- **页面实例常驻**：窗口存活期间页面不会自动重载（SPA 状态/滚动位置不丢）；
  需要重新加载时关闭该地址窗口再打开即可。
- **Android（移动端）**：移动端不支持多窗口，点击地址会在**系统浏览器**中打开
  （同样是顶层第一方上下文，口令行为与桌面浏览器一致）。
- **Android 状态栏**：App 内容不侵占状态栏（CI 构建时自动配置 edge-to-edge opt-out）。

## 目录结构

```
├── src/                          # 前端（React）
│   ├── lib/
│   │   ├── addresses.ts          # 地址规范化 + 地址历史持久化（localStorage）
│   │   └── windows.ts            # 顶层窗口打开/聚焦/枚举（Tauri WebviewWindow）
│   ├── components/
│   │   ├── Welcome.tsx           # 地址中枢：地址按钮列表 + 新地址输入 + 移除
│   │   └── AddressHub.tsx        # 中枢逻辑：打开窗口、跟踪已打开地址
│   └── App.tsx                   # 主窗口 = 地址中枢
├── src-tauri/                    # Tauri 壳（Rust）
│   ├── src/                      # Rust 代码
│   ├── capabilities/default.json # 窗口能力（创建/显示/聚焦窗口所需权限）
│   └── tauri.conf.json           # 应用配置（名称 / 标识符 / 窗口 / 图标）
└── .github/
    ├── scripts/bump-version.mjs  # CI 版本递增（patch +1）
    └── workflows/
        └── build-android.yml     # 推送自动：递增版本 → 各架构 APK → GitHub Release
```

## 本地开发（仅写代码，不打包）

```bash
npm install        # 安装依赖
npm run tauri dev  # 启动桌面开发模式（本机已具备 Rust + MSVC + WebView2）
```

## 移动端明文 HTTP（内网地址）说明

DeepSeek Harness 通常部署在局域网、以 `http://192.168.1.1:3080` 明文访问，而移动系统默认禁止：

- **Android**：CI 构建时把模板 Manifest 的 `usesCleartextTraffic` 占位符改写为 `true`（debug / release 均生效），
  局域网明文地址（`http://192.168.1.1:3080`）可直接访问。
- **iOS**：当前 CI 只打包 Android（见下），iOS 工作流已移除。

## CI 打包（GitHub Actions）

推送到 GitHub 后**全自动**（无需手动打 tag）：

1. **推送 `main` / `master` 自动触发**：先递增小版本号（patch +1，`.github/scripts/bump-version.mjs`）
   并把改动提交回仓库（`package.json` / `package-lock.json` / `src-tauri/tauri.conf.json`）；
2. 初始化 Android 工程（`tauri android init`）→ 覆盖应用图标 → 放行局域网明文 HTTP → 状态栏 opt-out；
3. 构建**按 CPU 架构拆分**的签名 APK（`--apk --split-per-abi`，4 个 ABI 各一个包）；
4. 打 tag `v<版本>` 并创建 GitHub Release，资产为各架构 APK
   （文件名 `dsh-app-<abi>-v<版本>.apk`，直接从 Release 页下载 .apk 文件，不用 Artifact，避免 zip 压缩包）。

- **手动触发**：仓库 Actions 页面 → `build-android` → Run workflow（同样递增版本并发布）。
- 版本号唯一来源是 `package.json`；`src-tauri/tauri.conf.json` 的 `version` 指向 `../package.json`，
  Android 的 `versionCode` 由 Tauri 按 `major*1000000 + minor*1000 + patch` 推导，随 patch 递增，新包可直接覆盖安装。

Android 工程（`src-tauri/gen/android`）由 CI 自动生成，无需在本地生成或提交。

> 说明：tauri-action 的移动端支持从未发布（仅 dev 分支），因此 workflow 直接调用
> `tauri` CLI 构建（`android build --apk --split-per-abi`）。

### 需要配置的 Secrets（仓库 Settings → Secrets and variables → Actions）

| Secret | 必填 | 说明 |
|---|---|---|
| `GITHUB_TOKEN` | ✅（自动存在） | 发布 GitHub Release 用，无需手动配置 |
| `ANDROID_KEYSTORE_BASE64` | Android 正式包必填 | keystore 文件的 base64（`certutil -encode` / `base64` 生成）；配置后构建**正式签名 release 包**（按 ABI 拆分，单包 20–35MB） |
| `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD` | 同上 | keystore 与密钥密码（建议只用字母数字） |
| `ANDROID_KEY_ALIAS` | 同上 | 密钥别名（如 `upload`） |

> Android 未配置签名 Secrets 时，回退构建 debug 签名包（可安装测试，但体积大，约 400MB）；
> 配置后构建正式签名 release 包（`--split-per-abi` 按架构拆分，单包约 20–35MB）。
> keystore 生成命令：`keytool -genkey -v -keystore upload-keystore.jks -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias upload`（JDK 自带 keytool）。

> iOS 打包已移除（本 workflow 只出 Android 包）；如需恢复，可从 git 历史取回原 `mobile-build.yml`
> （macOS runner + `tauri ios init` + IPA 产物）。

## 应用标识

- bundle identifier：`com.dsh.app`（在 `src-tauri/tauri.conf.json` 中修改）
- productName：`dsh-app`（即安装包/可执行文件名）
