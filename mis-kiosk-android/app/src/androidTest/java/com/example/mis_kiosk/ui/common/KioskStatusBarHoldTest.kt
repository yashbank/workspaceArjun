package com.example.mis_kiosk.ui.common

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.center
import androidx.compose.ui.test.down
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.up
import com.example.mis_kiosk.ui.theme.MISKioskTheme
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Isolates [KioskStatusBar]'s "hold for 3s opens device health" gesture (K12) from the rest
 * of the app, using Compose's virtual touch + virtual clock (no OS-level input injection).
 *
 * Written while investigating why `adb shell input swipe <x> <y> <x> <y> <duration>` against
 * the running app never triggered the health screen, however long the hold (tried 3.2s-5s,
 * 0-80px of incidental movement) — including with the app's screen-pinning (lock task) turned
 * off via `adb shell am task lock stop`, which ruled out pinning as the cause. These tests
 * confirm the gesture's own logic is correct in isolation, which narrows the unreproduced
 * adb-swipe failure to something about OS-level synthetic touch injection (or the full app's
 * composition) rather than a bug in this composable.
 */
class KioskStatusBarHoldTest {

    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun holdingFor3SecondsFiresOnHold() {
        composeRule.mainClock.autoAdvance = false
        var fired = false
        composeRule.setContent {
            MISKioskTheme {
                KioskStatusBar(
                    statusColor = Color.Green,
                    statusText = "Test status",
                    rightText = "12:00",
                    onHold = { fired = true },
                )
            }
        }

        composeRule.onNodeWithText("Test status", substring = true).performTouchInput { down(center) }
        composeRule.mainClock.advanceTimeBy(3100)
        composeRule.waitForIdle()

        assertTrue("onHold should fire once the status bar has been held for 3s", fired)
    }

    @Test
    fun releasingBefore3SecondsNeverFiresOnHold() {
        composeRule.mainClock.autoAdvance = false
        var fired = false
        composeRule.setContent {
            MISKioskTheme {
                KioskStatusBar(
                    statusColor = Color.Green,
                    statusText = "Test status",
                    rightText = "12:00",
                    onHold = { fired = true },
                )
            }
        }

        composeRule.onNodeWithText("Test status", substring = true).performTouchInput {
            down(center)
        }
        composeRule.mainClock.advanceTimeBy(1500)
        composeRule.onNodeWithText("Test status", substring = true).performTouchInput { up() }
        composeRule.mainClock.advanceTimeBy(2000)
        composeRule.waitForIdle()

        assertFalse("onHold must not fire for a hold shorter than 3s", fired)
    }
}
