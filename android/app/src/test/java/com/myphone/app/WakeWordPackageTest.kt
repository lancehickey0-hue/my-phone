package com.myphone.app

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import org.junit.Test
import org.junit.runner.RunWith
import org.mockito.Mock
import org.mockito.Mockito.`when`
import org.mockito.junit.MockitoJUnitRunner
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * Unit tests for [WakeWordPackage].
 *
 * Verifies:
 *  - createNativeModules returns a list containing exactly one [WakeWordModule]
 *  - createViewManagers returns an empty list
 */
@RunWith(MockitoJUnitRunner::class)
class WakeWordPackageTest {

    @Mock
    private lateinit var reactContext: ReactApplicationContext

    private val pkg = WakeWordPackage()

    @Test
    fun `createNativeModules returns a list with one entry`() {
        `when`(reactContext.packageName).thenReturn("com.myphone.app")

        val modules = pkg.createNativeModules(reactContext)

        assertEquals(1, modules.size)
    }

    @Test
    fun `createNativeModules returns a WakeWordModule instance`() {
        `when`(reactContext.packageName).thenReturn("com.myphone.app")

        val modules = pkg.createNativeModules(reactContext)

        assertIs<WakeWordModule>(modules[0])
    }

    @Test
    fun `createViewManagers returns an empty list`() {
        val managers: List<ViewManager<*, *>> = pkg.createViewManagers(reactContext)

        assertTrue(managers.isEmpty())
    }
}