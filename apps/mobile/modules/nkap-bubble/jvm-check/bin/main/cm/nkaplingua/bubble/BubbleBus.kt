package cm.nkaplingua.bubble

/**
 * Pont en mémoire, dans le même processus, entre le service de la bulle et le module Expo.
 * Aucun broadcast système : le contenu de l'écran ne transite jamais hors de l'application.
 */
object BubbleBus {
  @Volatile
  var onScreenRead: ((ScreenRead) -> Unit)? = null

  @Volatile
  var onRunningChange: ((Boolean) -> Unit)? = null
}
