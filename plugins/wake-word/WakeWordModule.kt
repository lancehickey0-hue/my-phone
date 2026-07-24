package com.myphone.app

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

@ReactModule(name = WakeWordModule.NAME)
class WakeWordModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    companion object {
        const val NAME = "WakeWordModule"
    }

    override fun getName() = NAME

    init {
        reactContext.addLifecycleEventListener(this)
    }

    @ReactMethod
    fun startService(configJson: String) {
        try {
            val config = org.json.JSONObject(configJson)
            val prefs = reactContext.getSharedPreferences("myphone_prefs", android.content.Context.MODE_PRIVATE)
            val editor = prefs.edit()
            if (config.has("phrases")) {
                editor.putString("wake_phrases_json", config.getJSONArray("phrases").toString())
            }
            if (config.has("physicalDeviceId")) {
                editor.putString("physical_device_id", config.getString("physicalDeviceId"))
            }
            // Present only if this device has completed voice enrollment --
            // see voiceEnrollments.find(...) in (tabs)/_layout.tsx. Absent
            // means WakeWordService falls back to phrase-match-only
            // behavior, same as before speaker verification existed.
            if (config.has("referenceVector")) {
                editor.putString("reference_voiceprint_json", config.getJSONArray("referenceVector").toString())
            }
            editor.apply()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        startServiceInternal()
    }

    // Used by lifecycle callbacks (onHostResume, model-download completion)
    // that just need to (re)start listening with whatever phrases are
    // already persisted — no new phrase list to write.
    private fun startServiceInternal() {
        try {
            val intent = Intent(reactContext, WakeWordService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun stopService() {
        try {
            val intent = Intent(reactContext, WakeWordService::class.java)
            reactContext.stopService(intent)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun isModelReady(promise: Promise) {
        promise.resolve(VoskModelManager.isModelReady(reactContext))
    }

    @ReactMethod
    fun downloadModel(promise: Promise) {
        VoskModelManager.downloadModel(
            reactContext,
            onProgress = { progress ->
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("VoskDownloadProgress", progress)
            },
            onComplete = {
                promise.resolve(null)
            },
            onError = { error -> promise.reject("DOWNLOAD_ERROR", error) }
        )
    }

    // -- Speaker verification: model download --------------------------------
    // Separate ~13MB Vosk speaker-identification model, downloaded alongside
    // the ASR model in wake-word-setup.tsx. See VoskSpeakerModelManager.kt.
    @ReactMethod
    fun isSpeakerModelReady(promise: Promise) {
        promise.resolve(VoskSpeakerModelManager.isModelReady(reactContext))
    }

    @ReactMethod
    fun downloadSpeakerModel(promise: Promise) {
        VoskSpeakerModelManager.downloadModel(
            reactContext,
            onProgress = { progress ->
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("VoskSpeakerDownloadProgress", progress)
            },
            onComplete = {
                promise.resolve(null)
            },
            onError = { error -> promise.reject("DOWNLOAD_ERROR", error) }
        )
    }

    // -- Speaker verification: enrollment sample capture ----------------------
    // Records one ~4-6 second utterance via a short-lived VoskHandler instance
    // (reusing the same grammar-constrained + speaker-model recognition the
    // always-on service uses), and resolves with the resulting x-vector the
    // moment the given wake phrase is matched. Requiring a phrase match during
    // enrollment (rather than capturing any speech) both confirms the phrase
    // is actually recognizable and ties the captured voiceprint to a
    // confirmed correct utterance, not arbitrary speech.
    @ReactMethod
    fun recordVoiceSample(wakePhraseJson: String, promise: Promise) {
        if (!VoskModelManager.isModelReady(reactContext)) {
            promise.reject("MODEL_NOT_READY", "Voice model not downloaded yet")
            return
        }
        if (!VoskSpeakerModelManager.isModelReady(reactContext)) {
            promise.reject("SPEAKER_MODEL_NOT_READY", "Speaker model not downloaded yet")
            return
        }

        val phrases = try {
            val arr = org.json.JSONArray(wakePhraseJson)
            (0 until arr.length()).map { arr.getString(it).lowercase().trim() }
        } catch (e: Exception) {
            promise.reject("INVALID_PHRASE", "Could not parse wake phrase")
            return
        }

        val modelDir = File(reactContext.filesDir, "vosk-model")
        val speakerModelDir = VoskSpeakerModelManager.getModelDir(reactContext)

        // Silence the always-on listener for the duration of this recording
        // -- otherwise it also hears the same utterance and, if this device
        // has no reference voiceprint yet, could fire a real alarm/lock
        // during enrollment.
        WakeWordService.instance?.pauseForEnrollment()

        val settled = java.util.concurrent.atomic.AtomicBoolean(false)
        val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
        var voskHandler: VoskHandler? = null

        fun cleanup() {
            try { voskHandler?.stop() } catch (e: Throwable) {}
            voskHandler = null
            WakeWordService.instance?.resumeAfterEnrollment()
        }

        val timeoutRunnable = Runnable {
            if (settled.compareAndSet(false, true)) {
                cleanup()
                promise.reject("TIMEOUT", "No matching phrase heard within the recording window")
            }
        }

        voskHandler = VoskHandler(
            context = reactContext,
            modelPath = modelDir.absolutePath,
            wakePhrases = phrases,
            onWakeWordDetected = {
                // The accompanying onSpeakerVector call below is what actually
                // resolves the promise -- this is required by VoskHandler's
                // constructor but does nothing further here.
            },
            speakerModelPath = speakerModelDir.absolutePath,
            onSpeakerVector = { vector, frames ->
                if (settled.compareAndSet(false, true)) {
                    mainHandler.removeCallbacks(timeoutRunnable)
                    val resultArray = com.facebook.react.bridge.Arguments.createArray()
                    vector.forEach { resultArray.pushDouble(it.toDouble()) }
                    val result = com.facebook.react.bridge.Arguments.createMap()
                    result.putArray("vector", resultArray)
                    result.putInt("frames", frames)
                    mainHandler.post {
                        cleanup()
                        promise.resolve(result)
                    }
                }
            }
        )

        try {
            voskHandler?.start()
            mainHandler.postDelayed(timeoutRunnable, 6000)
        } catch (e: Throwable) {
            if (settled.compareAndSet(false, true)) {
                promise.reject("START_FAILED", e.message ?: "Failed to start recording")
            }
        }
    }

    // ── Device Admin — real system-level lock ──────────────────────────────
    // A JS screen cannot block Home/Back/Recents on Android; only the OS
    // itself can truly lock the device. This uses DevicePolicyManager to
    // force Android's own secure lock screen (PIN/pattern/biometric).
    private fun getDevicePolicyManager(): DevicePolicyManager =
        reactContext.getSystemService(ReactApplicationContext.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private fun getAdminComponent(): ComponentName =
        ComponentName(reactContext, LockDeviceAdminReceiver::class.java)

    @ReactMethod
    fun isDeviceAdminActive(promise: Promise) {
        try {
            val dpm = getDevicePolicyManager()
            promise.resolve(dpm.isAdminActive(getAdminComponent()))
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun requestDeviceAdmin() {
        try {
            val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, getAdminComponent())
                putExtra(
                    DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                    "My-Phone needs this to remotely lock your device to Android's real lock screen when the alarm is triggered."
                )
            }
            // Prefer launching from the actual foreground Activity -- starting
            // this specific system settings screen via the application
            // context with FLAG_ACTIVITY_NEW_TASK can silently fail to
            // surface on some devices (no crash, no error, dialog just never
            // appears). Falling back to the old NEW_TASK approach only if no
            // current Activity is available at all.
            val activity = reactContext.currentActivity
            if (activity != null) {
                activity.startActivity(intent)
            } else {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactContext.startActivity(intent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @ReactMethod
    fun lockDevice(promise: Promise) {
        try {
            val dpm = getDevicePolicyManager()
            if (!dpm.isAdminActive(getAdminComponent())) {
                promise.reject("NOT_ADMIN", "Device admin not active")
                return
            }
            dpm.lockNow()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("LOCK_FAILED", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onHostResume() {
        if (!VoskModelManager.isModelReady(reactContext)) return
        if (reactContext.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return
        // Only auto-restart if real (post-login) setup has completed at
        // least once before — signaled by wake_phrases_json having been
        // persisted, which only ever happens via the authenticated
        // startService(configJson) call in (tabs)/_layout.tsx. Without this
        // check, a system permission dialog closing during the initial
        // pre-login setup flow (dialogs count as a resume event) could
        // auto-start the service mid-flow, derailing whatever permission
        // request comes next.
        val prefs = reactContext.getSharedPreferences("myphone_prefs", android.content.Context.MODE_PRIVATE)
        if (!prefs.contains("wake_phrases_json")) return
        startServiceInternal()
    }

    override fun onHostPause() {}
    override fun onHostDestroy() {}
}
