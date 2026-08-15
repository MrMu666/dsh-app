# dsh-app

用于在 App 内打开特定一组页面的应用。基于 **Tauri 2 + React 19 + TypeScript + Vite**。

> 打包完全依赖 GitHub Actions，本机不进行打包（本机只用于编写和调试代码）。

## 目录结构

```
├── src/                  # 前端页面（React，当前为空页面，等待需求）
├── src-tauri/            # Tauri 壳（Rust）
│   ├── src/              # Rust 代码（Tauri commands）
│   └── tauri.conf.json   # 应用配置（名称 / 标识符 / 窗口 / 图标）
└── .github/workflows/
    └── mobile-build.yml  # Android(APK/AAB) + iOS(IPA) 打包工作流
```

## 本地开发（仅写代码，不打包）

```bash
npm install        # 安装依赖
npm run tauri dev  # 启动桌面开发模式（本机已具备 Rust + MSVC + WebView2）
```

## CI 打包（GitHub Actions）

推送到 GitHub 后：

1. **手动触发**：仓库 Actions 页面 → `mobile-build` → Run workflow，可选 `both / android / ios`；
2. **打 tag 自动触发**：`git tag v0.1.0 && git push origin v0.1.0`，同时构建 Android 和 iOS，并由
   [tauri-action](https://github.com/tauri-apps/tauri-action) 发布到 GitHub Release（`app-v0.1.0`）。

### 需要配置的 Secrets（仓库 Settings → Secrets and variables → Actions）

| Secret | 必填 | 说明 |
|---|---|---|
| `GITHUB_TOKEN` | ✅（自动存在） | tauri-action 发布 Release 用，无需手动配置 |
| `ANDROID_KEYSTORE_PATH` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | 可选 | Android 正式签名（keystore 文件以 base64 存入 Secret 或放进仓库）；不配则出 debug 签名包 |
| `APPLE_CERTIFICATE` / `APPLE_CERTIFICATE_PASSWORD` / `APPLE_SIGNING_IDENTITY` / `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` | 可选 | iOS 正式签名，需要 Apple Developer Program 付费账号；不配则出未签名包 |

### iOS 注意事项

- iOS 的 Xcode 工程（`src-tauri/gen/apple`）必须在 **macOS** 上执行一次
  `npm run tauri -- ios init` 生成后**提交进仓库**，CI 才能构建。
- Windows 无法交叉编译 iOS，本机不可能出 iOS 包。

## 应用标识

- bundle identifier：`com.dsh.app`（在 `src-tauri/tauri.conf.json` 中修改）
- productName：`dsh-app`（即安装包/可执行文件名）
