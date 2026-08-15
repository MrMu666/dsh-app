# dsh-app

> ## ⭐ 搭配 [dsh-LAN](https://github.com/MrMu666/dsh-LAN) 体验最佳
>
> 本项目与 **dsh-LAN** 结合使用可获得最佳体验，建议搭配部署使用。

DeepSeek Harness 客户端：在 App 内打开局域网内指定地址的 DeepSeek Harness 页面。

基于 **Tauri 2 + React 19 + TypeScript + Vite**。

> 打包完全依赖 GitHub Actions，本机不进行打包（本机只用于编写和调试代码）。

## 功能

- **欢迎页**：提示"请选择或输入您的 DeepSeek Harness 地址，如 192.168.1.1:3080"；
  下方列出所有输入过的地址（按钮），列表下方输入框可添加新地址；无历史地址时不显示按钮区。
- **浏览页**：顶栏（左：返回按钮；中：地址下拉，默认当前地址，点击可切换任意历史地址；
  右：强制刷新按钮）+ 页面内容。
- **Cookie 与存储**：远程页面（DeepSeek Harness）的 Cookie / localStorage / sessionStorage
  由系统 WebView 原生管理并持久化（Windows WebView2、Android WebView、iOS WKWebView），
  与普通浏览器行为一致：不同地址（源）的存储相互独立，重启 App 后保留，与系统浏览器数据隔离。
- **页面实例缓存**：48 小时内重复进入同一地址不重新加载（页面实例池保留隐藏 iframe，
  SPA 状态/滚动位置不丢）；超过 48 小时或点强制刷新才重新加载。
- **Android 状态栏**：App 内容不侵占状态栏（CI 构建时自动配置 edge-to-edge opt-out）。

## 目录结构

```
├── src/                          # 前端（React）
│   ├── lib/addresses.ts          # 地址规范化 + 地址历史持久化（localStorage）
│   ├── components/
│   │   ├── Welcome.tsx           # 欢迎页：地址按钮列表 + 新地址输入
│   │   └── BrowserView.tsx       # 浏览页：顶栏（返回/下拉/刷新）+ iframe
│   └── App.tsx                   # 视图状态机（欢迎页 ⇄ 浏览页）+ 浏览历史
├── src-tauri/                    # Tauri 壳（Rust）
│   ├── src/                      # Rust 代码
│   └── tauri.conf.json           # 应用配置（名称 / 标识符 / 窗口 / 图标）
└── .github/workflows/
    └── mobile-build.yml          # Android(APK/AAB) + iOS(IPA) 打包工作流
```

## 本地开发（仅写代码，不打包）

```bash
npm install        # 安装依赖
npm run tauri dev  # 启动桌面开发模式（本机已具备 Rust + MSVC + WebView2）
```

## 移动端明文 HTTP（内网地址）说明

DeepSeek Harness 通常部署在局域网、以 `http://192.168.1.1:3080` 明文访问，而移动系统默认禁止：

- **Android**：使用 `--debug` 构建，Tauri Android 模板的 debug 构建自动放行明文流量
  （`usesCleartextTraffic=true`），无需额外配置。
- **iOS**：CI 构建时自动注入 `NSAppTransportSecurity > NSAllowsArbitraryLoads` 豁免
  （见 workflow 的 "Allow cleartext HTTP (ATS) for LAN addresses" 步骤）。

## CI 打包（GitHub Actions）

推送到 GitHub 后：

1. **手动触发**：仓库 Actions 页面 → `mobile-build` → Run workflow，可选 `both / android / ios`；
   构建完成后**默认自动发布 GitHub Release**（可取消勾选 `publish_release`，也可自定义 `release_tag`）；
2. **打 tag 自动触发**：`git tag v0.1.0 && git push origin v0.1.0`，同时构建 Android 和 iOS；
   Android 产物自动发布到 GitHub Release，iOS 产物在 Actions artifacts 中下载。

Android 工程与 iOS 工程（`gen/apple`）均在 CI 内自动生成（iOS 需要 macOS runner 执行
`tauri ios init`），无需在本地生成或提交。

> 说明：tauri-action 的移动端支持从未发布（仅 dev 分支），因此 workflow 直接调用
> `tauri` CLI 构建（`android build --debug --apk --aab` / `ios build`）。

### 需要配置的 Secrets（仓库 Settings → Secrets and variables → Actions）

| Secret | 必填 | 说明 |
|---|---|---|
| `GITHUB_TOKEN` | ✅（自动存在） | 发布 GitHub Release 用，无需手动配置 |
| `ANDROID_KEYSTORE_BASE64` | Android 正式包必填 | keystore 文件的 base64（`certutil -encode` / `base64` 生成）；配置后构建**正式签名 release 包**（按 ABI 拆分，单包 20–35MB） |
| `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_PASSWORD` | 同上 | keystore 与密钥密码（建议只用字母数字） |
| `ANDROID_KEY_ALIAS` | 同上 | 密钥别名（如 `upload`） |
| `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | iOS 真机包必填 | iOS 签名，需要 Apple Developer Program 付费账号；**不配则 iOS 构建失败**（预期行为） |

> Android 未配置签名 Secrets 时，回退构建 debug 签名包（可安装测试，但体积大，约 400MB）；
> 配置后构建正式签名 release 包（APK/AAB，`--split-per-abi` 按架构拆分，单包约 20–35MB）。
> keystore 生成命令：`keytool -genkey -v -keystore upload-keystore.jks -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias upload`（JDK 自带 keytool）。

### iOS 注意事项

- iOS 的 Xcode 工程（`src-tauri/gen/apple`）只能由 **macOS** 生成，CI 的 macos-14 runner 会自动执行
  `tauri ios init` 完成，Windows 本机无法交叉编译 iOS。
- 免费 Apple 账号无法在 CI 上长期签名分发；未配置签名 Secrets 时真机构建会失败。

## 应用标识

- bundle identifier：`com.dsh.app`（在 `src-tauri/tauri.conf.json` 中修改）
- productName：`dsh-app`（即安装包/可执行文件名）
