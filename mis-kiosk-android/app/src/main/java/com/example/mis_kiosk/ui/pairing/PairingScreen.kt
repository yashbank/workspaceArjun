package com.example.mis_kiosk.ui.pairing

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
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
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
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

private fun fadeThrough() =
    fadeIn(animationSpec = tween(220)) togetherWith fadeOut(animationSpec = tween(120))

@Composable
private fun RequestingCodeContent() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator()
        Spacer(Modifier.height(24.dp))
        Text("Requesting a pairing code…", style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun AwaitingApprovalContent(state: PairingUiState.AwaitingApproval) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.widthIn(max = 720.dp).padding(32.dp),
    ) {
        Text(
            text = "Pair this tablet",
            style = MaterialTheme.typography.headlineSmall,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = "In the web portal, go to Settings → Devices and enter this code.",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(40.dp))
        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = MaterialTheme.shapes.large,
        ) {
            Text(
                text = state.code,
                softWrap = false,
                style = MaterialTheme.typography.displayLarge.copy(
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 6.sp,
                    fontSize = 56.sp,
                ),
                modifier = Modifier.padding(horizontal = 48.dp, vertical = 24.dp),
            )
        }
        Spacer(Modifier.height(32.dp))
        CountdownText(expiresAtMillis = state.expiresAtMillis)
        Spacer(Modifier.height(24.dp))
        Row(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
            Text(
                text = if (state.reconnecting) "Waiting for approval — having trouble reaching the server…" else "Waiting for approval…",
                style = MaterialTheme.typography.bodyMedium,
                color = if (state.reconnecting) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
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
        "Expires in %d:%02d".format(totalSeconds / 60, totalSeconds % 60)
    } else {
        "Expiring…"
    }
    Text(text = text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
        Text(
            text = "✓",
            style = MaterialTheme.typography.displayMedium,
            color = Color(0xFF2E7D32),
        )
        Spacer(Modifier.height(16.dp))
        Text(
            text = "Paired as ${state.deviceName}",
            style = MaterialTheme.typography.headlineSmall,
            textAlign = TextAlign.Center,
        )
    }
}
