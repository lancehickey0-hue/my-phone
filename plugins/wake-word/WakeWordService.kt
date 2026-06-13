package com.myphone.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.util.Log
import com.facebook.react.ReactApplication
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService
import org.json.JSONObject
import java.io.File

class WakeWordService : Service(), RecognitionListener {

    private val TAG = "WakeWordService"
    private val CHANNEL_ID = "wake_word_channel"
    private val NOTIFICATION_ID = 1001

    private val WAKE_PHRASES = listOf(
        "hey my phone where are you",
        "hey my phone",
        "my phone where are you"
    )

    private var speechService: SpeechService? = null
    private var model: Model? = null
    private var isRunning = false

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        initVosk()
    }

    private fun initVosk() {
        Thread {
            try {
                val modelDir = File(filesDir, "vosk-model")
                if (!modelDir.exists() || modelDir.list().isNullOrEmpty()) {
                    Log.w(TAG, "Vosk model not downloaded yet - service will wait")
                    return@Thread
                }

                Log.d(TAG, "Loading Vosk model from ${modelDir.absolutePath}")
                model = Model(modelDir.absolutePath)
                val recognizer = Recognizer(model, 16000.0f)
                speechService = SpeechService(recognizer, 16000.0f)
                isRunning = true
                speechService?.startListening(this)
                Log.d(TAG, "Vosk wake word service started successfully")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize Vosk: ${e.message}")
            }
        }.start()
    }

    override fun onResult(hypothesis: String?) {
        if (hypothesis == null) return
        try {
            val text = JSONObject(hypothesis).optString("text", "").lowercase().trim()
            Log.d(TAG, "Vosk result: '$text'")
            if (text.isNotEmpty() && matchesWakePhrase(text)) {
                Log.d(TAG, "✅ Wake phrase matched: $text")
                emitWakeWordDetected()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing result: ${e.message}")
        }
    }

    override fun onPartialResult(hypothesis: String?) {
        if (hypothesis == null) return
        try {
            val text = JSONObject(hypothesis).optString("partial", "").lowercase().trim()
            if (text.isNotEmpty() && matchesWakePhrase(text)) {
                Log.d(TAG, "✅ Wake phrase matched (partial): $text")
                emitWakeWordDetected()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing partial: ${e.message}")
        }
    }

    override fun onFinalResult(hypothesis: String?) {
        onResult(hypothesis)
    }

    override fun onError(e: Exception?) {
        Log.e(TAG, "Vosk recognition error: ${e?.message}")
        android.os.Handler(mainLooper).postDelayed({
            if (isRunning) {
                speechService?.cancel()
                speechService = null
                initVosk()
            }
        }, 2000)
    }

    override fun onTimeout() {
        speechService?.startListening(this)
    }

    private fun matchesWakePhrase(text: String): Boolean {
        return WAKE_PHRASES.any { phrase ->
            text == phrase || text.contains(phrase)
        }
    }

    private fun emitWakeWordDetected() {
        // Send local broadcast
        val intent = Intent("com.myphone.app.WAKE_WORD_DETECTED")
        sendBroadcast(intent)

        // Emit to React Native
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext

            reactContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("WakeWordDetected", "detected")
        } catch (e: Exception) {
            Log.e(TAG, "Could not emit to RN: ${e.message}")
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
        speechService?.stop()
        speechService = null
        model?.close()
        model = null
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
