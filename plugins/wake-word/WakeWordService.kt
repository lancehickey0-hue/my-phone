package com.myphone.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
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
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class WakeWordService : Service() {

    companion object {
        // Lets WakeWordModule reach into the currently-running instance to
        // pause/resume listening during voice enrollment -- enrollment
        // records through its own temporary VoskHandler, and without this
        // the always-on listener here would also hear the same utterance
        // and could fire a real alarm/lock during training.
        @Volatile var instance: WakeWordService? = null
    }

    private val TAG = "WakeWordService"
    private val CHANNEL_ID = "wake_word_channel"
    private val NOTIFICATION_ID = 1001

    // Separate high-importance channel for the lockout itself. The listening
    // channel above is deliberately IMPORTANCE_LOW so the always-on notice
    // stays quiet; a full-screen intent is ignored outright on a LOW channel.
    private val ALARM_CHANNEL_ID = "alarm_lockout_channel"
    private val ALARM_NOTIFICATION_ID = 1002

    private val CONVEX_LOG_URL = "https://cheery-buffalo-947.convex.site/logDebug"
    private val CONVEX_TRIGGER_ALARM_URL = "https://cheery-buffalo-947.convex.site/triggerAlarmDevice"
    private val CONVEX_LOCK_STATE_URL = "https://cheery-buffalo-947.convex.site/deviceLockState"

    // How often the service checks Convex for a pending remote lock. Remote
    // lock is JS-independent: the app is usually backgrounded/killed when it
    // matters, so this always-on foreground service — not a React component —
    // is what actually performs the OS lock.
    private val LOCK_POLL_INTERVAL_SECONDS = 10L

    // Phrases are written by WakeWordModule.startService(configJson) — set
    // by JS from this device's own `wakePhrase`/`customWakePhrase` in
    // Convex, so e.g. a phone never reacts to a tablet's phrase. Falls back
    // to a generic phone phrase set only if nothing has been persisted yet.
    // Element-wise cosine similarity between two equal-length vectors.
    // Returns -1 (never a match) on any size/empty mismatch rather than
    // throwing, since a malformed vector should just fail verification, not
    // crash wake-word detection entirely.
    private fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        if (a.size != b.size || a.isEmpty()) return -1f
        var dot = 0f
        var normA = 0f
        var normB = 0f
        for (i in a.indices) {
            dot += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }
        val denom = kotlin.math.sqrt(normA) * kotlin.math.sqrt(normB)
        return if (denom == 0f) -1f else dot / denom
    }

    // NOTE: this threshold is a starting estimate, not a validated value --
    // it genuinely needs on-device tuning against real recordings (short
    // wake-phrase utterances produce noisier x-vectors than the 4+ second
    // clips Vosk's own docs recommend). Log every similarity score so real
    // pass/fail data is visible in Log Deck for tuning.
    private val VOICE_MATCH_THRESHOLD = 0.5f

    // Absent (null) simply means this device hasn't completed voice
    // enrollment yet -- wake-word detection falls back to phrase-match-only
    // behavior, same as before speaker verification existed.
    private fun loadReferenceVoicePrint(): FloatArray? {
        return try {
            val prefs = getSharedPreferences("myphone_prefs", MODE_PRIVATE)
            val json = prefs.getString("reference_voiceprint_json", null) ?: return null
            val arr = org.json.JSONArray(json)
            FloatArray(arr.length()) { i -> arr.getDouble(i).toFloat() }
        } catch (e: Exception) {
            log("Failed to load reference voiceprint (non-fatal, falls back to phrase-only): " + e.message, "warn")
            null
        }
    }

    private fun loadWakePhrases(): List<String> {
        return try {
            val prefs = getSharedPreferences("myphone_prefs", MODE_PRIVATE)
            val json = prefs.getString("wake_phrases_json", null)
            if (json != null) {
                val arr = org.json.JSONArray(json)
                (0 until arr.length()).map { arr.getString(it).lowercase().trim() }
            } else {
                listOf("hey my phone where are you")
            }
        } catch (e: Exception) {
            log("Failed to load wake phrases, using default: " + e.message, "warn")
            listOf("hey my phone where are you")
        }
    }

    private fun loadPhysicalDeviceId(): String? {
        return try {
            getSharedPreferences("myphone_prefs", MODE_PRIVATE).getString("physical_device_id", null)
        } catch (e: Exception) {
            null
        }
    }

    // Triggers the alarm/lock directly in Convex over plain HTTP, bypassing
    // the JS bridge entirely. This is the reliable path: the JS emit below
    // silently no-ops whenever reactContext is null (app backgrounded,
    // screen off, process trimmed) — exactly when this feature matters
    // most. Once this call flips isAlarmActive/isLocked in Convex, the
    // app's existing AlarmWatcher/LockWatcher will react the moment its JS
    // is next alive, the same way a remote lock from another device does.
    private fun triggerAlarmNative() {
        val physicalDeviceId = loadPhysicalDeviceId()
        if (physicalDeviceId.isNullOrEmpty()) {
            log("Cannot trigger alarm natively — no physicalDeviceId persisted yet", "warn")
            return
        }
        logExecutor.execute {
            try {
                val url = URL(CONVEX_TRIGGER_ALARM_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 5000
                conn.readTimeout = 5000

                val body = JSONObject()
                body.put("physicalDeviceId", physicalDeviceId)

                val writer = OutputStreamWriter(conn.outputStream)
                writer.write(body.toString())
                writer.flush()
                writer.close()

                val code = conn.responseCode
                conn.disconnect()
                log("triggerAlarmNative HTTP response: $code")
            } catch (e: Throwable) {
                log("triggerAlarmNative failed: " + e.message, "error")
            }
        }
    }

    private var voskHandler: VoskHandler? = null
    @Volatile private var isRunning = false
    @Volatile private var pausedForCall = false
    @Volatile private var pausedForEnrollment = false
    // Guards against two initVosk() calls racing. onCreate() and
    // onStartCommand() can both fire before the first init finishes and flips
    // isRunning, which would otherwise spin up two SpeechServices fighting
    // over the one microphone — leaving neither able to recognize cleanly.
    private val voskInitializing = java.util.concurrent.atomic.AtomicBoolean(false)

    fun pauseForEnrollment() {
        if (!isRunning) return
        log("Pausing wake word listening for voice enrollment")
        try {
            voskHandler?.stop()
        } catch (e: Throwable) {
            log("Error pausing Vosk for enrollment: " + e.message, "warn")
        }
        voskHandler = null
        isRunning = false
        pausedForEnrollment = true
    }

    fun resumeAfterEnrollment() {
        if (!pausedForEnrollment) return
        log("Voice enrollment finished — resuming wake word listening")
        pausedForEnrollment = false
        try {
            initVosk()
        } catch (e: Throwable) {
            log("Failed to resume Vosk after enrollment: " + e.message, "error")
        }
    }
    private val logExecutor = Executors.newSingleThreadExecutor()

    // Remote-lock poller. Tracks the last observed lock state so lockNow()
    // fires exactly once per false→true transition (not every poll), and
    // re-arms once the device is unlocked again.
    private var lockPoller: ScheduledExecutorService? = null
    @Volatile private var lastLockState = false

    // Native alarm siren. Tracks the last observed alarm state the same way
    // lock does, but on BOTH edges -- the siren must also stop once the
    // alarm is deactivated (e.g. biometric unlock), not just start.
    private var alarmPlayer: MediaPlayer? = null
    @Volatile private var lastAlarmState = false

    // Speaker verification state. referenceVoicePrint is loaded once at
    // service start; lastVectorPassedVerification is set by onSpeakerVector
    // and consumed immediately by onWakeWordDetected for the same utterance.
    private var referenceVoicePrint: FloatArray? = null
    @Volatile private var lastVectorPassedVerification: Boolean? = null

    private var telephonyManager: TelephonyManager? = null
    private var legacyPhoneStateListener: PhoneStateListener? = null
    private var modernTelephonyCallback: TelephonyCallback? = null

    private fun logToFile(message: String) {
        try {
            val logFile = File(getExternalFilesDir(null), "wakeword_log.txt")
            val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date())
            logFile.appendText("[$timestamp] $message\n")
        } catch (e: Throwable) {
            Log.e(TAG, "logToFile failed: " + e.message)
        }
    }

    private fun logToConvex(message: String, level: String = "info") {
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
                body.put("level", level)

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

    private fun log(message: String, level: String = "info") {
        Log.d(TAG, message)
        logToFile(message)
        logToConvex(message, level)
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        log("onCreate() called")
        createNotificationChannel()
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            log("RECORD_AUDIO not granted — service cannot start yet", "error")
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
        registerCallStateWatcher()
        try {
            initVosk()
        } catch (e: Throwable) {
            log("Vosk init failed (non-fatal): " + e.message, "warn")
        }
        startLockPoller()
    }

    // ── Remote lock ─────────────────────────────────────────────────────────
    // Polls Convex for this device's isLocked flag and performs the real
    // OS-level lock natively. This is what makes remote lock work when the app
    // is backgrounded or killed — the JS LockWatcher only runs while the app
    // is alive, which is exactly when remote lock is NOT needed.
    private fun startLockPoller() {
        if (lockPoller != null) return
        val executor = Executors.newSingleThreadScheduledExecutor()
        lockPoller = executor
        executor.scheduleWithFixedDelay(
            { pollLockState() },
            LOCK_POLL_INTERVAL_SECONDS,
            LOCK_POLL_INTERVAL_SECONDS,
            TimeUnit.SECONDS
        )
        log("Lock poller started (every ${LOCK_POLL_INTERVAL_SECONDS}s)")
    }

    private fun pollLockState() {
        val physicalDeviceId = loadPhysicalDeviceId()
        if (physicalDeviceId.isNullOrEmpty()) return
        try {
            val url = URL(CONVEX_LOCK_STATE_URL)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.setRequestProperty("Content-Type", "application/json")
            conn.doOutput = true
            conn.connectTimeout = 5000
            conn.readTimeout = 5000

            val body = JSONObject().put("physicalDeviceId", physicalDeviceId)
            val writer = OutputStreamWriter(conn.outputStream)
            writer.write(body.toString())
            writer.flush()
            writer.close()

            val code = conn.responseCode
            val response = conn.inputStream.bufferedReader().use { it.readText() }
            conn.disconnect()
            if (code != 200) return

            val json = JSONObject(response)
            val isLocked = json.optBoolean("isLocked", false)
            val isAlarmActive = json.optBoolean("isAlarmActive", false)

            // Only act on the false→true edge; re-arm once unlocked.
            if (isLocked && !lastLockState) {
                log("Remote lock detected — locking device via DevicePolicyManager")
                lockDeviceNow()
            }
            lastLockState = isLocked

            // Alarm sound tracks both edges -- it must also stop once
            // deactivated, unlike lock which has no native "unlock" action.
            if (isAlarmActive && !lastAlarmState) {
                log("Remote alarm detected — starting native siren")
                // The edge is only consumed once the siren is genuinely
                // playing. Recording it unconditionally (as this used to)
                // meant a single failed start left a silent alarm until the
                // flag next flipped, with no retry.
                if (startAlarmSound()) lastAlarmState = true
                showLockoutScreen()
            } else if (!isAlarmActive && lastAlarmState) {
                log("Alarm deactivated — stopping native siren")
                stopAlarmSound()
                hideLockoutScreen()
                lastAlarmState = false
            }
        } catch (e: Throwable) {
            log("pollLockState failed (non-fatal): " + e.message, "warn")
        }
    }

    private fun lockDeviceNow() {
        try {
            val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(this, LockDeviceAdminReceiver::class.java)
            if (!dpm.isAdminActive(admin)) {
                log("Cannot lock — device admin not active", "error")
                return
            }
            dpm.lockNow()
            log("lockNow() succeeded")
        } catch (e: Throwable) {
            log("lockNow() failed: " + e.message, "error")
        }
    }

    // Plays res/raw/alarm.mp3 directly, independent of the JS bridge --
    // this is what makes the alarm sound immediately when triggered while
    // the app is backgrounded/killed, instead of waiting for JS to wake up.
    //
    // Returns whether the siren is actually playing, so callers don't record
    // a started alarm that never made a sound.
    private fun startAlarmSound(): Boolean {
        try {
            if (alarmPlayer != null) return true

            // MediaPlayer.create(context, resId) hands back an already
            // *prepared* player, and setAudioAttributes() is only legal
            // before prepare() -- calling it afterwards throws
            // IllegalStateException. That is exactly what used to happen
            // here: the throw landed in the catch below, start() was never
            // reached, and the alarm stayed silent until the JS side played
            // it on next app open. The 4-arg overload exists for this case;
            // it applies the attributes as part of preparation.
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val sessionId =
                (getSystemService(Context.AUDIO_SERVICE) as AudioManager).generateAudioSessionId()

            val player = MediaPlayer.create(this, R.raw.alarm, attributes, sessionId)
            if (player == null) {
                log("startAlarmSound: MediaPlayer.create returned null", "error")
                return false
            }
            player.isLooping = true
            // Keeps playback alive with the screen off; the device has just
            // been locked, so this is the normal case rather than the edge.
            player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
            player.start()
            alarmPlayer = player
            log("Native alarm sound started")
            return true
        } catch (e: Throwable) {
            log("startAlarmSound failed: " + e.message, "error")
            return false
        }
    }

    // ── Lockout screen ──────────────────────────────────────────────────────
    // Raising UI from a background service is heavily restricted on Android
    // 10+: a bare startActivity() from here is silently dropped, which is why
    // the lockout screen never appeared while the phone was locked -- nothing
    // native ever tried to show it, and the JS paths that navigate to
    // /lockout only run while the app is already alive and foregrounded.
    //
    // The sanctioned escape is a full-screen-intent notification, the same
    // mechanism an alarm clock or incoming call uses. Where the user has also
    // granted "Display over other apps" we fire the intent directly as well,
    // since some OEM skins throttle full-screen intents aggressively.
    private fun lockoutPendingIntent(): PendingIntent {
        // The service only knows this device by its physical id; the lockout
        // screen resolves that to the Convex device record itself.
        val physicalDeviceId = loadPhysicalDeviceId() ?: ""
        val uri = Uri.parse("myphone://lockout?physicalDeviceId=$physicalDeviceId&source=wake_word")
        val intent = Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage(packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun showLockoutScreen() {
        val pending = lockoutPendingIntent()

        try {
            val builder = Notification.Builder(this, ALARM_CHANNEL_ID)
                .setContentTitle("My-Phone Alarm")
                .setContentText("This device has been locked. Tap to unlock.")
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setCategory(Notification.CATEGORY_ALARM)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(pending)
                .setFullScreenIntent(pending, true)
            getSystemService(NotificationManager::class.java)
                .notify(ALARM_NOTIFICATION_ID, builder.build())
            log("Lockout full-screen intent posted")
        } catch (e: Throwable) {
            log("Failed to post lockout notification: " + e.message, "error")
        }

        // Direct launch, only where the OS still permits it from background.
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.canDrawOverlays(this)) {
                pending.send()
                log("Lockout activity launched directly")
            } else {
                log("SYSTEM_ALERT_WINDOW not granted — relying on full-screen intent alone")
            }
        } catch (e: Throwable) {
            log("Direct lockout launch failed (non-fatal): " + e.message, "warn")
        }
    }

    private fun hideLockoutScreen() {
        try {
            getSystemService(NotificationManager::class.java).cancel(ALARM_NOTIFICATION_ID)
            log("Lockout notification cleared")
        } catch (e: Throwable) {
            log("Failed to clear lockout notification: " + e.message, "warn")
        }
    }

    private fun stopAlarmSound() {
        try {
            alarmPlayer?.let {
                if (it.isPlaying) it.stop()
                it.release()
            }
            alarmPlayer = null
            log("Native alarm sound stopped")
        } catch (e: Throwable) {
            log("stopAlarmSound failed: " + e.message, "error")
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        log("onStartCommand() called, isRunning=$isRunning")
        if (!isRunning && !pausedForCall && !pausedForEnrollment) {
            try {
                initVosk()
            } catch (e: Throwable) {
                log("Vosk re-init failed: " + e.message, "error")
            }
        }
        return START_STICKY
    }

    // ── Call-state awareness ────────────────────────────────────────────────
    // Vosk's SpeechService holds an active AudioRecord on the microphone the
    // entire time it's listening. If that's left running during a phone call,
    // it competes with the telephony audio path and can prevent the other
    // party from hearing the user. We must release the mic the moment a call
    // starts, and only resume listening once the call has fully ended.
    private fun registerCallStateWatcher() {
        if (checkSelfPermission(android.Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            log("READ_PHONE_STATE not granted — cannot watch call state, wake word will NOT pause during calls", "warn")
            return
        }

        telephonyManager = getSystemService(TELEPHONY_SERVICE) as? TelephonyManager
        if (telephonyManager == null) {
            log("TelephonyManager unavailable — cannot watch call state", "warn")
            return
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                    override fun onCallStateChanged(state: Int) {
                        handleCallStateChanged(state)
                    }
                }
                modernTelephonyCallback = callback
                telephonyManager?.registerTelephonyCallback(mainExecutor, callback)
                log("Registered modern TelephonyCallback for call state")
            } else {
                @Suppress("DEPRECATION")
                val listener = object : PhoneStateListener() {
                    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
                    override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                        handleCallStateChanged(state)
                    }
                }
                legacyPhoneStateListener = listener
                @Suppress("DEPRECATION")
                telephonyManager?.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
                log("Registered legacy PhoneStateListener for call state")
            }
        } catch (e: Throwable) {
            log("Failed to register call state watcher: " + e.message, "warn")
        }
    }

    private fun unregisterCallStateWatcher() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                modernTelephonyCallback?.let { telephonyManager?.unregisterTelephonyCallback(it) }
            } else {
                @Suppress("DEPRECATION")
                legacyPhoneStateListener?.let { telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE) }
            }
        } catch (e: Throwable) {
            log("Failed to unregister call state watcher: " + e.message)
        }
    }

    private fun handleCallStateChanged(state: Int) {
        val isCallActiveOrRinging =
            state == TelephonyManager.CALL_STATE_OFFHOOK || state == TelephonyManager.CALL_STATE_RINGING

        if (isCallActiveOrRinging && isRunning) {
            log("Call detected (state=$state) — pausing wake word listening to free the microphone")
            try {
                voskHandler?.stop()
            } catch (e: Throwable) {
                log("Error pausing Vosk for call: " + e.message, "warn")
            }
            voskHandler = null
            isRunning = false
            pausedForCall = true
        } else if (state == TelephonyManager.CALL_STATE_IDLE && pausedForCall) {
            log("Call ended — resuming wake word listening")
            pausedForCall = false
            try {
                initVosk()
            } catch (e: Throwable) {
                log("Failed to resume Vosk after call: " + e.message, "error")
            }
        }
    }

    private fun initVosk() {
        if (isRunning) {
            log("initVosk() skipped — already running")
            return
        }
        // Only one init may proceed; a concurrent caller bails immediately
        // instead of starting a second mic-grabbing SpeechService.
        if (!voskInitializing.compareAndSet(false, true)) {
            log("initVosk() skipped — initialization already in progress")
            return
        }
        Thread {
            try {
                log("initVosk() thread started")
                if (!VoskModelManager.isModelReady(this)) {
                    log("Vosk model NOT READY — service will wait, will not listen")
                    return@Thread
                }
                log("Vosk model is ready, initializing VoskHandler")
                val modelDir = File(filesDir, "vosk-model")
                val phrases = loadWakePhrases()
                log("Listening for phrases: " + phrases.joinToString(" | "))

                referenceVoicePrint = loadReferenceVoicePrint()
                val speakerModelReady = VoskSpeakerModelManager.isModelReady(this)
                if (referenceVoicePrint != null && !speakerModelReady) {
                    log("Reference voiceprint present but speaker model not downloaded -- voice verification disabled this session", "warn")
                }
                val speakerModelPath = if (speakerModelReady) VoskSpeakerModelManager.getModelDir(this).absolutePath else null

                voskHandler = VoskHandler(
                    context = this,
                    modelPath = modelDir.absolutePath,
                    wakePhrases = phrases,
                    onWakeWordDetected = {
                        log("*** WAKE PHRASE DETECTED ***")
                        val ref = referenceVoicePrint
                        if (ref == null) {
                            log("No enrolled voiceprint -- triggering on phrase match alone")
                            emitWakeWordDetected()
                        } else if (lastVectorPassedVerification == true) {
                            log("Voice verified -- triggering alarm")
                            emitWakeWordDetected()
                        } else {
                            log("Phrase matched but voice did not match enrolled speaker -- ignoring", "warn")
                        }
                        lastVectorPassedVerification = null
                    },
                    onDebug = { heard -> log(heard) },
                    speakerModelPath = speakerModelPath,
                    onSpeakerVector = { vector, frames ->
                        val ref = referenceVoicePrint
                        if (ref != null) {
                            val similarity = cosineSimilarity(vector, ref)
                            val passed = similarity >= VOICE_MATCH_THRESHOLD
                            lastVectorPassedVerification = passed
                            log("Voice similarity: " + similarity + " (frames=" + frames + ", threshold=" + VOICE_MATCH_THRESHOLD + ") -> " + (if (passed) "MATCH" else "NO MATCH"))
                        }
                    }
                )
                voskHandler?.start()
                isRunning = true
                log("Vosk wake word service started successfully — actively listening")
            } catch (e: Throwable) {
                log("Failed to initialize Vosk: " + e.message + " | " + e.stackTraceToString(), "error")
            } finally {
                voskInitializing.set(false)
            }
        }.start()
    }

    private fun emitWakeWordDetected() {
        log("emitWakeWordDetected() called")

        // Act locally first: siren, then lock, then screen. All three used
        // to wait on the next pollLockState() round trip — up to
        // LOCK_POLL_INTERVAL_SECONDS plus two HTTP calls, and never at all
        // with no network. This service is already running in-process when
        // the phrase is heard, so there is nothing to wait for. The poller
        // stays as the path for alarms triggered from *another* device.
        if (startAlarmSound()) lastAlarmState = true
        // Lock before raising the screen, not after: a full-screen intent
        // arriving at an already-locked phone is the canonical path the OS
        // supports (it's what an alarm clock does), whereas launching the
        // activity first and locking a moment later risks the keyguard
        // tearing it down mid-launch.
        lockDeviceNow()
        lastLockState = true
        showLockoutScreen()

        // Then tell Convex, so other signed-in devices see the alarm and the
        // state outlives this process being killed.
        triggerAlarmNative()

        val intent = Intent("com.myphone.app.WAKE_WORD_DETECTED")
        sendBroadcast(intent)
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactNativeHost
                ?.reactInstanceManager
                ?.currentReactContext
            if (reactContext == null) {
                log("reactContext is NULL — relying on native trigger only (this is expected when backgrounded)")
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
        val manager = getSystemService(NotificationManager::class.java)

        val channel = NotificationChannel(
            CHANNEL_ID,
            "My-Phone Wake Word",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Listening for wake word"
            setShowBadge(false)
        }
        manager.createNotificationChannel(channel)

        // Must be HIGH: the system ignores a full-screen intent posted on a
        // channel below IMPORTANCE_HIGH, and the user can't be shown the
        // lockout screen without one.
        val alarmChannel = NotificationChannel(
            ALARM_CHANNEL_ID,
            "My-Phone Alarm",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Full-screen lockout when the alarm is triggered"
            setShowBadge(true)
            enableVibration(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            // Silent on purpose — the siren is played on the alarm stream by
            // MediaPlayer, and a notification sound would layer on top of it.
            setSound(null, null)
        }
        manager.createNotificationChannel(alarmChannel)
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
        instance = null
        log("onDestroy() called — service stopping")
        isRunning = false
        lockPoller?.shutdownNow()
        lockPoller = null
        stopAlarmSound()
        hideLockoutScreen()
        unregisterCallStateWatcher()
        try {
            voskHandler?.stop()
        } catch (e: Throwable) {
            log("Error stopping Vosk: " + e.message)
        }
        voskHandler = null
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
