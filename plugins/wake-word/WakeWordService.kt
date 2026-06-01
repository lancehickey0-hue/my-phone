package com.myphone.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Bundle
import android.os.IBinder
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log

class WakeWordService : Service() {

    private var speechRecognizer: SpeechRecognizer? = null
    private val WAKE_PHRASES = listOf(
        "hey my phone where are you",
        "hey my-phone where are you",
        "my phone where are you",
    )
    private val CHANNEL_ID = "wake_word_channel"
    private val NOTIFICATION_ID = 1001

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        startListening()
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
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("My-Phone")
            .setContentText("Listening for wake word...")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    private fun startListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Log.e("WakeWord", "Speech recognition not available")
            return
        }

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                matches?.forEach { phrase ->
                    val lower = phrase.lowercase().trim()
                    if (WAKE_PHRASES.any { lower.contains(it) }) {
                        Log.d("WakeWord", "Wake phrase detected: $phrase")
                        sendWakeWordBroadcast()
                    }
                }
                // Restart listening
                startListening()
            }

            override fun onError(error: Int) {
                Log.e("WakeWord", "Recognition error: $error")
                // Restart after error
                android.os.Handler(mainLooper).postDelayed({
                    startListening()
                }, 1000)
            }

            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        }

        speechRecognizer?.startListening(intent)
    }

    private fun sendWakeWordBroadcast() {
        val intent = Intent("com.myphone.app.WAKE_WORD_DETECTED")
        sendBroadcast(intent)

        try {
            val reactContext = (application as? com.facebook.react.ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext

            reactContext?.getJSModule(com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("WakeWordDetected", "detected")
        } catch (e: Exception) {
            android.util.Log.e("WakeWord", "Could not emit to RN: ${e.message}")
        }
    }
