package com.myphone.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
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

    private val TAG = "WakeWordService"
    private val CHANNEL_ID = "wake_word_channel"
    private val NOTIFICATION_ID = 1001

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
    private fun loadWakePhrases(): List<String> {
        return try {
            val prefs = getSharedPreferences("myphone_prefs", MODE_PRIVATE)
            val json = prefs.getString("wake_phrases_json", null)
            if (json != null) {
                val arr = org.json.JSONArray(json)
                (0 until arr.length()).map { arr.getString(it).lowercase().trim() }
            } else {
                listOf("hey my phone where are you", "hey my phone", "my phone where are you")
            }
        } catch (e: Exception) {
            log("Failed to load wake phrases, using default: " + e.message)
            listOf("hey my phone where are you", "hey my phone", "my phone where are you")
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
            log("Cannot trigger alarm natively — no physicalDeviceId persisted yet")
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
                log("triggerAlarmNative failed: " + e.message)
            }
        }
    }

    private var voskHandler: VoskHandler? = null
    @Volatile private var isRunning = false
    @Volatile private var pausedForCall = false
    // Guards against two initVosk() calls racing. onCreate() and
    // onStartCommand() can both fire before the first init finishes and flips
    // isRunning, which would otherwise spin up two SpeechServices fighting
    // over the one microphone — leaving neither able to recognize cleanly.
    private val voskInitializing = java.util.concurrent.atomic.AtomicBoolean(false)
    private val logExecutor = Executors.newSingleThreadExecutor()

    // Remote-lock poller. Tracks the last observed lock state so lockNow()
    // fires exactly once per false→true transition (not every poll), and
    // re-arms once the device is unlocked again.
    private var lockPoller: ScheduledExecutorService? = null
    @Volatile private var lastLockState = false

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
        registerCallStateWatcher()
        try {
            initVosk()
        } catch (e: Throwable) {
            log("Vosk init failed (non-fatal): " + e.message)
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

            val isLocked = JSONObject(response).optBoolean("isLocked", false)
            // Only act on the false→true edge; re-arm once unlocked.
            if (isLocked && !lastLockState) {
                log("Remote lock detected — locking device via DevicePolicyManager")
                lockDeviceNow()
            }
            lastLockState = isLocked
        } catch (e: Throwable) {
            log("pollLockState failed (non-fatal): " + e.message)
        }
    }

    private fun lockDeviceNow() {
        try {
            val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(this, LockDeviceAdminReceiver::class.java)
            if (!dpm.isAdminActive(admin)) {
                log("Cannot lock — device admin not active")
                return
            }
            dpm.lockNow()
            log("lockNow() succeeded")
        } catch (e: Throwable) {
            log("lockNow() failed: " + e.message)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        log("onStartCommand() called, isRunning=$isRunning")
        if (!isRunning && !pausedForCall) {
            try {
                initVosk()
            } catch (e: Throwable) {
                log("Vosk re-init failed: " + e.message)
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
            log("READ_PHONE_STATE not granted — cannot watch call state, wake word will NOT pause during calls")
            return
        }

        telephonyManager = getSystemService(TELEPHONY_SERVICE) as? TelephonyManager
        if (telephonyManager == null) {
            log("TelephonyManager unavailable — cannot watch call state")
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
            log("Failed to register call state watcher: " + e.message)
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
                log("Error pausing Vosk for call: " + e.message)
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
                log("Failed to resume Vosk after call: " + e.message)
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
                voskHandler = VoskHandler(
                    this,
                    modelDir.absolutePath,
                    phrases,
                    {
                        log("*** WAKE PHRASE DETECTED ***")
                        emitWakeWordDetected()
                    },
                    { heard -> log(heard) }
                )
                voskHandler?.start()
                isRunning = true
                log("Vosk wake word service started successfully — actively listening")
            } catch (e: Throwable) {
                log("Failed to initialize Vosk: " + e.message + " | " + e.stackTraceToString())
            } finally {
                voskInitializing.set(false)
            }
        }.start()
    }

    private fun emitWakeWordDetected() {
        log("emitWakeWordDetected() called")

        // Reliable path first — works whether or not JS is alive.
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
        lockPoller?.shutdownNow()
        lockPoller = null
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
