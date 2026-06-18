package com.myphone.app

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.Mockito.any
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.mockito.junit.MockitoJUnitRunner
import org.mockito.kotlin.eq
import kotlin.test.assertEquals

/**
 * Unit tests for [DeviceControlModule].
 *
 * Verifies:
 *  - Module name is "DeviceControlModule"
 *  - lockScreen resolves when device admin is active
 *  - lockScreen rejects with ADMIN_REQUIRED and starts activity when not active
 *  - lockScreen rejects with LOCK_ERROR on unexpected exceptions
 *  - showAlarmLockscreen rejects with NO_ACTIVITY when currentActivity is null
 *  - isDeviceAdminActive resolves true/false depending on admin state
 */
@RunWith(MockitoJUnitRunner::class)
class DeviceControlModuleTest {

    @Mock
    private lateinit var reactContext: ReactApplicationContext

    @Mock
    private lateinit var devicePolicyManager: DevicePolicyManager

    @Mock
    private lateinit var promise: Promise

    private lateinit var module: DeviceControlModule

    @Before
    fun setUp() {
        `when`(reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE))
            .thenReturn(devicePolicyManager)

        // Provide a package name so ComponentName can be constructed
        `when`(reactContext.packageName).thenReturn("com.myphone.app")

        module = DeviceControlModule(reactContext)
    }

    // ---- getName ----

    @Test
    fun `getName returns DeviceControlModule`() {
        assertEquals("DeviceControlModule", module.name)
    }

    // ---- lockScreen ----

    @Test
    fun `lockScreen resolves true when device admin is active`() {
        val adminComponent = ComponentName(reactContext, MyPhoneDeviceAdminReceiver::class.java)
        `when`(devicePolicyManager.isAdminActive(adminComponent)).thenReturn(true)

        module.lockScreen(promise)

        verify(devicePolicyManager).lockNow()
        verify(promise).resolve(true)
        verify(promise, never()).reject(any<String>(), any<String>())
    }

    @Test
    fun `lockScreen rejects with ADMIN_REQUIRED and starts activity when admin not active`() {
        val adminComponent = ComponentName(reactContext, MyPhoneDeviceAdminReceiver::class.java)
        `when`(devicePolicyManager.isAdminActive(adminComponent)).thenReturn(false)

        module.lockScreen(promise)

        verify(reactContext).startActivity(any(Intent::class.java))
        verify(promise).reject("ADMIN_REQUIRED", "Device admin permission required to lock screen")
        verify(promise, never()).resolve(any())
    }

    @Test
    fun `lockScreen rejects with LOCK_ERROR when an exception is thrown`() {
        `when`(reactContext.getSystemService(Context.DEVICE_POLICY_SERVICE))
            .thenThrow(RuntimeException("System service unavailable"))

        // Re-create module so the new mock is active
        val freshModule = DeviceControlModule(reactContext)
        freshModule.lockScreen(promise)

        verify(promise).reject(eq("LOCK_ERROR"), any<String>())
        verify(promise, never()).resolve(any())
    }

    // ---- showAlarmLockscreen ----

    @Test
    fun `showAlarmLockscreen rejects with NO_ACTIVITY when currentActivity is null`() {
        // DeviceControlModule.currentActivity comes from ReactContextBaseJavaModule.
        // In a unit test environment it returns null by default because no activity is attached.
        module.showAlarmLockscreen(promise)

        verify(promise).reject("NO_ACTIVITY", "No active activity")
        verify(promise, never()).resolve(any())
    }

    // ---- isDeviceAdminActive ----

    @Test
    fun `isDeviceAdminActive resolves true when admin is active`() {
        val adminComponent = ComponentName(reactContext, MyPhoneDeviceAdminReceiver::class.java)
        `when`(devicePolicyManager.isAdminActive(adminComponent)).thenReturn(true)

        module.isDeviceAdminActive(promise)

        verify(promise).resolve(true)
        verify(promise, never()).reject(any<String>(), any<String>())
    }

    @Test
    fun `isDeviceAdminActive resolves false when admin is not active`() {
        val adminComponent = ComponentName(reactContext, MyPhoneDeviceAdminReceiver::class.java)
        `when`(devicePolicyManager.isAdminActive(adminComponent)).thenReturn(false)

        module.isDeviceAdminActive(promise)

        verify(promise).resolve(false)
    }

    @Test
    fun `isDeviceAdminActive resolves false for a freshly-created module with no admin`() {
        // Distinct package/component name should still yield false (not active by default)
        val adminComponent = ComponentName("com.myphone.app", MyPhoneDeviceAdminReceiver::class.java.name)
        `when`(devicePolicyManager.isAdminActive(any(ComponentName::class.java))).thenReturn(false)

        module.isDeviceAdminActive(promise)

        verify(promise).resolve(false)
    }
}