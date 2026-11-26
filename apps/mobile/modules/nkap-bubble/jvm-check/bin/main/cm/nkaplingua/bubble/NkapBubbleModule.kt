package cm.nkaplingua.bubble

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

private const val SCREEN_READ_EVENT = "onScreenRead"
private const val RUNNING_EVENT = "onRunningChange"

class RowRecord : Record {
  @Field val label: String = ""
  @Field val value: String = ""
}

class AlertRecord : Record {
  @Field val level: String = "info"
  @Field val text: String = ""
}

/** Miroir de `BubbleCardPayload` (`@nkap/client`). */
class CardRecord : Record {
  @Field val title: String = ""
  @Field val rows: List<RowRecord> = emptyList()
  @Field val alerts: List<AlertRecord> = emptyList()
  @Field val footer: String = ""

  fun toBubbleCard() = BubbleCard(
    title = title,
    rows = rows.map { CardRow(it.label, it.value) },
    alerts = alerts.map { CardAlert(AlertLevel.fromWire(it.level), it.text) },
    footer = footer,
  )
}

class OverlayPermissionMissing : CodedException("La permission « Afficher par-dessus les autres applis » n'est pas accordée.")

/** Façade JS de la bulle. Ne contient aucune logique linguistique : tout le rendu est fait en TypeScript. */
class NkapBubbleModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "Contexte Android indisponible" }

  override fun definition() = ModuleDefinition {
    Name("NkapBubble")

    Events(SCREEN_READ_EVENT, RUNNING_EVENT)

    OnCreate {
      BubbleBus.onScreenRead = { read ->
        sendEvent(SCREEN_READ_EVENT, mapOf("status" to read.status.wire, "packageName" to read.packageName, "lines" to read.lines))
      }
      BubbleBus.onRunningChange = { running -> sendEvent(RUNNING_EVENT, mapOf("running" to running)) }
    }

    OnDestroy {
      BubbleBus.onScreenRead = null
      BubbleBus.onRunningChange = null
    }

    Function("hasOverlayPermission") { Settings.canDrawOverlays(context) }

    Function("openOverlaySettings") {
      openSettings(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
    }

    Function("isAccessibilityEnabled") { ScreenReaderService.isEnabled(context) }

    Function("openAccessibilitySettings") { openSettings(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }

    Function("setAllowedPackages") { packages: List<String> -> BubbleConfig(context).allowedPackages = packages.toSet() }

    Function("getAllowedPackages") { BubbleConfig(context).allowedPackages.sorted() }

    Function("start") {
      if (!Settings.canDrawOverlays(context)) throw OverlayPermissionMissing()
      val intent = Intent(context, BubbleService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    Function("stop") { context.stopService(Intent(context, BubbleService::class.java)) }

    Function("isRunning") { BubbleService.isRunning }

    Function("showCard") { card: CardRecord -> BubbleService.show(card.toBubbleCard()) }
  }

  private fun openSettings(intent: Intent) {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
}
