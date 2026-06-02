package com.myphone.app

import android.app.KeyguardManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class DeviceControlModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "DeviceControlModule"

    @ReactMethod
    fun lockScreen(promise: Promise) {
        try {
            val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val adminComponent = ComponentName(reactContext, MyPhoneDeviceAdminReceiver::class.java)
            if (dpm.isAdminActive(adminComponent)) {
                dpm.lockNow()
                promise.resolve(true)
            } else {
                val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                    putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
                    putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                        "My-Phone needs device admin to lock your screen remotely.")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                reactContext.startActivity(intent)
                promise.reject("ADMIN_REQUIRED", "Device admin permission required to lock screen")
            }
        } catch (e: Exception) {
            promise.reject("LOCK_ERROR", e.message)
        }
    }

    @ReactMethod
    fun showAlarmLockscreen(promise: Promise) {
        val activity = currentActivity as? FragmentActivity
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No active activity")
            return
        }
        activity.runOnUiThread {
            try {
                val biometricManager = BiometricManager.from(reactContext)
                val canAuthenticate = biometricManager.canAuthenticate(
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL
                )
                if (canAuthenticate != BiometricManager.BIOMETRIC_SUCCESS) {
                    lockScreen(promise)
                    return@runOnUiThread
                }
                val executor = ContextCompat.getMainExecutor(reactContext)
                val callback = object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        reactContext
                            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                            .emit("BiometricUnlockSuccess", null)
                        promise.resolve(true)
                    }
                    override fun onAuthenticationFailed() {}
                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        if (errorCode != BiometricPrompt.ERROR_USER_CANCELED &&
                            errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                            promise.reject("AUTH_ERROR", errString.toString())
                        }
                    }
                }
                val prompt = BiometricPrompt(activity, executor, callback)
                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("🔒 My-Phone Alarm Active")
                    .setSubtitle("Authenticate to stop the alarm")
                    .setAllowedAuthenticators(
                        BiometricManager.Authenticators.BIOMETRIC_STRONG or
                        BiometricManager.Authenticators.DEVICE_CREDENTIAL
                    )
                    .build()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    activity.setShowWhenLocked(true)
                    activity.setTurnScreenOn(true)
                }
                prompt.authenticate(promptInfo)
            } catch (e: Exception) {
                promise.reject("BIOMETRIC_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun isDeviceAdminActive(promise: Promise) {
        val dpm = reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        val adminComponent = ComponentName(reactContext, MyPhoneDeviceAdminReceiver::class.java)
        promise.resolve(dpm.isAdminActive(adminComponent))
    }
}
