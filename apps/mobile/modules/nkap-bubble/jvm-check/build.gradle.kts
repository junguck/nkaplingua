/*
 * Vérification de compilation du Kotlin de la bulle SANS SDK Android :
 * les sources sont compilées contre le framework Android 15 publié sur Maven Central
 * (jar `android-all` de Robolectric), avec des stubs minimaux pour `R` et l'API Expo
 * (signatures recopiées d'expo-modules-core 58). Ne remplace pas `expo run:android`.
 *
 *   cd apps/mobile/modules/nkap-bubble/jvm-check && gradle compileKotlin
 */
plugins { kotlin("jvm") version "2.1.21" }

repositories { mavenCentral() }

dependencies { compileOnly("org.robolectric:android-all:15-robolectric-14663667") }

kotlin { compilerOptions { allWarningsAsErrors.set(true) } }

sourceSets { main { kotlin.srcDirs("src/main/kotlin", "../android/src/main/java") } }
