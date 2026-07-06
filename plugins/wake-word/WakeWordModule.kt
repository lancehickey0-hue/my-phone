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
    fun startService() {
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
                startService()
            },
            onError = { error -> promise.reject("DOWNLOAD_ERROR", error) }
        )
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
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
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
        startService()
    }

    override fun onHostPause() {}
    override fun onHostDestroy() {}
}
