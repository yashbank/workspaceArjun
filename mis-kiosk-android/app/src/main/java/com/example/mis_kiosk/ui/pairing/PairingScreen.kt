package com.example.mis_kiosk.ui.pairing

import android.os.Build
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.mis_kiosk.ui.common.KioskStatusBar
import com.example.mis_kiosk.ui.theme.KioskColors
import com.example.mis_kiosk.ui.theme.KioskMono
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay

@Composable
fun PairingScreen(
    viewModelKey: String? = null,
    viewModel: PairingViewModel = viewModel(key = viewModelKey),
    onPaired: (deviceName: String) -> Unit = {},
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    LaunchedEffect(uiState) {
        val state = uiState
        if (state is PairingUiState.Paired) onPaired(state.deviceName)
    }

    PairingScreenContent(uiState = uiState, onRequestNewCode = viewModel::requestNewCode)
}

@Composable
private fun PairingScreenContent(
    uiState: PairingUiState,
    onRequestNewCode: () -> Unit,
) {
    val (statusColor, statusText) = when (uiState) {
        is PairingUiState.Paired -> KioskColors.StatusOnline to "Enrolled · ${uiState.deviceName}"
        else -> KioskColors.StatusOffline to "Not enrolled · no data on device"
    }
    Surface(modifier = Modifier.fillMaxSize(), color = KioskColors.Background) {
        Column(modifier = Modifier.fillMaxSize()) {
            KioskStatusBar(statusColor = statusColor, statusText = statusText, rightText = liveClock())
            HorizontalDivider(color = KioskColors.Border)
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                AnimatedContent(
                    targetState = uiState,
                    label = "pairing-state",
                    transitionSpec = { fadeThrough() },
                ) { state ->
                    when (state) {
                        is PairingUiState.RequestingCode -> RequestingCodeContent()
                        is PairingUiState.AwaitingApproval -> AwaitingApprovalContent(state)
                        is PairingUiState.NeedsNewCode -> MessageWithRetryContent(
                            message = state.message,
                            onRetry = onRequestNewCode,
                        )
                        is PairingUiState.RequestFailed -> MessageWithRetryContent(
                            message = state.message,
                            onRetry = onRequestNewCode,
                        )
                        is PairingUiState.Paired -> PairedContent(state)
                    }
                }
            }
        }
    }
}

@Composable
private fun liveClock(): String {
    var now by remember { mutableStateOf(SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())) }
    LaunchedEffect(Unit) {
        while (true) {
            now = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
            delay(1000)
        }
    }
    return now
}

private fun fadeThrough() =
    fadeIn(animationSpec = tween(220)) togetherWith fadeOut(animationSpec = tween(120))

@Composable
private fun RequestingCodeContent() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator(color = KioskColors.Gold)
        Spacer(Modifier.height(24.dp))
        Text("Requesting a pairing code…", style = MaterialTheme.typography.titleMedium, color = KioskColors.TextPrimary)
    }
}

@Composable
private fun AwaitingApprovalContent(state: PairingUiState.AwaitingApproval) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.widthIn(max = 640.dp).padding(32.dp),
    ) {
        Text("Pair this device", style = MaterialTheme.typography.headlineSmall, color = KioskColors.TextPrimary)
        Spacer(Modifier.height(8.dp))
        Text(
            text = "An Admin enters this code in Settings → Devices.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = KioskColors.TextSecondary,
        )
        Spacer(Modifier.height(32.dp))
        Surface(color = KioskColors.SurfaceVariant, shape = MaterialTheme.shapes.large) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(horizontal = 40.dp, vertical = 20.dp)) {
                Text(
                    text = state.code,
                    softWrap = false,
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontFamily = KioskMono,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 5.sp,
                        fontSize = 48.sp,
                    ),
                    color = KioskColors.Gold,
                )
                Spacer(Modifier.height(8.dp))
                CountdownText(expiresAtMillis = state.expiresAtMillis)
            }
        }
        Spacer(Modifier.height(24.dp))
        DetailsTable()
        Spacer(Modifier.height(24.dp))
        Surface(color = KioskColors.SurfaceVariant, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = KioskColors.TextSecondary)
                Spacer(Modifier.width(10.dp))
                Text(
                    text = if (state.reconnecting) "Waiting for Admin — having trouble reaching the server…" else "Waiting for Admin…",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (state.reconnecting) KioskColors.Error else KioskColors.TextPrimary,
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        Text(
            "Un-enrolling wipes the local cache",
            style = MaterialTheme.typography.bodySmall,
            color = KioskColors.TextMuted,
        )
    }
}

@Composable
private fun DetailsTable() {
    val deviceLabel = "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}"
    Surface(color = KioskColors.SurfaceVariant, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
            DetailRow("Device", deviceLabel)
            HorizontalDivider(color = KioskColors.Border)
            DetailRow("Pulls", "Employees, shifts, rules")
            HorizontalDivider(color = KioskColors.Border)
            DetailRow("Never pulls", "Wages, orders, customers", valueColor = KioskColors.Green)
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String, valueColor: androidx.compose.ui.graphics.Color = KioskColors.TextPrimary) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = KioskColors.TextSecondary)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = valueColor, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun CountdownText(expiresAtMillis: Long) {
    var remainingMs by remember(expiresAtMillis) { mutableLongStateOf(expiresAtMillis - System.currentTimeMillis()) }
    LaunchedEffect(expiresAtMillis) {
        while (true) {
            remainingMs = expiresAtMillis - System.currentTimeMillis()
            if (remainingMs <= 0) break
            delay(1000)
        }
    }
    val text = if (remainingMs > 0) {
        val totalSeconds = remainingMs / 1000
        "Expires in %02d:%02d".format(totalSeconds / 60, totalSeconds % 60)
    } else {
        "Expiring…"
    }
    Text(text = text, style = MaterialTheme.typography.bodyMedium, color = KioskColors.TextSecondary, fontFamily = KioskMono)
}

@Composable
private fun MessageWithRetryContent(message: String, onRetry: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.widthIn(max = 480.dp).padding(32.dp),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center,
            color = KioskColors.TextPrimary,
        )
        Spacer(Modifier.height(24.dp))
        Button(onClick = onRetry) {
            Text("Request a new code")
        }
    }
}

@Composable
private fun PairedContent(state: PairingUiState.Paired) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Box(
            modifier = Modifier
                .background(KioskColors.Green, shape = androidx.compose.foundation.shape.CircleShape)
                .padding(20.dp),
        ) {
            Text(text = "✓", style = MaterialTheme.typography.displayMedium, color = KioskColors.GreenOn)
        }
        Spacer(Modifier.height(16.dp))
        Text(
            text = "Paired as ${state.deviceName}",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
            color = KioskColors.TextPrimary,
        )
    }
}
