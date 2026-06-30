package com.myphone.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class WakeWordService : Service() {

    private val TAG = "WakeWordService"
    private val CHANNEL_ID = "wake_word_channel"
    private val NOTIFICATION_ID = 1001

    private val WAKE_PHRASES = listOf(
        "hey my phone where are you",
        "hey my phone",
        "my phone where are you"
    )

    private var voskHandler: VoskHandler? = null
    private var isRunning = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "RECORD_AUDIO not granted — service cannot start yet")
            stopSelf()
            return
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIFICATION_ID, buildNotification())
            }
        } catch (e: Throwable) {
            Log.e(TAG, "startForeground failed: " + e.message)
            stopSelf()
            return
        }
        try {
            initVosk()
        } catch (e: Throwable) {
            Log.e(TAG, "Vosk init failed (non-fatal): " + e.message)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!isRunning) {
            try {
                initVosk()
            } catch (e: Throwable) {
                Log.e(TAG, "Vosk re-init failed: " + e.message)
            }
        }
        return START_STICKY
    }

    private fun initVosk() {
        Thread {
            try {
                if (!VoskModelManager.isModelReady(this)) {
                    Log.w(TAG, "Vosk model not ready yet - service will wait")
                    return@Thread
                }
                val modelDir = File(filesDir, "vosk-model")
                voskHandler = VoskHandler(this, modelDir.absolutePath, WAKE_PHRASES) {
                    emitWakeWordDetected()
                }
                voskHandler?.start()
                isRunning = true
                Log.d(TAG, "Vosk wake word service started successfully")
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to initialize Vosk: " + e.message)
            }
        }.start()
    }

    private fun emitWakeWordDetected() {
        val intent = Intent("com.myphone.app.WAKE_WORD_DETECTED")
        sendBroadcast(intent)
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext
            reactContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("WakeWordDetected", "detected")
        } catch (e: Exception) {
            Log.e(TAG, "Could not emit to RN: " + e.message)
        }
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "My-Phone Wake Word",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Listening for wake word"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("My-Phone")
            .setContentText("Listening for \"Hey My-Phone\"...")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        try {
            voskHandler?.stop()
        } catch (e: Throwable) {
            Log.e(TAG, "Error stopping Vosk: " + e.message)
        }
        voskHandler = null
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
