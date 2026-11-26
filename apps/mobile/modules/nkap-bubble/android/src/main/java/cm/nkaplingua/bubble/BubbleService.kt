package cm.nkaplingua.bubble

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import kotlin.math.abs

/**
 * Bulle flottante au-dessus des autres applications.
 * Toucher → lecture ponctuelle de l'écran (liste blanche) → le moteur TypeScript rend la fiche
 * dans la langue de l'utilisateur → [show] l'affiche. Si le moteur JS ne répond pas
 * (processus JS suspendu), on ouvre l'application plutôt que de laisser l'utilisateur sans réponse.
 */
class BubbleService : Service() {
  private lateinit var windowManager: WindowManager
  private val handler = Handler(Looper.getMainLooper())
  private var bubble: View? = null
  private var panel: View? = null
  private var pendingFallback: Runnable? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    startInForeground()
    addBubble()
    instance = this
    BubbleBus.onRunningChange?.invoke(true)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

  override fun onDestroy() {
    pendingFallback?.let(handler::removeCallbacks)
    removeOverlay(panel)
    removeOverlay(bubble)
    panel = null
    bubble = null
    instance = null
    BubbleBus.onRunningChange?.invoke(false)
    super.onDestroy()
  }

  // region bulle

  @SuppressLint("ClickableViewAccessibility")
  private fun addBubble() {
    val size = dp(60)
    val view = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(BubbleColors.PRIMARY)
      }
      elevation = dp(8).toFloat()
      contentDescription = getString(R.string.nkap_bubble_notification)
      addView(
        ImageView(context).apply { setImageDrawable(packageManager.getApplicationIcon(packageName)) },
        FrameLayout.LayoutParams(dp(40), dp(40), Gravity.CENTER),
      )
    }
    val params = overlayParams(size, size).apply {
      gravity = Gravity.TOP or Gravity.START
      x = dp(12)
      y = dp(180)
    }
    view.setOnTouchListener(DragOrTap(params, view) { onBubbleTapped() })
    windowManager.addView(view, params)
    bubble = view
  }

  /** Glisser déplace la bulle ; un toucher bref la déclenche. */
  private inner class DragOrTap(
    private val params: WindowManager.LayoutParams,
    private val view: View,
    private val onTap: () -> Unit,
  ) : View.OnTouchListener {
    private val slop = ViewConfiguration.get(this@BubbleService).scaledTouchSlop
    private var startX = 0
    private var startY = 0
    private var downX = 0f
    private var downY = 0f
    private var dragging = false

    override fun onTouch(v: View, event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          startX = params.x
          startY = params.y
          downX = event.rawX
          downY = event.rawY
          dragging = false
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downX
          val dy = event.rawY - downY
          if (dragging || abs(dx) > slop || abs(dy) > slop) {
            dragging = true
            params.x = startX + dx.toInt()
            params.y = startY + dy.toInt()
            windowManager.updateViewLayout(view, params)
          }
        }
        MotionEvent.ACTION_UP -> if (!dragging) {
          v.performClick()
          onTap()
        }
      }
      return true
    }
  }

  private fun onBubbleTapped() {
    val reader = ScreenReaderService.instance
    val read = reader?.read(BubbleConfig(this).allowedPackages) ?: ScreenRead(ReadStatus.ACCESSIBILITY_OFF, null, emptyList())
    val listener = BubbleBus.onScreenRead
    if (listener == null) {
      openApp()
      return
    }
    pendingFallback?.let(handler::removeCallbacks)
    pendingFallback = Runnable { openApp() }.also { handler.postDelayed(it, ENGINE_TIMEOUT_MS) }
    listener(read)
  }

  // endregion

  // region fiche

  private fun display(card: BubbleCard) {
    pendingFallback?.let(handler::removeCallbacks)
    pendingFallback = null
    removeOverlay(panel)
    val view = CardPanelView(this, card, getString(R.string.nkap_bubble_close)) { dismissPanel() }
    val params = overlayParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT).apply {
      gravity = Gravity.BOTTOM
      // Marges latérales + hauteur bornée : la fiche ne masque jamais tout l'écran de l'appli lue.
      width = resources.displayMetrics.widthPixels - dp(24)
      y = dp(16)
    }
    view.measure(
      View.MeasureSpec.makeMeasureSpec(params.width, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec((resources.displayMetrics.heightPixels * MAX_PANEL_RATIO).toInt(), View.MeasureSpec.AT_MOST),
    )
    params.height = view.measuredHeight
    windowManager.addView(view, params)
    panel = view
  }

  private fun dismissPanel() {
    removeOverlay(panel)
    panel = null
  }

  // endregion

  private fun overlayParams(width: Int, height: Int): WindowManager.LayoutParams {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    // NOT_FOCUSABLE : l'appli lue reste la fenêtre active, la bulle ne se lit jamais elle-même.
    val flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
    return WindowManager.LayoutParams(width, height, type, flags, PixelFormat.TRANSLUCENT)
  }

  private fun removeOverlay(view: View?) {
    if (view?.isAttachedToWindow == true) windowManager.removeView(view)
  }

  private fun openApp() {
    pendingFallback = null
    // Une appli qui détient SYSTEM_ALERT_WINDOW peut démarrer une activité depuis l'arrière-plan.
    packageManager.getLaunchIntentForPackage(packageName)?.let { launch ->
      startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
    }
  }

  private fun startInForeground() {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    val notification: Notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, getString(R.string.nkap_bubble_channel), NotificationManager.IMPORTANCE_MIN))
      Notification.Builder(this, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle(getString(R.string.nkap_bubble_channel))
      .setContentText(getString(R.string.nkap_bubble_notification))
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val CHANNEL_ID = "nkap_bubble"
    private const val NOTIFICATION_ID = 4237
    private const val ENGINE_TIMEOUT_MS = 2_000L
    private const val MAX_PANEL_RATIO = 0.6

    @Volatile
    private var instance: BubbleService? = null

    val isRunning: Boolean
      get() = instance != null

    /** Appelé par le module Expo (thread JS) : l'affichage se fait sur le thread principal. */
    fun show(card: BubbleCard): Boolean {
      val service = instance ?: return false
      service.handler.post { service.display(card) }
      return true
    }
  }
}
