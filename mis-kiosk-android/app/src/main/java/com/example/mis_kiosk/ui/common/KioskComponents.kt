package com.example.mis_kiosk.ui.common

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.mis_kiosk.ui.theme.KioskColors
import com.example.mis_kiosk.ui.theme.KioskMono
import kotlinx.coroutines.delay

/** K1's own design rule: "Not a toggle... shows English and Hindi at once." Always both,
 *  never a language switch — an operator with a queue behind them won't hunt for one. */
@Composable
fun BilingualText(
    en: String,
    hi: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    color: Color = MaterialTheme.colorScheme.onBackground,
    textAlign: TextAlign? = null,
) {
    Text(en, style = style, color = color, textAlign = textAlign, modifier = modifier)
    Text(hi, style = style, color = color, textAlign = textAlign, modifier = modifier)
}

/**
 * The status line every kiosk screen (K1/K8/K10/K12) opens with: a coloured state dot +
 * short status text on the left, device name + clock on the right. Holding it for 3s opens
 * the hidden device-health screen (K12: "Reachable from idle by holding the top bar for 3
 * seconds") — this is the one gesture that exists outside the punch flow itself.
 */
@Composable
fun KioskStatusBar(
    statusColor: Color,
    statusText: String,
    rightText: String,
    modifier: Modifier = Modifier,
    onHold: (() -> Unit)? = null,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    LaunchedEffect(isPressed, onHold) {
        if (isPressed && onHold != null) {
            delay(3000)
            if (isPressed) onHold()
        }
    }

    Row(
        modifier = modifier
            .fillMaxWidth()
            .then(
                if (onHold != null) {
                    Modifier.clickable(interactionSource = interactionSource, indication = null, onClick = {})
                } else {
                    Modifier
                },
            )
            .padding(horizontal = 20.dp, vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier
                    .size(9.dp)
                    .background(statusColor, CircleShape),
            )
            Text(
                text = "  $statusText",
                style = MaterialTheme.typography.bodyMedium,
                color = KioskColors.TextSecondary,
                fontFamily = KioskMono,
            )
        }
        Text(
            text = rightText,
            style = MaterialTheme.typography.bodyMedium,
            color = KioskColors.TextSecondary,
            fontFamily = KioskMono,
        )
    }
}
