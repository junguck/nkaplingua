package cm.nkaplingua.bubble

/** Fiche déjà rendue dans la langue par le moteur TypeScript : Kotlin ne fait que l'afficher. */
data class BubbleCard(
  val title: String,
  val rows: List<CardRow>,
  val alerts: List<CardAlert>,
  val footer: String,
)

data class CardRow(val label: String, val value: String)

data class CardAlert(val level: AlertLevel, val text: String)

enum class AlertLevel {
  DANGER, WARNING, INFO;

  companion object {
    fun fromWire(value: String): AlertLevel = when (value) {
      "danger" -> DANGER
      "warning" -> WARNING
      else -> INFO
    }
  }
}

/** Statuts du contrat `ScreenReadEvent` de `@nkap/client`. */
enum class ReadStatus(val wire: String) {
  OK("ok"),
  NOT_ALLOWED("not_allowed"),
  ACCESSIBILITY_OFF("accessibility_off"),
  EMPTY("empty"),
}

data class ScreenRead(val status: ReadStatus, val packageName: String?, val lines: List<String>)
