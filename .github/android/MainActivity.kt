// dsh-app 安卓原生顶部工具条（返回地址中枢 / 当前地址 + 切换 / 刷新）。
//
// 为什么必须用原生 View：安卓上 Tauri/wry 每个 Activity 只有一个 WebView
// （wry 的 Activity 代理里只有一个 webview 槽位），而远程 DSH 页面又必须作为
// 顶层文档承载（iframe 是第三方上下文，会话 Cookie 会被丢弃 → 口令页闪烁，
// 见仓库 AGENTS.md 第 3 节）。所以「页面顶部的功能栏」只能由原生 View 实现，
// 没有纯前端方案。
//
// 布局：工具条**占位**在 WebView 上方（不是盖在上面）——WebView 用顶部 margin
// 让出「状态栏 + 工具条」的高度，所以页面是从工具条下沿开始渲染的，主页面高度
// 自动变小，顶部内容不会被遮挡。
//
// 外观：对齐旧版 iframe 顶栏（BrowserView，已删除，见 git 历史）：浅灰底
// (#F3F4F6) + 白色圆角地址胶囊 + 1dp 底部分隔线 (#E5E7EB) + 左右 40dp 图标按钮；
// 地址文字居中；深色模式跟随系统（#1F2937 / #374151 / #111827，与旧版一致）。
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

import android.content.res.Configuration
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
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

// 注意：`TauriActivity`（以及 wry 的 `WryActivity`）由 CLI 生成在**本 App 的包**里
// （tauri 的 build.rs 用 WRY_ANDROID_PACKAGE 替换模板里的 {{package}}），所以这里
// **不要**写 `import app.tauri.TauriActivity` —— `app.tauri` 只放插件类（AppPlugin 等）。
class MainActivity : TauriActivity() {
  private var topBar: NativeTopBar? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // onWebViewCreate 由 WryActivity.setWebView() 触发，而 Tauri 随后才调用
    // setContentView(webView)：所以排到下一个主线程任务再挂工具条，那时 WebView
    // 已经是内容视图，工具条可以作为它的兄弟 View 占据上方空间。
    webView.post {
      val bar = NativeTopBar(this@MainActivity, webView)
      topBar = bar
      bar.install()
    }
  }

  /** 深色/浅色切换后同步工具条配色（前提是 Activity 没有因该配置被重建） */
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    topBar?.refreshTheme()
  }
}

/**
 * 顶部工具条：占据 WebView 上方的空间（WebView 用 margin 让位，不遮挡页面），
 * 避让状态栏，并接住中枢页的 window.dshBar 调用。
 *
 * 这里刻意保持 public：`@JavascriptInterface` 方法由 WebView 通过反射调用，
 * 非 public 的类在部分 Android 版本上会因访问检查失败而静默失效。
 *
 * @param activity 宿主 Activity（同时用于取 window / 注册返回键回调）。
 * @param webView  Tauri 的 WebView，工具条操作的都是它。
 */
class NativeTopBar(private val activity: TauriActivity, private val webView: WebView) {
  private val density = activity.resources.displayMetrics.density

  /** 图标按钮尺寸（与旧版 iframe 顶栏的 40px 按钮一致） */
  private val controlSize = (40 * density).toInt()

  /** 工具条内边距（旧版为 8px） */
  private val barPad = (8 * density).toInt()

  /** 底部分隔线高度（旧版 border-bottom: 1px） */
  private val dividerHeight = density.toInt().coerceAtLeast(1)

  /** 工具条总高（不含状态栏避让部分） */
  private val barHeight = controlSize + barPad * 2 + dividerHeight

  /** 垂直线性布局：内容行 + 底部分隔线 */
  private val bar = LinearLayout(activity)

  /** 水平内容行：返回 / 地址 / 刷新 */
  private val barRow = LinearLayout(activity)
  private val divider = View(activity)
  private val barParams = FrameLayout.LayoutParams(
    ViewGroup.LayoutParams.MATCH_PARENT,
    barHeight,
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

    bar.orientation = LinearLayout.VERTICAL
    bar.visibility = View.GONE
    bar.layoutParams = barParams

    barRow.orientation = LinearLayout.HORIZONTAL
    barRow.setPadding(barPad, barPad, barPad, barPad)
    barRow.layoutParams = LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      controlSize + barPad * 2,
    )

    styleButton(homeButton, "←", "返回地址中枢") { goHome() }
    styleButton(refreshButton, "⟳", "刷新") { webView.reload() }
    titleView.apply {
      textSize = 14f
      gravity = Gravity.CENTER
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
      setOnClickListener { showAddressMenu() }
    }

    // 地址胶囊居中：左右用等宽的图标按钮夹住，中间权重占满
    barRow.addView(homeButton, LinearLayout.LayoutParams(controlSize, controlSize))
    barRow.addView(
      titleView,
      LinearLayout.LayoutParams(0, controlSize, 1f).apply {
        marginStart = barPad
        marginEnd = barPad
      },
    )
    barRow.addView(refreshButton, LinearLayout.LayoutParams(controlSize, controlSize))

    bar.addView(barRow)
    bar.addView(divider, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dividerHeight))
    content.addView(bar)

    applyTheme()

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

  /** 深色/浅色切换时刷新配色（由 MainActivity.onConfigurationChanged 调用） */
  fun refreshTheme() {
    applyTheme()
    if (visible) applyStatusBarIcons(force = true)
  }

  private fun nightMode(): Boolean {
    val mode = activity.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    return mode == Configuration.UI_MODE_NIGHT_YES
  }

  /** 配色对齐旧版 iframe 顶栏；深色模式跟随系统 */
  private fun applyTheme() {
    val night = nightMode()
    val barColor = if (night) 0xFF1F2937.toInt() else 0xFFF3F4F6.toInt()
    val lineColor = if (night) 0xFF374151.toInt() else 0xFFE5E7EB.toInt()
    val textColor = if (night) 0xFFF6F6F6.toInt() else 0xFF111827.toInt()
    val pillColor = if (night) 0xFF111827.toInt() else 0xFFFFFFFF.toInt()

    bar.setBackgroundColor(barColor)
    divider.setBackgroundColor(lineColor)
    homeButton.setTextColor(textColor)
    refreshButton.setTextColor(textColor)
    titleView.setTextColor(textColor)
    titleView.background = pillBackground(pillColor, lineColor)
  }

  /** 地址胶囊：白色圆角 + 1px 描边（对应旧版的 .bar-address） */
  private fun pillBackground(fill: Int, stroke: Int): Drawable =
    GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = 8 * density
      setColor(fill)
      setStroke(dividerHeight, stroke)
    }

  /** 状态栏避让：工具条自身顶到屏幕顶端，内容放在状态栏下方；WebView 让出对应高度 */
  private fun applyStatusInset(top: Int) {
    if (top == statusInset) return
    statusInset = top
    bar.setPadding(0, top, 0, 0)
    barParams.height = barHeight + top
    bar.layoutParams = barParams
    applyWebViewLayout()
    if (visible) applyStatusBarIcons(force = true)
  }

  /**
   * 主页面整体下移：给 WebView 设顶部 margin =「状态栏 + 工具条」，
   * 于是页面高度自动缩小、从工具条下沿开始渲染 —— 不是盖在页面上。
   */
  private fun applyWebViewLayout() {
    val offset = statusInset + if (visible) barHeight else 0
    val current = webView.layoutParams
    if (
      current is FrameLayout.LayoutParams &&
      current.topMargin == offset &&
      current.height == ViewGroup.LayoutParams.MATCH_PARENT
    ) {
      return
    }
    webView.layoutParams = FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT,
    ).apply { topMargin = offset }
  }

  /** 工具条伸进状态栏区域时，按工具条明暗切换状态栏图标颜色 */
  private fun applyStatusBarIcons(force: Boolean) {
    val controller = WindowInsetsControllerCompat(activity.window, bar)
    if (force && statusInset > 0) {
      if (!forcedStatusBarIcons) {
        originalLightStatusBar = controller.isAppearanceLightStatusBars
        forcedStatusBarIcons = true
      }
      // 浅色工具条 → 深色图标；深色工具条 → 浅色图标
      controller.isAppearanceLightStatusBars = !nightMode()
    } else if (forcedStatusBarIcons) {
      controller.isAppearanceLightStatusBars = originalLightStatusBar
      forcedStatusBarIcons = false
    }
  }

  private fun showBar(label: String) {
    titleView.text = if (addresses.size > 1) "$label  ▾" else label
    visible = true
    bar.visibility = View.VISIBLE
    applyTheme()
    applyWebViewLayout()
    applyStatusBarIcons(force = true)
  }

  private fun hideBar() {
    if (!visible) return
    visible = false
    bar.visibility = View.GONE
    applyWebViewLayout()
    applyStatusBarIcons(force = false)
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

  /** 点地址：下拉列出中枢传来的历史地址，直接切换 */
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
