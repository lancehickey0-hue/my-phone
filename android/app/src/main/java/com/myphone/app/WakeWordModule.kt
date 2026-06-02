package com.myphone.app

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.LifecycleEventListener

class WakeWordModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    override fun getName() = "WakeWordModule"

    init {
        reactContext.addLifecycleEventListener(this)
    }

    @ReactMethod
    fun startService() {
        val intent = Intent(reactContext, WakeWordService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactContext.startForegroundService(intent)
        } else {
            reactContext.startService(intent)
        }
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactContext, WakeWordService::class.java)
        reactContext.stopService(intent)
    }

    override fun onHostResume() { startService() }
    override fun onHostPause() {}
    override fun onHostDestroy() {}
}
