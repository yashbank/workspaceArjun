package com.example.mis_kiosk.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * The kiosk design spec (design/screens/K1, K8, K10, K12 in the backend repo) — dark,
 * deliberately: "the one surface in the system that does not follow the portal's light
 * theme," mounted at a gate before sunrise and on all day. Never offer a light variant.
 */
object KioskColors {
    val Background = Color(0xFF121013)
    val Surface = Color(0xFF1C1712)
    val SurfaceVariant = Color(0xFF261F17)
    val Border = Color(0xFF332B20)

    val TextPrimary = Color(0xFFF3EDE3)
    val TextSecondary = Color(0xFFA69C8B)
    val TextMuted = Color(0xFF756B5C)

    /** The pairing code, K10. */
    val Gold = Color(0xFFE3C287)

    /** The scan target, K1. */
    val Teal = Color(0xFF5FE0D0)

    /** Clock In / success, K1 + K8. */
    val Green = Color(0xFF3FBE7A)
    val GreenOn = Color(0xFF0B2016)

    /** Offline / queued / battery warnings, K12. */
    val Amber = Color(0xFFD99A3D)
    val AmberContainer = Color(0xFF3A2A14)

    /** Manual-entry tag, K8. */
    val ManualTag = Color(0xFFD2891F)

    val StatusOnline = Color(0xFF4ADE80)
    val StatusOffline = Color(0xFFF5A623)

    val Error = Color(0xFFE5484D)
    val ErrorContainer = Color(0xFF3A1616)
}
