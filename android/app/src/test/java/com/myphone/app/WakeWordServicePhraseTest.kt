package com.myphone.app

import org.junit.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Unit tests for the wake phrase detection logic used in [WakeWordService].
 *
 * WakeWordService.onResults() checks each recognition result against a fixed
 * list of wake phrases using a case-insensitive substring match.  Since that
 * logic lives inside a private inner class (RecognitionListener), these tests
 * replicate the exact algorithm so we can validate all matching rules without
 * needing a running Android runtime:
 *
 *   val lower = phrase.lowercase().trim()
 *   if (WAKE_PHRASES.any { lower.contains(it) }) → wake word detected
 *
 * The three configured wake phrases are:
 *   "hey my phone where are you"
 *   "hey my-phone where are you"
 *   "my phone where are you"
 */
class WakeWordServicePhraseTest {

    /** Reproduces the private WAKE_PHRASES list exactly as defined in WakeWordService. */
    private val WAKE_PHRASES = listOf(
        "hey my phone where are you",
        "hey my-phone where are you",
        "my phone where are you",
    )

    /** Reproduces the matching algorithm from WakeWordService.onResults(). */
    private fun isWakePhrase(phrase: String): Boolean {
        val lower = phrase.lowercase().trim()
        return WAKE_PHRASES.any { lower.contains(it) }
    }

    // ---- Positive matches ----

    @Test
    fun `exact phrase 'hey my phone where are you' triggers detection`() {
        assertTrue(isWakePhrase("hey my phone where are you"))
    }

    @Test
    fun `exact phrase 'hey my-phone where are you' triggers detection`() {
        assertTrue(isWakePhrase("hey my-phone where are you"))
    }

    @Test
    fun `exact phrase 'my phone where are you' triggers detection`() {
        assertTrue(isWakePhrase("my phone where are you"))
    }

    @Test
    fun `uppercase wake phrase is matched case-insensitively`() {
        assertTrue(isWakePhrase("HEY MY PHONE WHERE ARE YOU"))
    }

    @Test
    fun `mixed-case wake phrase is matched`() {
        assertTrue(isWakePhrase("Hey My Phone Where Are You"))
    }

    @Test
    fun `wake phrase embedded in longer utterance is still detected`() {
        assertTrue(isWakePhrase("ok so hey my phone where are you right now?"))
    }

    @Test
    fun `leading and trailing whitespace is stripped before matching`() {
        assertTrue(isWakePhrase("  hey my phone where are you  "))
    }

    @Test
    fun `'my phone where are you' variant is matched even without 'hey' prefix`() {
        assertTrue(isWakePhrase("my phone where are you I lost it"))
    }

    @Test
    fun `hyphenated variant 'hey my-phone where are you' is matched`() {
        assertTrue(isWakePhrase("hey my-phone where are you please"))
    }

    // ---- Negative matches ----

    @Test
    fun `empty string does not trigger detection`() {
        assertFalse(isWakePhrase(""))
    }

    @Test
    fun `partial phrase 'hey my phone' alone does not trigger detection`() {
        assertFalse(isWakePhrase("hey my phone"))
    }

    @Test
    fun `phrase 'where are you' alone does not trigger detection`() {
        assertFalse(isWakePhrase("where are you"))
    }

    @Test
    fun `unrelated speech does not trigger detection`() {
        assertFalse(isWakePhrase("play some music"))
    }

    @Test
    fun `phrase with wrong connector 'hey myphone where are you' does not match`() {
        // Neither "hey my phone" nor "hey my-phone" – missing space and hyphen
        assertFalse(isWakePhrase("hey myphone where are you"))
    }

    @Test
    fun `only 'my phone' without 'where are you' does not match`() {
        assertFalse(isWakePhrase("my phone"))
    }

    @Test
    fun `phrase 'hey my phone where' (incomplete) does not match`() {
        assertFalse(isWakePhrase("hey my phone where"))
    }

    // ---- Edge cases ----

    @Test
    fun `multiple wake phrases in one result – first match is sufficient`() {
        // Contains both "hey my phone where are you" and "my phone where are you"
        assertTrue(isWakePhrase("hey my phone where are you and my phone where are you"))
    }

    @Test
    fun `very long string containing wake phrase is still detected`() {
        val long = "blah ".repeat(100) + "hey my phone where are you" + " blah".repeat(100)
        assertTrue(isWakePhrase(long))
    }

    @Test
    fun `recognition noise prefix does not prevent matching`() {
        assertTrue(isWakePhrase("[NOISE] hey my phone where are you"))
    }
}