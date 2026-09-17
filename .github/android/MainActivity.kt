// dsh-app 安卓原生顶部工具条（返回中枢 / 刷新 / 当前地址 + 切换地址）。
//
// 为什么必须用原生 View：安卓上 Tauri/wry 每个 Activity 只有一个 WebView
// （wry 的 Activity 代理里只有一个 webview 槽位），而远程 DSH 页面又必须作为
// 顶层文档承载（iframe 是第三方上下文，会话 Cookie 会被丢弃 → 口令页闪烁，
// 见仓库 AGENTS.md 第 3 节）。所以「页面顶部的功能栏」只能由原生 View 叠在
// WebView 上方，没有纯前端方案。
//
// 注入方式：CI（.github/workflows/build-android.yml）在 `tauri android init`
// 之后用本文件覆盖模板生成的 MainActivity.kt，并把 __PACKAGE__ 替换为
// tauri.conf.json 里的 identifier。Tauri/wry 升级后要对照模板复查
// （挂载点依赖 WryActivity.onWebViewCreate 与 Tauri 的 setContentView 顺序，
// 见 AGENTS.md 第 4 节）。
//
// 前端（地址中枢页，本地页面）通过 window.dshBar 调用：
//   openRemote(url, label, origin, addressesJson) —— 显示工具条并把 WebView 导航到该地址
//   hide()                                        —— 隐藏工具条
// 桥只接受来自中枢页 origin 的调用：远程页面虽然也能看到 dshBar 对象，但调用会被忽略。

package __PACKAGE__

import android.graphics.drawable.Drawable
import android.os.Bundle
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.PopupMenu
import android.widget.TextView
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONArray

/** 工具条背景色（深色，配合浅色状态栏图标） */
private const val BAR_COLOR = 0xFF1F2430.toInt()

/** 工具条文字色 */
private const val BAR_TEXT_COLOR = 0xFFE8EAED.toInt()

// 注意：`TauriActivity`（以及 wry 的 `WryActivity`）由 CLI 生成在**本 App 的包**里
// （tauri 的 build.rs 用 WRY_ANDROID_PACKAGE 替换模板里的 {{package}}），所以这里
// **不要**写 `import app.tauri.TauriActivity` —— `app.tauri` 只放插件类（AppPlugin 等）。
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // onWebViewCreate 由 WryActivity.setWebView() 触发，而 Tauri 随后才调用
    // setContentView(webView)：所以排到下一个主线程任务再挂工具条，那时 WebView
    // 已经是内容视图，工具条可以作为它的兄弟 View 叠在上方。
    webView.post { NativeTopBar(this@MainActivity, webView).install() }
  }
}

/**
 * 顶部工具条：叠在 WebView 之上，避让状态栏，并接住中枢页的 window.dshBar 调用。
 *
 * 这里刻意保持 public：`@JavascriptInterface` 方法由 WebView 通过反射调用，
 * 非 public 的类在部分 Android 版本上会因访问检查失败而静默失效。
 *
 * @param activity 宿主 Activity（同时用于取 window / 注册返回键回调）。
 * @param webView  Tauri 的 WebView，工具条操作的都是它。
 */
class NativeTopBar(private val activity: TauriActivity, private val webView: WebView) {
  private val density = activity.resources.displayMetrics.density

  /** 工具条本体高度（不含状态栏避让部分） */
  private val rowHeight = (44 * density).toInt()

  private val bar = LinearLayout(activity)
  private val barParams = FrameLayout.LayoutParams(
    ViewGroup.LayoutParams.MATCH_PARENT,
    rowHeight,
    Gravity.TOP,
  )
  private val homeButton = TextView(activity)
  private val titleView = TextView(activity)
  private val refreshButton = TextView(activity)

  /** 状态栏高度（避让用）；由 insets 回调更新，非 edge-to-edge 时为 0 */
  private var statusInset = 0
  private var visible = false
  private var hubOrigin = ""
  private var addresses: List<String> = emptyList()
  private var forcedStatusBarIcons = false
  private var originalLightStatusBar = false

  /** 把工具条挂到内容视图上（在 Tauri 的 setContentView 之后调用） */
  fun install() {
    val content = activity.findViewById<ViewGroup>(android.R.id.content) ?: return

    bar.orientation = LinearLayout.HORIZONTAL
    bar.setBackgroundColor(BAR_COLOR)
    bar.visibility = View.GONE
    bar.layoutParams = barParams

    styleButton(homeButton, "←", "返回地址中枢") { goHome() }
    styleButton(refreshButton, "⟳", "刷新") { webView.reload() }
    titleView.apply {
      setTextColor(BAR_TEXT_COLOR)
      textSize = 15f
      gravity = Gravity.CENTER_VERTICAL
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      setPadding((12 * density).toInt(), 0, (12 * density).toInt(), 0)
      background = selectableBackground()
      setOnClickListener { showAddressMenu() }
    }

    bar.addView(homeButton, LinearLayout.LayoutParams(rowHeight, rowHeight))
    bar.addView(titleView, LinearLayout.LayoutParams(0, rowHeight, 1f))
    bar.addView(refreshButton, LinearLayout.LayoutParams(rowHeight, rowHeight))
    content.addView(bar)

    // 状态栏避让：insets 为 0（主题已 opt-out edge-to-edge）时什么都不做；
    // 被强制 edge-to-edge 时把状态栏高度让给工具条，页面整体下移。
    ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
      applyStatusInset(insets.getInsets(WindowInsetsCompat.Type.statusBars()).top)
      insets
    }
    ViewCompat.requestApplyInsets(content)

    webView.addJavascriptInterface(Bridge(), "dshBar")

    // 返回键：浏览远程页面时先回中枢（工具条会同步隐藏）；
    // 其他情况交回 Tauri（AppPlugin 会做历史回退，不能再回退才退出 App）。
    activity.onBackPressedDispatcher.addCallback(
      activity,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          if (visible) {
            goHome()
          } else {
            isEnabled = false
            activity.onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        }
      },
    )
  }

  /** 状态栏避让：工具条自身顶到屏幕顶端，内容放在状态栏下方；WebView 让出对应高度 */
  private fun applyStatusInset(top: Int) {
    if (top == statusInset) return
    statusInset = top
    bar.setPadding(0, top, 0, 0)
    barParams.height = rowHeight + top
    bar.layoutParams = barParams
    applyWebViewInset()
    if (visible) applyStatusBarIcons(darkBar = true)
  }

  /** WebView 顶部让出的高度 = 状态栏（工具条可见时再加工具条本体高度） */
  private fun applyWebViewInset() {
    val top = statusInset + if (visible) rowHeight else 0
    if (webView.paddingTop != top) webView.setPadding(0, top, 0, 0)
  }

  /** 工具条是深色的：只有当它真的伸进状态栏区域时才把状态栏图标切成浅色 */
  private fun applyStatusBarIcons(darkBar: Boolean) {
    val controller = WindowInsetsControllerCompat(activity.window, bar)
    if (darkBar && statusInset > 0) {
      if (!forcedStatusBarIcons) {
        originalLightStatusBar = controller.isAppearanceLightStatusBars
        forcedStatusBarIcons = true
      }
      controller.isAppearanceLightStatusBars = false
    } else if (forcedStatusBarIcons) {
      controller.isAppearanceLightStatusBars = originalLightStatusBar
      forcedStatusBarIcons = false
    }
  }

  private fun showBar(label: String) {
    titleView.text = if (addresses.size > 1) "$label  ▾" else label
    visible = true
    bar.visibility = View.VISIBLE
    applyWebViewInset()
    applyStatusBarIcons(darkBar = true)
  }

  private fun hideBar() {
    if (!visible) return
    visible = false
    bar.visibility = View.GONE
    applyWebViewInset()
    applyStatusBarIcons(darkBar = false)
  }

  /** 回到地址中枢：隐藏工具条并把 WebView 导航回中枢页 */
  private fun goHome() {
    val origin = hubOrigin
    hideBar()
    when {
      origin.isNotEmpty() -> webView.loadUrl(origin)
      webView.canGoBack() -> webView.goBack()
    }
  }

  /** 点地址文字：下拉列出中枢传来的历史地址，直接切换 */
  private fun showAddressMenu() {
    if (addresses.isEmpty()) return
    val menu = PopupMenu(activity, titleView)
    val current = titleView.text.toString()
    addresses.forEachIndexed { index, address ->
      menu.menu.add(0, index, index, if (current.startsWith(address)) "● $address" else address)
    }
    menu.setOnMenuItemClickListener { item ->
      val address = addresses.getOrNull(item.itemId) ?: return@setOnMenuItemClickListener false
      showBar(address)
      webView.loadUrl(if (address.startsWith("http")) address else "http://$address")
      true
    }
    menu.show()
  }

  /** 只有中枢页 origin 的调用才认（本方法在 UI 线程调用） */
  private fun isFromHub(origin: String): Boolean {
    if (origin.isEmpty()) return false
    val current = webView.url ?: return false
    return current.startsWith(origin)
  }

  private fun styleButton(view: TextView, glyph: String, description: String, onClick: () -> Unit) {
    view.apply {
      this.text = glyph
      textSize = 20f
      gravity = Gravity.CENTER
      setTextColor(BAR_TEXT_COLOR)
      contentDescription = description
      background = selectableBackground()
      setOnClickListener { onClick() }
    }
  }

  private fun selectableBackground(): Drawable? {
    val attrs = intArrayOf(android.R.attr.selectableItemBackgroundBorderless)
    val typed = activity.obtainStyledAttributes(attrs)
    val drawable = typed.getDrawable(0)
    typed.recycle()
    return drawable
  }

  private fun parseAddresses(json: String): List<String> {
    if (json.isEmpty()) return emptyList()
    return try {
      val array = JSONArray(json)
      (0 until array.length()).mapNotNull { index ->
        array.optString(index).takeIf { it.isNotEmpty() }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  /** 中枢页（本地页面）的调用入口；远程页面同样能看到它，但会被 origin 校验挡掉 */
  inner class Bridge {
    @JavascriptInterface
    fun openRemote(url: String, label: String, origin: String, addressesJson: String) {
      activity.runOnUiThread {
        if (!isFromHub(origin)) return@runOnUiThread
        hubOrigin = origin
        addresses = parseAddresses(addressesJson)
        showBar(label)
        webView.loadUrl(url)
      }
    }

    @JavascriptInterface
    fun hide() {
      activity.runOnUiThread {
        if (isFromHub(hubOrigin)) hideBar()
      }
    }
  }
}
