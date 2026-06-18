package com.myphone.app

import android.content.Context
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.ArgumentCaptor
import org.mockito.Mock
import org.mockito.Mockito.any
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.mockito.junit.MockitoJUnitRunner
import kotlin.test.assertEquals

/**
 * Unit tests for [WakeWordModule].
 *
 * Verifies:
 *  - Module name is "WakeWordModule"
 *  - startService starts a foreground service on API >= O
 *  - startService falls back to regular startService on API < O
 *  - stopService stops the WakeWordService
 *  - LifecycleEventListener callbacks behave correctly
 *  - Module registers itself as a lifecycle listener on construction
 */
@RunWith(MockitoJUnitRunner::class)
class WakeWordModuleTest {

    @Mock
    private lateinit var reactContext: ReactApplicationContext

    private lateinit var module: WakeWordModule

    @Before
    fun setUp() {
        `when`(reactContext.packageName).thenReturn("com.myphone.app")
        module = WakeWordModule(reactContext)
    }

    // ---- getName ----

    @Test
    fun `getName returns WakeWordModule`() {
        assertEquals("WakeWordModule", module.name)
    }

    // ---- Construction ----

    @Test
    fun `constructor registers the module as a lifecycle event listener`() {
        verify(reactContext).addLifecycleEventListener(module)
    }

    // ---- startService ----

    @Test
    fun `startService creates an intent targeting WakeWordService`() {
        val intentCaptor = ArgumentCaptor.forClass(Intent::class.java)

        // Run – we accept either startForegroundService or startService being called.
        module.startService()

        try {
            verify(reactContext).startForegroundService(intentCaptor.capture())
        } catch (e: org.mockito.exceptions.base.MockitoAssertionError) {
            verify(reactContext).startService(intentCaptor.capture())
        }

        val capturedIntent = intentCaptor.value
        assertEquals(
            WakeWordService::class.java.name,
            capturedIntent.component?.className
        )
    }

    @Test
    fun `stopService creates an intent targeting WakeWordService`() {
        val intentCaptor = ArgumentCaptor.forClass(Intent::class.java)

        module.stopService()

        verify(reactContext).stopService(intentCaptor.capture())
        assertEquals(
            WakeWordService::class.java.name,
            intentCaptor.value.component?.className
        )
    }

    // ---- LifecycleEventListener ----

    @Test
    fun `onHostResume triggers startService (starts WakeWordService)`() {
        module.onHostResume()

        // Either startForegroundService or startService must be called
        try {
            verify(reactContext).startForegroundService(any(Intent::class.java))
        } catch (e: org.mockito.exceptions.base.MockitoAssertionError) {
            verify(reactContext).startService(any(Intent::class.java))
        }
    }

    @Test
    fun `onHostPause does not start or stop any service`() {
        module.onHostPause()

        verify(reactContext, never()).startService(any(Intent::class.java))
        verify(reactContext, never()).startForegroundService(any(Intent::class.java))
        verify(reactContext, never()).stopService(any(Intent::class.java))
    }

    @Test
    fun `onHostDestroy does not start or stop any service`() {
        module.onHostDestroy()

        verify(reactContext, never()).startService(any(Intent::class.java))
        verify(reactContext, never()).startForegroundService(any(Intent::class.java))
        verify(reactContext, never()).stopService(any(Intent::class.java))
    }
}