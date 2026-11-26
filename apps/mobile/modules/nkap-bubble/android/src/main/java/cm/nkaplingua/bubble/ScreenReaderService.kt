package cm.nkaplingua.bubble

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Service d'accessibilité PASSIF (ADR 0002) : il n'agit que lorsque la bulle appelle [read].
 * - aucun événement traité, aucune lecture en arrière-plan ;
 * - une application hors liste blanche n'est même pas parcourue ;
 * - les champs mot de passe / code secret ne sont jamais lus.
 */
class ScreenReaderService : AccessibilityService() {

  override fun onServiceConnected() {
    instance = this
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: Intent?): Boolean {
    instance = null
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  fun read(allowedPackages: Set<String>): ScreenRead {
    val root = rootInActiveWindow ?: return ScreenRead(ReadStatus.EMPTY, null, emptyList())
    val target = root.packageName?.toString()
    if (target == null || target == packageName) return ScreenRead(ReadStatus.EMPTY, target, emptyList())
    if (target !in allowedPackages) return ScreenRead(ReadStatus.NOT_ALLOWED, target, emptyList())

    val lines = ArrayList<String>()
    collect(root, lines, depth = 0)
    return ScreenRead(if (lines.isEmpty()) ReadStatus.EMPTY else ReadStatus.OK, target, lines)
  }

  private fun collect(node: AccessibilityNodeInfo, out: MutableList<String>, depth: Int) {
    if (out.size >= MAX_LINES || depth > MAX_DEPTH || !node.isVisibleToUser || node.isPassword) return
    val text = node.text?.toString()?.trim().orEmpty()
    val description = node.contentDescription?.toString()?.trim().orEmpty()
    when {
      text.isNotEmpty() -> out.add(text.take(MAX_LINE_LENGTH))
      description.isNotEmpty() -> out.add(description.take(MAX_LINE_LENGTH))
    }
    for (i in 0 until node.childCount) {
      val child = node.getChild(i) ?: continue
      collect(child, out, depth + 1)
    }
  }

  companion object {
    private const val MAX_LINES = 200
    private const val MAX_DEPTH = 40
    private const val MAX_LINE_LENGTH = 500

    @Volatile
    var instance: ScreenReaderService? = null
      private set

    fun isEnabled(context: Context): Boolean {
      val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
      val self = ComponentName(context, ScreenReaderService::class.java).flattenToString()
      return enabled.split(':').any { it.equals(self, ignoreCase = true) }
    }
  }
}
