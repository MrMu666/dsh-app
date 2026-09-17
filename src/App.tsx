import AddressHub from "./components/AddressHub";
import "./App.css";

/**
 * 应用主窗口 = 地址中枢。
 *
 * DeepSeek Harness 页面不再嵌在本窗口的 iframe 里，而是由 AddressHub 通过
 * `WebviewWindow` 在独立顶层窗口中打开：只有顶层文档才能让 DSH 的登录 Cookie
 * 成为第一方（否则局域网口令页会因第三方 Cookie 被拦而反复闪烁）。
 */
function App() {
  return <AddressHub />;
}

export default App;
