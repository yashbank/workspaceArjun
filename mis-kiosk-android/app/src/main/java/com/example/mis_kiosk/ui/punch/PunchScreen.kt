package com.example.mis_kiosk.ui.punch

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.mis_kiosk.data.local.PunchQueueEntity
import com.example.mis_kiosk.data.local.PunchQueueStatus
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay

private val SUCCESS_GREEN = Color(0xFF2E7D32)
private val WARNING_AMBER = Color(0xFFB26A00)
private const val SUCCESS_AUTO_DISMISS_MS = 2500L

@Composable
fun PunchScreen(
    viewModelKey: String? = null,
    viewModel: PunchViewModel = viewModel(key = viewModelKey),
    onRevoked: () -> Unit = {},
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val badgeInput by viewModel.badgeInput.collectAsStateWithLifecycle()
    val submission by viewModel.submission.collectAsStateWithLifecycle()
    val needsAttention by viewModel.needsAttention.collectAsStateWithLifecycle()

    LaunchedEffect(uiState) {
        if (uiState is PunchUiState.Revoked) onRevoked()
    }

    LaunchedEffect(submission) {
        val current = submission
        if (current is PunchSubmission.Success) {
            delay(SUCCESS_AUTO_DISMISS_MS)
            viewModel.dismissSubmission()
        }
    }

    PunchScreenContent(
        deviceName = viewModel.deviceName,
        uiState = uiState,
        badgeInput = badgeInput,
        submission = submission,
        needsAttention = needsAttention,
        onBadgeInputChange = viewModel::onBadgeInputChange,
        onSubmit = viewModel::submitBadge,
        onRetry = viewModel::retry,
        onDismissSubmission = viewModel::dismissSubmission,
        onDismissNeedsAttention = viewModel::dismissNeedsAttention,
        onRefresh = viewModel::refresh,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PunchScreenContent(
    deviceName: String,
    uiState: PunchUiState,
    badgeInput: String,
    submission: PunchSubmission?,
    needsAttention: List<PunchQueueEntity>,
    onBadgeInputChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onRetry: () -> Unit,
    onDismissSubmission: () -> Unit,
    onDismissNeedsAttention: (String) -> Unit,
    onRefresh: () -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(deviceName) },
                actions = {
                    val syncing = (uiState as? PunchUiState.Ready)?.syncing == true
                    if (syncing) {
                        CircularProgressIndicator(
                            modifier = Modifier.padding(horizontal = 16.dp).size(20.dp),
                            strokeWidth = 2.dp,
                        )
                    } else {
                        OutlinedButton(onClick = onRefresh, modifier = Modifier.padding(horizontal = 8.dp)) {
                            Text("Refresh")
                        }
                    }
                },
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (uiState) {
                is PunchUiState.Loading -> LoadingContent()
                is PunchUiState.Error -> ErrorContent(uiState.message, onRefresh)
                is PunchUiState.Revoked -> Unit // handled by onRevoked navigation
                is PunchUiState.Ready -> Column(modifier = Modifier.fillMaxSize()) {
                    RosterStatusBar(uiState)
                    if (needsAttention.isNotEmpty()) {
                        NeedsAttentionList(needsAttention, onDismissNeedsAttention)
                    }
                    BadgeEntryBody(
                        badgeInput = badgeInput,
                        submissionActive = submission != null,
                        onBadgeInputChange = onBadgeInputChange,
                        onSubmit = onSubmit,
                    )
                }
            }

            if (submission != null) {
                SubmissionOverlay(
                    submission = submission,
                    onRetry = onRetry,
                    onDismiss = onDismissSubmission,
                )
            }
        }
    }
}

@Composable
private fun LoadingContent() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text("Loading roster…", style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun ErrorContent(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(message, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        Button(onClick = onRetry) { Text("Retry") }
    }
}

@Composable
private fun RosterStatusBar(state: PunchUiState.Ready) {
    Surface(color = MaterialTheme.colorScheme.surfaceVariant) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${state.employeeCount} employees", style = MaterialTheme.typography.bodySmall)
                Text(
                    text = state.lastSyncedAtMillis?.let { "Synced ${formatTime(it)}" } ?: "Not yet synced",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (state.syncError != null) {
                Text(
                    "Last refresh failed: ${state.syncError}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            // A tablet loses wifi routinely on a factory floor — this must never look
            // "stuck" without explanation (K12 / HANDOVER.md's offline-queue item).
            if (state.queuedCount > 0) {
                Text(
                    "${state.queuedCount} punch${if (state.queuedCount == 1) "" else "es"} queued — will send when back online",
                    style = MaterialTheme.typography.bodySmall,
                    color = WARNING_AMBER,
                )
            }
        }
    }
}

@Composable
private fun NeedsAttentionList(
    entries: List<PunchQueueEntity>,
    onDismiss: (String) -> Unit,
) {
    Surface(color = MaterialTheme.colorScheme.errorContainer) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 200.dp)) {
            Text(
                "Needs attention",
                style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
            )
            LazyColumn {
                items(entries, key = { it.key }) { entry ->
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            val statusLabel = if (entry.status == PunchQueueStatus.REJECTED) "Rejected" else "Parked"
                            Text(
                                "${entry.employeeName} — $statusLabel",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                entry.detail ?: "",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        TextButton(onClick = { onDismiss(entry.key) }) { Text("Dismiss") }
                    }
                    HorizontalDivider()
                }
            }
        }
    }
}

@Composable
private fun BadgeEntryBody(
    badgeInput: String,
    submissionActive: Boolean,
    onBadgeInputChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Scan or enter badge code", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(32.dp))
        OutlinedTextField(
            value = badgeInput,
            onValueChange = onBadgeInputChange,
            enabled = !submissionActive,
            singleLine = true,
            textStyle = MaterialTheme.typography.displaySmall.copy(textAlign = TextAlign.Center),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
            modifier = Modifier.widthIn(max = 560.dp),
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onSubmit,
            enabled = !submissionActive && badgeInput.isNotBlank(),
        ) {
            Text("Submit", style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun SubmissionOverlay(
    submission: PunchSubmission,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.4f)),
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            shape = MaterialTheme.shapes.large,
            modifier = Modifier.widthIn(max = 520.dp).padding(24.dp),
        ) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                when (submission) {
                    PunchSubmission.InProgress -> {
                        CircularProgressIndicator()
                        Spacer(Modifier.height(16.dp))
                        Text("Checking…", style = MaterialTheme.typography.titleMedium)
                    }
                    is PunchSubmission.Success -> {
                        Text("✓", style = MaterialTheme.typography.displayMedium, color = SUCCESS_GREEN)
                        Spacer(Modifier.height(16.dp))
                        val directionLabel = if (submission.direction == "IN") "IN" else "OUT"
                        Text(
                            "${submission.employeeName} punched $directionLabel",
                            style = MaterialTheme.typography.headlineSmall,
                            textAlign = TextAlign.Center,
                            fontWeight = FontWeight.Bold,
                        )
                        if (submission.wasDuplicate) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                "(already recorded)",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    is PunchSubmission.NeedsAttention -> {
                        Text("⚠", style = MaterialTheme.typography.displayMedium, color = WARNING_AMBER)
                        Spacer(Modifier.height(16.dp))
                        Text(
                            submission.employeeName,
                            style = MaterialTheme.typography.titleLarge,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(submission.detail, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
                        Spacer(Modifier.height(24.dp))
                        Button(onClick = onDismiss) { Text("OK") }
                    }
                    is PunchSubmission.Invalid -> {
                        Text(
                            "✕",
                            style = MaterialTheme.typography.displayMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                        Spacer(Modifier.height(16.dp))
                        Text(submission.detail, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
                        Spacer(Modifier.height(24.dp))
                        Button(onClick = onDismiss) { Text("OK") }
                    }
                    is PunchSubmission.RetryPrompt -> {
                        Text(
                            submission.employeeName,
                            style = MaterialTheme.typography.titleLarge,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(submission.detail, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center)
                        Spacer(Modifier.height(24.dp))
                        Text(
                            "It'll stay queued and retry automatically even if you dismiss this.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(16.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            OutlinedButton(onClick = onDismiss) { Text("Later") }
                            Button(onClick = onRetry) { Text("Retry now") }
                        }
                    }
                }
            }
        }
    }
}

private fun formatTime(epochMillis: Long): String =
    SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(epochMillis))
