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
import org.json.JSONObject
import java.io.File
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class WakeWordService : Service() {

    private val TAG = "WakeWordService"
    private val CHANNEL_ID = "wake_word_channel"
    private val NOTIFICATION_ID = 1001

    private val CONVEX_LOG_URL = "https://cheery-buffalo-947.convex.site/logDebug"

    private val WAKE_PHRASES = listOf(
        "hey my phone where are you",
        "hey my phone",
        "my phone where are you"
    )

    private var voskHandler: VoskHandler? = null
    private var isRunning = false
    private val logExecutor = Executors.newSingleThreadExecutor()

    private fun logToFile(message: String) {
        try {
            val logFile = File(getExternalFilesDir(null), "wakeword_log.txt")
            val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
            logFile.appendText("[$timestamp] $message\n")
        } catch (e: Throwable) {
            Log.e(TAG, "logToFile failed: " + e.message)
        }
    }

    private fun logToConvex(message: String) {
        logExecutor.execute {
            try {
                val url = URL(CONVEX_LOG_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000

                val body = JSONObject()
                body.put("source", "WakeWordService")
                body.put("message", message)

                val writer = OutputStreamWriter(conn.outputStream)
                writer.write(body.toString())
                writer.flush()
                writer.close()

                conn.responseCode
                conn.disconnect()
            } catch (e: Throwable) {
                Log.w(TAG, "logToConvex failed (non-fatal): " + e.message)
            }
        }
    }

    private fun log(message: String) {
        Log.d(TAG, message)
        logToFile(message)
        logToConvex(message)
    }

    override fun onCreate() {
        super.onCreate()
        log("onCreate() called")
        createNotificationChannel()
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            log("RECORD_AUDIO not granted — service cannot start yet")
            stopSelf()
            return
        }
        log("RECORD_AUDIO permission confirmed granted")
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
            } else {
                startForeground(NOTIFICATION_ID, buildNotification())
            }
            log("startForeground succeeded")
        } catch (e: Throwable) {
            log("startForeground FAILED: " + e.message)
            stopSelf()
            return
        }
        try {
            initVosk()
        } catch (e: Throwable) {
            log("Vosk init failed (non-fatal): " + e.message)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        log("onStartCommand() called, isRunning=$isRunning")
        if (!isRunning) {
            try {
                initVosk()
            } catch (e: Throwable) {
                log("Vosk re-init failed: " + e.message)
            }
        }
        return START_STICKY
    }

    private fun initVosk() {
        Thread {
            try {
                log("initVosk() thread started")
                if (!VoskModelManager.isModelReady(this)) {
                    log("Vosk model NOT READY — service will wait, will not listen")
                    return@Thread
                }
                log("Vosk model is ready, initializing VoskHandler")
                val modelDir = File(filesDir, "vosk-model")
                voskHandler = VoskHandler(this, modelDir.absolutePath, WAKE_PHRASES) {
                    log("*** WAKE PHRASE DETECTED ***")
                    emitWakeWordDetected()
                }
                voskHandler?.start()
                isRunning = true
                log("Vosk wake word service started successfully — actively listening")
            } catch (e: Throwable) {
                log("Failed to initialize Vosk: " + e.message + " | " + e.stackTraceToString())
            }
        }.start()
    }

    private fun emitWakeWordDetected() {
        log("emitWakeWordDetected() called")
        val intent = Intent("com.myphone.app.WAKE_WORD_DETECTED")
        sendBroadcast(intent)
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext
            if (reactContext == null) {
                log("WARNING: reactContext is NULL — cannot emit WakeWordDetected to JS")
            }
            reactContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("WakeWordDetected", "detected")
            log("emit('WakeWordDetected') call completed")
        } catch (e: Exception) {
            log("Could not emit to RN: " + e.message)
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
        log("onDestroy() called — service stopping")
        isRunning = false
        try {
            voskHandler?.stop()
        } catch (e: Throwable) {
            log("Error stopping Vosk: " + e.message)
        }
        voskHandler = null
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
