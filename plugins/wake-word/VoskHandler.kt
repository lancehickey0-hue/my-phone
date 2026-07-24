package com.myphone.app

import android.util.Log
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.SpeakerModel
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
    private val onDebug: ((String) -> Unit)? = null,
    // Optional: path to Vosk's speaker-identification model (separate from
    // the ASR model above, ~13MB, same vendor). When provided, the
    // recognizer also extracts an x-vector (voice fingerprint) alongside
    // the transcription -- delivered via onSpeakerVector at the exact
    // moment the wake phrase matches. This is what makes real speaker
    // verification possible, not just keyword matching. If null, or if
    // loading fails, wake-word detection still works exactly as before --
    // this is additive, never a hard dependency.
    private val speakerModelPath: String? = null,
    private val onSpeakerVector: ((FloatArray, Int) -> Unit)? = null
) : RecognitionListener {

    private val TAG = "VoskHandler"
    private var model: Model? = null
    private var speakerModel: SpeakerModel? = null
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

        if (!speakerModelPath.isNullOrEmpty()) {
            try {
                speakerModel = SpeakerModel(speakerModelPath)
                recognizer.setSpkModel(speakerModel)
            } catch (e: Throwable) {
                Log.e(TAG, "Failed to load speaker model (non-fatal, verification disabled): " + e.message)
            }
        }

        speechService = SpeechService(recognizer, 16000.0f)
        speechService?.startListening(this)
    }

    fun stop() {
        speechService?.stop()
        speechService = null
        model?.close()
        model = null
        speakerModel?.close()
        speakerModel = null
    }

    override fun onResult(hypothesis: String?) {
        if (hypothesis == null) return
        try {
            val json = JSONObject(hypothesis)
            val text = json.optString("text", "").lowercase().trim()
            if (text.isNotEmpty()) onDebug?.invoke("heard(final): '$text'")
            if (text.isNotEmpty() && matchesWakePhrase(text) && !hasTriggeredThisUtterance) {
                hasTriggeredThisUtterance = true

                if (json.has("spk") && onSpeakerVector != null) {
                    try {
                        val spkArray = json.getJSONArray("spk")
                        val vector = FloatArray(spkArray.length()) { i -> spkArray.getDouble(i).toFloat() }
                        val frames = json.optInt("spk_frames", 0)
                        onSpeakerVector.invoke(vector, frames)
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing spk vector: " + e.message)
                    }
                }

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
        // Deliberately does not trigger the wake word here. Vosk's partial
        // results are a live, unstable guess made while speech is still in
        // progress -- the recognizer can predict ahead of what's actually
        // been said, which let short/incomplete utterances (e.g. "hey my")
        // fire the alarm and lock before the full phrase was spoken. Only
        // onResult/onFinalResult (the stabilized, completed utterance) is
        // allowed to trigger.
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
