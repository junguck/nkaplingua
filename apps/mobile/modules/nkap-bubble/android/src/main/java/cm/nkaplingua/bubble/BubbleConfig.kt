package cm.nkaplingua.bubble

import android.content.Context

/** Liste blanche des applications que la bulle a le droit de lire. Vide par défaut. */
class BubbleConfig(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  var allowedPackages: Set<String>
    // getStringSet renvoie l'instance interne : on la copie avant toute utilisation.
    get() = prefs.getStringSet(KEY_ALLOWED, emptySet())?.toSet() ?: emptySet()
    set(value) {
      prefs.edit().putStringSet(KEY_ALLOWED, value.toSet()).apply()
    }

  private companion object {
    const val PREFS = "nkap_bubble"
    const val KEY_ALLOWED = "allowed_packages"
  }
}
