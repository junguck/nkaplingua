package expo.modules.kotlin.modules
import android.content.Context
class AppContextStub { val reactContext: Context? = null }
abstract class Module {
  val appContext: AppContextStub = AppContextStub()
  abstract fun definition(): ModuleDefinitionData
  fun sendEvent(name: String, body: Map<String, Any?>) {}
}
class ModuleDefinitionData
class ModuleDefinitionBuilder {
  fun Name(name: String) {}
  fun Events(vararg names: String) {}
  fun OnCreate(body: () -> Unit) {}
  fun OnDestroy(body: () -> Unit) {}
  // Signatures recopiées d'expo-modules-core 58 (ObjectDefinitionBuilder).
  @JvmName("FunctionWithoutArgs")
  inline fun Function(name: String, crossinline body: () -> Any?) {}
  inline fun <reified R> Function(name: String, crossinline body: () -> R) {}
  inline fun <reified R, reified P0> Function(name: String, crossinline body: (p0: P0) -> R) {}
}
@Suppress("FunctionName")
fun ModuleDefinition(block: ModuleDefinitionBuilder.() -> Unit): ModuleDefinitionData = ModuleDefinitionData().also { ModuleDefinitionBuilder().block() }
