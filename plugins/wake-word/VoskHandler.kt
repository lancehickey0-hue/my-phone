package com.myphone.app

import android.util.Log
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.vosk.android.SpeechService

class VoskHandler(
    private val context: android.content.Context,
    private val modelPath: String,
    private val wakePhrases: List<String>,
    private val onWakeWordDetected: () -> Unit
) : RecognitionListener {

    private val TAG = "VoskHandler"
    private var model: Model? = null
    private var speechService: SpeechService? = null

    fun start() {
        model = Model(modelPath)
        val recognizer = Recognizer(model, 16000.0f)
        speechService = SpeechService(recognizer, 16000.0f)
        speechService?.startListening(this)
    }

    fun stop() {
        speechService?.stop()
        speechService = null
        model?.close()
        model = null
    }

    override fun onResult(hypothesis: String?) {
        if (hypothesis == null) return
        try {
            val text = JSONObject(hypothesis).optString("text", "").lowercase().trim()
            if (text.isNotEmpty() && matchesWakePhrase(text)) {
                onWakeWordDetected()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing result: " + e.message)
        }
    }

    override fun onPartialResult(hypothesis: String?) {
        if (hypothesis == null) return
        try {
            val text = JSONObject(hypothesis).optString("partial", "").lowercase().trim()
            if (text.isNotEmpty() && matchesWakePhrase(text)) {
                onWakeWordDetected()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing partial: " + e.message)
        }
    }

    override fun onFinalResult(hypothesis: String?) {
        onResult(hypothesis)
    }

    override fun onError(e: Exception?) {
        Log.e(TAG, "Vosk recognition error: " + e?.message)
    }

    override fun onTimeout() {
        speechService?.startListening(this)
    }

    private fun matchesWakePhrase(text: String): Boolean {
        return wakePhrases.any { phrase -> text == phrase || text.contains(phrase) }
    }
}
