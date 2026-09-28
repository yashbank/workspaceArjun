package com.example.mis_kiosk.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

/** Always dark — this is a fixed gate kiosk, not a phone; there is no light variant. */
private val KioskColorScheme = darkColorScheme(
    primary = KioskColors.Green,
    onPrimary = KioskColors.GreenOn,
    secondary = KioskColors.Teal,
    onSecondary = KioskColors.Background,
    tertiary = KioskColors.Gold,
    background = KioskColors.Background,
    onBackground = KioskColors.TextPrimary,
    surface = KioskColors.Surface,
    onSurface = KioskColors.TextPrimary,
    surfaceVariant = KioskColors.SurfaceVariant,
    onSurfaceVariant = KioskColors.TextSecondary,
    outline = KioskColors.Border,
    error = KioskColors.Error,
    onError = KioskColors.TextPrimary,
    errorContainer = KioskColors.ErrorContainer,
    onErrorContainer = KioskColors.TextPrimary,
)

@Composable
fun MISKioskTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = KioskColorScheme,
        typography = Typography,
        content = content,
    )
}
