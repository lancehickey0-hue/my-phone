package com.myphone.app

import android.content.Intent
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

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onHostResume() {
        if (VoskModelManager.isModelReady(reactContext)) {
            startService()
        }
    }

    override fun onHostPause() {}
    override fun onHostDestroy() {}
}
