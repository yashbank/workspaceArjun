package com.example.mis_kiosk

import android.app.ActivityManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import com.example.mis_kiosk.ui.pairing.PairingScreen
import com.example.mis_kiosk.ui.punch.PunchScreen
import com.example.mis_kiosk.ui.theme.MISKioskTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MISKioskTheme {
                // Both screens keep their own ViewModel in this Activity's single
                // ViewModelStore, keyed by class name by default — since the Activity
                // itself never recreates, that ViewModel survives even after its
                // composable leaves composition, still sitting in its old terminal
                // state (Paired / Revoked). A fresh key per visit forces a fresh
                // ViewModel instead of resurrecting a stale one that would otherwise
                // immediately re-fire its old onPaired/onRevoked callback and bounce
                // straight back to the screen we're trying to leave.
                var screenGeneration by rememberSaveable { mutableIntStateOf(0) }
                var paired by rememberSaveable { mutableStateOf(false) }
                if (paired) {
                    PunchScreen(
                        viewModelKey = "punch-$screenGeneration",
                        onRevoked = {
                            screenGeneration++
                            paired = false
                        },
                    )
                } else {
                    PairingScreen(
                        viewModelKey = "pairing-$screenGeneration",
                        onPaired = {
                            screenGeneration++
                            paired = true
                        },
                    )
                }
            }
        }
    }

    /**
     * This app has no Device Owner enrollment (no MDM fleet for this factory's handful of
     * tablets), so the only lock task tier available is manual "screen pinning" —
     * `startLockTask()` must be called while resumed (foreground), not from onCreate. The
     * device's own "Ask for PIN before unpinning" setting (Settings → Security → App
     * pinning/Pin windows) is what actually keeps a factory-floor worker from exiting; the
     * back+recents-hold / swipe-up-hold gesture is the intended admin escape hatch by OS
     * design, not a gap in this code, so there is no in-app "exit kiosk mode" action to match.
     */
    override fun onResume() {
        super.onResume()
        val activityManager = getSystemService(ActivityManager::class.java)
        if (activityManager?.lockTaskModeState == ActivityManager.LOCK_TASK_MODE_NONE) {
            startLockTask()
        }
    }
}
