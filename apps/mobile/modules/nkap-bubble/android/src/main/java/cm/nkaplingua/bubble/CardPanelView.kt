package cm.nkaplingua.bubble

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import kotlin.math.roundToInt

internal fun Context.dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

/** Palette alignée sur le web (vert Mboa Pay, ambre, rouge danger). */
internal object BubbleColors {
  val PRIMARY = Color.rgb(15, 90, 70)
  val SURFACE = Color.WHITE
  val TEXT = Color.rgb(26, 38, 33)
  val MUTED = Color.rgb(98, 112, 106)

  fun background(level: AlertLevel): Int = when (level) {
    AlertLevel.DANGER -> Color.rgb(253, 228, 225)
    AlertLevel.WARNING -> Color.rgb(253, 241, 214)
    AlertLevel.INFO -> Color.rgb(222, 243, 233)
  }

  fun foreground(level: AlertLevel): Int = when (level) {
    AlertLevel.DANGER -> Color.rgb(170, 30, 20)
    AlertLevel.WARNING -> Color.rgb(120, 70, 0)
    AlertLevel.INFO -> Color.rgb(15, 90, 70)
  }
}

/**
 * Fiche claire dessinée sans XML (pas de ressources de mise en page à fusionner dans l'app hôte).
 * Les valeurs (montants, noms, numéros) sont affichées telles quelles, en gras, jamais coupées.
 */
internal class CardPanelView(context: Context, card: BubbleCard, closeLabel: String, onClose: () -> Unit) : LinearLayout(context) {

  init {
    orientation = VERTICAL
    setPadding(context.dp(20), context.dp(16), context.dp(20), context.dp(16))
    background = GradientDrawable().apply {
      setColor(BubbleColors.SURFACE)
      cornerRadius = context.dp(20).toFloat()
    }
    elevation = context.dp(12).toFloat()

    addView(header(card.title, closeLabel, onClose))
    val body = LinearLayout(context).apply { orientation = VERTICAL }
    card.alerts.filter { it.level == AlertLevel.DANGER }.forEach { body.addView(alert(it)) }
    card.rows.forEach { body.addView(row(it)) }
    card.alerts.filter { it.level != AlertLevel.DANGER }.forEach { body.addView(alert(it)) }
    addView(ScrollView(context).apply { addView(body) }, LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f))
    if (card.footer.isNotBlank()) addView(text(card.footer, 12f, BubbleColors.MUTED).apply { setPadding(0, context.dp(10), 0, 0) })
  }

  private fun header(title: String, closeLabel: String, onClose: () -> Unit): View = LinearLayout(context).apply {
    orientation = HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    addView(text(title, 18f, BubbleColors.PRIMARY, bold = true), LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
    addView(
      text("✕", 20f, BubbleColors.MUTED).apply {
        contentDescription = closeLabel
        setPadding(context.dp(12), context.dp(4), 0, context.dp(4))
        setOnClickListener { onClose() }
      },
    )
  }

  private fun row(row: CardRow): View = LinearLayout(context).apply {
    orientation = HORIZONTAL
    gravity = Gravity.CENTER_VERTICAL
    setPadding(0, context.dp(10), 0, context.dp(10))
    addView(text(row.label, 14f, BubbleColors.MUTED), LayoutParams(0, LayoutParams.WRAP_CONTENT, 1f))
    addView(text(row.value, 16f, BubbleColors.TEXT, bold = true).apply { gravity = Gravity.END; ellipsize = null })
  }

  private fun alert(alert: CardAlert): View = text(alert.text, 14f, BubbleColors.foreground(alert.level), bold = alert.level == AlertLevel.DANGER).apply {
    setPadding(context.dp(12), context.dp(10), context.dp(12), context.dp(10))
    background = GradientDrawable().apply {
      setColor(BubbleColors.background(alert.level))
      cornerRadius = context.dp(12).toFloat()
    }
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dp(8) }
  }

  private fun text(value: String, sizeSp: Float, color: Int, bold: Boolean = false): TextView = TextView(context).apply {
    text = value
    textSize = sizeSp
    setTextColor(color)
    if (bold) typeface = Typeface.DEFAULT_BOLD
    ellipsize = TextUtils.TruncateAt.END
  }
}
