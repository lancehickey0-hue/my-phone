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
    private val onWakeWordDetected: () -> Unit,
    // Optional diagnostic hook — receives every final transcription, matched
    // or not, so the service can log what Vosk actually heard. Essential for
    // seeing near-misses ("hey my fone") when detection appears to do nothing.
    private val onDebug: ((String) -> Unit)? = null
) : RecognitionListener {

    private val TAG = "VoskHandler"
    private var model: Model? = null
    private var speechService: SpeechService? = null

    // A single spoken utterance produces many onPartialResult calls as Vosk
    // refines its guess — without this, one "hey my phone" could match
    // 20+ times before the final result arrives. Reset on each final result
    // (i.e. once Vosk detects the pause at the end of the utterance).
    private var hasTriggeredThisUtterance = false

    fun start() {
        model = Model(modelPath)
        // Grammar-constrained recognition. Passing the wake phrases (plus the
        // special "[unk]" catch-all for everything else) restricts Vosk's
        // decoding graph to just these strings, instead of transcribing
        // open-vocabulary English that drifts and rarely lands the exact
        // phrase. This is the standard, far more reliable wake-word setup.
        val recognizer = if (wakePhrases.isNotEmpty()) {
            val grammar = org.json.JSONArray().apply {
                wakePhrases.forEach { put(it) }
                put("[unk]")
            }.toString()
            Recognizer(model, 16000.0f, grammar)
        } else {
            Recognizer(model, 16000.0f)
        }
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
            if (text.isNotEmpty()) onDebug?.invoke("heard(final): '$text'")
            if (text.isNotEmpty() && matchesWakePhrase(text) && !hasTriggeredThisUtterance) {
                hasTriggeredThisUtterance = true
                onWakeWordDetected()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing result: " + e.message)
        } finally {
            // Final result = end of this utterance. Arm for the next one.
            hasTriggeredThisUtterance = false
        }
    }

    override fun onPartialResult(hypothesis: String?) {
        if (hypothesis == null) return
        try {
            val text = JSONObject(hypothesis).optString("partial", "").lowercase().trim()
            if (text.isNotEmpty() && matchesWakePhrase(text) && !hasTriggeredThisUtterance) {
                hasTriggeredThisUtterance = true
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
