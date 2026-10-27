package com.myphone.app

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature

// Hardware-backed unlock key.
//
// An RSA key pair is generated inside the Android Keystore. The private key
// never leaves secure hardware and can only be used after a STRONG
// biometric (class 3 fingerprint/face) check — the OS enforces that, not
// this app. The public key is registered with Convex; to stop an alarm the
// server issues a one-time challenge and only accepts it back signed by
// this key. So a tampered app, a stolen session, or the phone's PIN can't
// silence the alarm — only the owner's enrolled biometric can.
//
// If fingerprints/faces are added or removed after setup, Android
// permanently invalidates the key (setInvalidatedByBiometricEnrollment);
// sign() then rejects with "key_invalidated" and the user falls back to
// their My-Phone PIN.
class DeviceKeyModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val KEY_ALIAS = "my_phone_unlock_key"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    }

    override fun getName(): String = "DeviceKeyModule"

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    @ReactMethod
    fun isStrongBiometricAvailable(promise: Promise) {
        val result = BiometricManager.from(reactContext)
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        promise.resolve(
            when (result) {
                BiometricManager.BIOMETRIC_SUCCESS -> "available"
                BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "not_enrolled"
                else -> "unavailable"
            }
        )
    }

    @ReactMethod
    fun hasKey(promise: Promise) {
        try {
            promise.resolve(keyStore().containsAlias(KEY_ALIAS))
        } catch (e: Throwable) {
            promise.resolve(false)
        }
    }

    // Replaces any existing key. Resolves the public key as base64 SPKI
    // (X.509 SubjectPublicKeyInfo), which the server imports directly.
    @ReactMethod
    fun createKey(promise: Promise) {
        try {
            val ks = keyStore()
            if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS)

            val builder = KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
                .setKeySize(2048)
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // 0 = every single use needs a fresh biometric.
                builder.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            }

            val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_RSA, ANDROID_KEYSTORE)
            generator.initialize(builder.build())
            val pair = generator.generateKeyPair()
            promise.resolve(Base64.encodeToString(pair.public.encoded, Base64.NO_WRAP))
        } catch (e: Throwable) {
            promise.reject("create_failed", e.message ?: "Could not create unlock key", e)
        }
    }

    @ReactMethod
    fun deleteKey(promise: Promise) {
        try {
            val ks = keyStore()
            if (ks.containsAlias(KEY_ALIAS)) ks.deleteEntry(KEY_ALIAS)
            promise.resolve(true)
        } catch (e: Throwable) {
            promise.resolve(false)
        }
    }

    // Shows the system biometric prompt and, only on success, signs the
    // base64 challenge with SHA256withRSA. Resolves the base64 signature.
    // Rejection codes: no_key, key_invalidated, use_pin, user_cancel, lockout,
    // no_activity, sign_failed.
    @ReactMethod
    fun sign(challengeBase64: String, title: String, subtitle: String, promise: Promise) {
        val activity = currentActivity as? FragmentActivity
        if (activity == null) {
            promise.reject("no_activity", "App is not in the foreground")
            return
        }

        val signature: Signature
        try {
            val ks = keyStore()
            val privateKey = ks.getKey(KEY_ALIAS, null) as? PrivateKey
            if (privateKey == null) {
                promise.reject("no_key", "No unlock key on this device")
                return
            }
            signature = Signature.getInstance("SHA256withRSA")
            signature.initSign(privateKey)
        } catch (e: KeyPermanentlyInvalidatedException) {
            promise.reject("key_invalidated", "Fingerprints or faces changed since setup — use your PIN, then set up biometrics again")
            return
        } catch (e: Throwable) {
            promise.reject("sign_failed", e.message ?: "Could not prepare unlock key", e)
            return
        }

        val challenge: ByteArray = try {
            Base64.decode(challengeBase64, Base64.NO_WRAP)
        } catch (e: Throwable) {
            promise.reject("sign_failed", "Bad challenge")
            return
        }

        activity.runOnUiThread {
            var settled = false
            val prompt = BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        if (settled) return
                        settled = true
                        try {
                            val s = result.cryptoObject?.signature
                                ?: throw IllegalStateException("No signature object")
                            s.update(challenge)
                            promise.resolve(Base64.encodeToString(s.sign(), Base64.NO_WRAP))
                        } catch (e: Throwable) {
                            promise.reject("sign_failed", e.message ?: "Signing failed", e)
                        }
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        if (settled) return
                        settled = true
                        val code = when (errorCode) {
                            BiometricPrompt.ERROR_NEGATIVE_BUTTON -> "use_pin"
                            BiometricPrompt.ERROR_USER_CANCELED,
                            BiometricPrompt.ERROR_CANCELED -> "user_cancel"
                            BiometricPrompt.ERROR_LOCKOUT,
                            BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "lockout"
                            else -> "sign_failed"
                        }
                        promise.reject(code, errString.toString())
                    }

                    // A single non-matching finger: the prompt stays up and
                    // lets them retry, so nothing to settle here.
                    override fun onAuthenticationFailed() {}
                }
            )

            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setNegativeButtonText("Use PIN")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .build()

            try {
                prompt.authenticate(info, BiometricPrompt.CryptoObject(signature))
            } catch (e: Throwable) {
                if (!settled) {
                    settled = true
                    promise.reject("sign_failed", e.message ?: "Could not show biometric prompt", e)
                }
            }
        }
    }
}
