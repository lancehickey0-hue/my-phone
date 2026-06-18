package com.myphone.app

import android.content.Context
import android.content.Intent
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.junit.MockitoJUnitRunner

/**
 * Unit tests for [MyPhoneDeviceAdminReceiver].
 *
 * The receiver only logs messages on enable/disable events.
 * Tests verify that neither callback throws any exception and that
 * the class can be instantiated normally.
 */
@RunWith(MockitoJUnitRunner::class)
class MyPhoneDeviceAdminReceiverTest {

    @Mock
    private lateinit var context: Context

    @Mock
    private lateinit var intent: Intent

    private val receiver = MyPhoneDeviceAdminReceiver()

    @Test
    fun `onEnabled does not throw`() {
        receiver.onEnabled(context, intent)
        // No assertion needed – the method only calls Log.d; success means no exception.
    }

    @Test
    fun `onDisabled does not throw`() {
        receiver.onDisabled(context, intent)
        // No assertion needed – the method only calls Log.d; success means no exception.
    }

    @Test
    fun `receiver can be instantiated`() {
        // Regression guard: ensure the class has a no-arg constructor accessible via the OS
        val freshReceiver = MyPhoneDeviceAdminReceiver()
        // If instantiation succeeds, the test passes
    }

    @Test
    fun `onEnabled and onDisabled are independent and can both be called`() {
        // Calling both in sequence should not cause any state corruption
        receiver.onEnabled(context, intent)
        receiver.onDisabled(context, intent)
        receiver.onEnabled(context, intent)
        // No exception → pass
    }
}