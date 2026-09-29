package com.example.mis_kiosk.ui.punch

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.mis_kiosk.data.local.EmployeeEntity
import com.example.mis_kiosk.data.local.PunchQueueEntity
import com.example.mis_kiosk.data.local.PunchQueueStatus
import com.example.mis_kiosk.ui.common.BilingualText
import com.example.mis_kiosk.ui.common.KioskStatusBar
import com.example.mis_kiosk.ui.health.DeviceHealthScreen
import com.example.mis_kiosk.ui.scan.QrScannerView
import com.example.mis_kiosk.ui.theme.KioskColors
import com.example.mis_kiosk.ui.theme.KioskMono
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay

private const val SUCCESS_AUTO_DISMISS_MS = 2000L
// Was 30s, matched to a slow backend. Now that /punch measures ~1s live, an 8s replay clears
// a real transient blip almost as fast as a person could react to the on-screen prompt anyway.
private const val RETRY_AUTO_REPLAY_MS = 8_000L

@Composable
fun PunchScreen(
    viewModelKey: String? = null,
    viewModel: PunchViewModel = viewModel(key = viewModelKey),
    onRevoked: () -> Unit = {},
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val mode by viewModel.mode.collectAsStateWithLifecycle()
    val badgeInput by viewModel.badgeInput.collectAsStateWithLifecycle()
    val manualMatch by viewModel.manualMatch.collectAsStateWithLifecycle()
    val scanHint by viewModel.scanHint.collectAsStateWithLifecycle()
    val submission by viewModel.submission.collectAsStateWithLifecycle()
    val needsAttention by viewModel.needsAttention.collectAsStateWithLifecycle()

    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED,
        )
    }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
    }
    LaunchedEffect(mode) {
        if (mode is PunchMode.Scanning && !hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    var showHealthScreen by remember { mutableStateOf(false) }

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

    // Matches the shipped web kiosk: a RetryPrompt left on screen re-attempts itself every
    // 30s rather than waiting on the operator to notice and tap "Retry now". Cancelled the
    // moment `submission` changes (dismissed, or the retry above already resolved it).
    LaunchedEffect(submission) {
        if (submission is PunchSubmission.RetryPrompt) {
            delay(RETRY_AUTO_REPLAY_MS)
            viewModel.retry()
        }
    }

    if (showHealthScreen) {
        DeviceHealthScreen(
            onClose = { showHealthScreen = false },
            onEndShift = {
                viewModel.endShift()
                showHealthScreen = false
            },
        )
        return
    }

    val currentOperator by viewModel.currentOperator.collectAsStateWithLifecycle()
    if (currentOperator == null && uiState is PunchUiState.Ready) {
        val operatorInput by viewModel.operatorInput.collectAsStateWithLifecycle()
        val operatorMatch by viewModel.operatorMatch.collectAsStateWithLifecycle()
        OperatorSignInScreen(
            operatorInput = operatorInput,
            match = operatorMatch,
            onInputChange = viewModel::onOperatorInputChange,
            onConfirm = viewModel::confirmOperatorSignIn,
        )
        return
    }

    PunchScreenContent(
        deviceName = viewModel.deviceName,
        uiState = uiState,
        mode = mode,
        badgeInput = badgeInput,
        manualMatch = manualMatch,
        scanHint = scanHint,
        submission = submission,
        needsAttention = needsAttention,
        hasCameraPermission = hasCameraPermission,
        onStartScanning = viewModel::startScanning,
        onOpenManualEntry = viewModel::openManualEntry,
        onBackToIdle = viewModel::backToIdle,
        onQrScanned = viewModel::onQrScanned,
        onConfirmScanned = viewModel::confirmScannedPunch,
        onRejectConfirmation = viewModel::rejectConfirmation,
        onManualInputChange = viewModel::onManualInputChange,
        onConfirmManualEntry = viewModel::confirmManualEntry,
        onRetry = viewModel::retry,
        onDismissSubmission = viewModel::dismissSubmission,
        onDismissNeedsAttention = viewModel::dismissNeedsAttention,
        onRefresh = viewModel::refresh,
        onHoldStatusBar = { showHealthScreen = true },
    )
}

@Composable
private fun PunchScreenContent(
    deviceName: String,
    uiState: PunchUiState,
    mode: PunchMode,
    badgeInput: String,
    manualMatch: EmployeeEntity?,
    scanHint: String?,
    submission: PunchSubmission?,
    needsAttention: List<PunchQueueEntity>,
    hasCameraPermission: Boolean,
    onStartScanning: () -> Unit,
    onOpenManualEntry: () -> Unit,
    onBackToIdle: () -> Unit,
    onQrScanned: (String) -> Unit,
    onConfirmScanned: () -> Unit,
    onRejectConfirmation: () -> Unit,
    onManualInputChange: (String) -> Unit,
    onConfirmManualEntry: () -> Unit,
    onRetry: () -> Unit,
    onDismissSubmission: () -> Unit,
    onDismissNeedsAttention: (String) -> Unit,
    onRefresh: () -> Unit,
    onHoldStatusBar: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = KioskColors.Background) {
        Column(modifier = Modifier.fillMaxSize()) {
            val syncing = (uiState as? PunchUiState.Ready)?.syncing == true
            KioskStatusBar(
                statusColor = if (syncing) KioskColors.StatusOffline else KioskColors.StatusOnline,
                statusText = "$deviceName · synced ${(uiState as? PunchUiState.Ready)?.let { formatAge(it.lastSyncedAtMillis) } ?: "never"}",
                rightText = liveClock(),
                onHold = onHoldStatusBar,
            )
            HorizontalDivider(color = KioskColors.Border)

            Box(modifier = Modifier.fillMaxSize()) {
                when (uiState) {
                    is PunchUiState.Loading -> LoadingContent()
                    is PunchUiState.Error -> ErrorContent(uiState.message, onRefresh)
                    is PunchUiState.Revoked -> Unit
                    is PunchUiState.Ready -> Column(modifier = Modifier.fillMaxSize()) {
                        if (uiState.queuedCount > 0 || uiState.syncError != null) {
                            StatusStrip(uiState)
                        }
                        if (needsAttention.isNotEmpty()) {
                            NeedsAttentionList(needsAttention, onDismissNeedsAttention)
                        }
                        Box(modifier = Modifier.fillMaxSize()) {
                            when (mode) {
                                is PunchMode.Idle -> IdleContent(
                                    clockedInCount = uiState.clockedInCount,
                                    onStartScanning = onStartScanning,
                                    onOpenManualEntry = onOpenManualEntry,
                                )
                                is PunchMode.Scanning -> ScanningContent(
                                    hasCameraPermission = hasCameraPermission,
                                    scanHint = scanHint,
                                    onQrScanned = onQrScanned,
                                    onCancel = onBackToIdle,
                                    onOpenManualEntry = onOpenManualEntry,
                                )
                                is PunchMode.ManualEntry -> ManualEntryContent(
                                    badgeInput = badgeInput,
                                    match = manualMatch,
                                    onInputChange = onManualInputChange,
                                    onConfirm = onConfirmManualEntry,
                                    onCancel = onBackToIdle,
                                )
                                is PunchMode.Confirming -> ConfirmCardContent(
                                    employee = mode.employee,
                                    kind = mode.kind,
                                    onConfirm = onConfirmScanned,
                                    onReject = onRejectConfirmation,
                                )
                            }
                        }
                    }
                }

                if (submission != null) {
                    SubmissionOverlay(submission = submission, onRetry = onRetry, onDismiss = onDismissSubmission)
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

private fun formatAge(lastSyncedAtMillis: Long?): String {
    if (lastSyncedAtMillis == null) return "never"
    val seconds = (System.currentTimeMillis() - lastSyncedAtMillis) / 1000
    return when {
        seconds < 60 -> "${seconds}s ago"
        seconds < 3600 -> "${seconds / 60}m ago"
        else -> "${seconds / 3600}h ago"
    }
}

@Composable
private fun LoadingContent() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(color = KioskColors.Teal)
        Spacer(Modifier.height(16.dp))
        Text("Loading roster…", style = MaterialTheme.typography.titleMedium, color = KioskColors.TextPrimary)
    }
}

@Composable
private fun ErrorContent(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(message, style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, color = KioskColors.TextPrimary)
        Spacer(Modifier.height(16.dp))
        Button(onClick = onRetry) { Text("Retry") }
    }
}

@Composable
private fun StatusStrip(state: PunchUiState.Ready) {
    Surface(color = KioskColors.SurfaceVariant) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
            if (state.queuedCount > 0) {
                Text(
                    "${state.queuedCount} punch${if (state.queuedCount == 1) "" else "es"} queued — will send when back online",
                    style = MaterialTheme.typography.bodySmall,
                    color = KioskColors.Amber,
                )
            }
            if (state.syncError != null) {
                Text(
                    "Last refresh failed: ${state.syncError}",
                    style = MaterialTheme.typography.bodySmall,
                    color = KioskColors.Error,
                )
            }
        }
    }
}

@Composable
private fun NeedsAttentionList(entries: List<PunchQueueEntity>, onDismiss: (String) -> Unit) {
    Surface(color = KioskColors.ErrorContainer) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(max = 180.dp)) {
            Text(
                "Needs attention",
                style = MaterialTheme.typography.labelLarge,
                color = KioskColors.TextPrimary,
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
                                color = KioskColors.TextPrimary,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(entry.detail ?: "", style = MaterialTheme.typography.bodySmall, color = KioskColors.TextSecondary)
                        }
                        TextButton(onClick = { onDismiss(entry.key) }) { Text("Dismiss") }
                    }
                    HorizontalDivider(color = KioskColors.Border)
                }
            }
        }
    }
}

// ---- Idle (K1 resting) ---------------------------------------------------------------

@Composable
private fun IdleContent(
    clockedInCount: Int,
    onStartScanning: () -> Unit,
    onOpenManualEntry: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Surface(
            color = Color.Transparent,
            shape = RoundedCornerShape(28.dp),
            modifier = Modifier
                .size(180.dp)
                .clickable(onClick = onStartScanning),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(KioskColors.Surface, RoundedCornerShape(28.dp)),
                contentAlignment = Alignment.Center,
            ) {
                ScanTargetIcon(color = KioskColors.Teal, modifier = Modifier.size(100.dp))
            }
        }
        Spacer(Modifier.height(32.dp))
        BilingualText(
            en = "Show your badge",
            hi = "अपना बैज दिखाएँ",
            style = MaterialTheme.typography.headlineSmall,
            color = KioskColors.TextPrimary,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(16.dp))
        Text(
            "$clockedInCount clocked in today",
            style = MaterialTheme.typography.bodyLarge,
            color = KioskColors.TextSecondary,
        )
        Spacer(Modifier.height(32.dp))
        TextButton(onClick = onOpenManualEntry) {
            Text("Enter code manually", color = KioskColors.Teal)
        }
    }
}

@Composable
private fun ScanTargetIcon(color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val stroke = 6.dp.toPx()
        val corner = size.minDimension * 0.3f
        val inset = stroke / 2
        val w = size.width
        val h = size.height
        val cap = StrokeCap.Round
        drawLine(color, Offset(inset, inset + corner), Offset(inset, inset), stroke, cap)
        drawLine(color, Offset(inset, inset), Offset(inset + corner, inset), stroke, cap)
        drawLine(color, Offset(w - inset - corner, inset), Offset(w - inset, inset), stroke, cap)
        drawLine(color, Offset(w - inset, inset), Offset(w - inset, inset + corner), stroke, cap)
        drawLine(color, Offset(inset, h - inset - corner), Offset(inset, h - inset), stroke, cap)
        drawLine(color, Offset(inset, h - inset), Offset(inset + corner, h - inset), stroke, cap)
        drawLine(color, Offset(w - inset - corner, h - inset), Offset(w - inset, h - inset), stroke, cap)
        drawLine(color, Offset(w - inset, h - inset - corner), Offset(w - inset, h - inset), stroke, cap)
    }
}

// ---- Scanning -------------------------------------------------------------------------

@Composable
private fun ScanningContent(
    hasCameraPermission: Boolean,
    scanHint: String?,
    onQrScanned: (String) -> Unit,
    onCancel: () -> Unit,
    onOpenManualEntry: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize()) {
        if (hasCameraPermission) {
            QrScannerView(onCodeScanned = onQrScanned, modifier = Modifier.fillMaxSize())
            Box(modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.25f)))
        } else {
            Box(modifier = Modifier.fillMaxSize().background(KioskColors.Background))
        }

        Column(
            modifier = Modifier.fillMaxSize().padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Bottom,
        ) {
            if (!hasCameraPermission) {
                Text(
                    "Camera permission needed to scan badges.",
                    style = MaterialTheme.typography.titleMedium,
                    color = KioskColors.TextPrimary,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(24.dp))
            } else if (scanHint != null) {
                Surface(color = KioskColors.ErrorContainer, shape = MaterialTheme.shapes.medium) {
                    Text(
                        scanHint,
                        style = MaterialTheme.typography.bodyLarge,
                        color = KioskColors.TextPrimary,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
                    )
                }
                Spacer(Modifier.height(16.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(onClick = onCancel) { Text("Cancel") }
                Button(onClick = onOpenManualEntry) { Text("Enter code manually") }
            }
            Spacer(Modifier.height(24.dp))
        }
    }
}

// ---- Confirm card (K1) -----------------------------------------------------------------

@Composable
private fun ConfirmCardContent(
    employee: EmployeeEntity,
    kind: String,
    onConfirm: () -> Unit,
    onReject: () -> Unit,
) {
    Box(modifier = Modifier.fillMaxSize().padding(32.dp), contentAlignment = Alignment.Center) {
        Surface(color = KioskColors.Surface, shape = MaterialTheme.shapes.large, modifier = Modifier.widthIn(max = 560.dp)) {
            Column(modifier = Modifier.padding(28.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier.size(56.dp).background(KioskColors.SurfaceVariant, RoundedCornerShape(14.dp)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            employee.name.firstOrNull()?.uppercase() ?: "?",
                            style = MaterialTheme.typography.titleLarge,
                            color = KioskColors.TextSecondary,
                        )
                    }
                    Spacer(Modifier.width(16.dp))
                    Column {
                        Text(employee.name, style = MaterialTheme.typography.titleLarge, color = KioskColors.TextPrimary)
                        Text(
                            employee.badgeCode,
                            style = MaterialTheme.typography.bodyMedium,
                            color = KioskColors.TextSecondary,
                            fontFamily = KioskMono,
                        )
                    }
                }
                if (employee.shiftName != null) {
                    Spacer(Modifier.height(16.dp))
                    Surface(color = KioskColors.SurfaceVariant, shape = MaterialTheme.shapes.small) {
                        Text(
                            "${employee.shiftName} · ${employee.shiftStartTime}",
                            style = MaterialTheme.typography.labelLarge,
                            color = KioskColors.Teal,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        )
                    }
                }
                Spacer(Modifier.height(24.dp))
                val isIn = kind == "attendance.punch_in"
                Button(
                    onClick = onConfirm,
                    colors = ButtonDefaults.buttonColors(containerColor = KioskColors.Green, contentColor = KioskColors.GreenOn),
                    modifier = Modifier.fillMaxWidth().height(68.dp),
                ) {
                    Text(
                        if (isIn) "✓  Clock in" else "→  Clock out",
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = onReject, modifier = Modifier.fillMaxWidth().height(56.dp)) {
                    Text("Not this person")
                }
            }
        }
    }
}

// ---- Operator sign-in (K9) ---------------------------------------------------------------

/**
 * Gates the punch screen until a kiosk operator identifies themselves — their id then rides
 * along on every punch they process (`payload.operatorId`, optional server-side per D21) so
 * who ran the gate is on record. No badge match here counts as an actual punch.
 */
@Composable
private fun OperatorSignInScreen(
    operatorInput: String,
    match: EmployeeEntity?,
    onInputChange: (String) -> Unit,
    onConfirm: () -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    Surface(modifier = Modifier.fillMaxSize(), color = KioskColors.Background) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            BilingualText("Operator sign-in", "ऑपरेटर साइन-इन", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(8.dp))
            Text(
                "Enter your own code to start this shift on this tablet.",
                style = MaterialTheme.typography.bodyMedium,
                color = KioskColors.TextSecondary,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(24.dp))
            OutlinedTextField(
                value = operatorInput,
                onValueChange = onInputChange,
                singleLine = true,
                placeholder = { Text("Your employee code") },
                textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = KioskMono, textAlign = TextAlign.Center),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { if (match != null) onConfirm() }),
                modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
            )
            Spacer(Modifier.height(16.dp))
            if (match != null) {
                Text(match.name, style = MaterialTheme.typography.titleMedium, color = KioskColors.TextPrimary)
                Spacer(Modifier.height(16.dp))
            }
            Button(
                onClick = onConfirm,
                enabled = match != null,
                modifier = Modifier.fillMaxWidth().height(56.dp),
            ) {
                Text("Start shift")
            }
        }
    }
}

// ---- Manual keypad entry (K8) -----------------------------------------------------------

@Composable
private fun ManualEntryContent(
    badgeInput: String,
    match: EmployeeEntity?,
    onInputChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onCancel: () -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Enter employee code", style = MaterialTheme.typography.titleLarge, color = KioskColors.TextPrimary)
            TextButton(onClick = onCancel) { Text("Cancel") }
        }
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(
            value = badgeInput,
            onValueChange = onInputChange,
            singleLine = true,
            placeholder = { Text("Scan or type the code on the badge") },
            textStyle = MaterialTheme.typography.headlineSmall.copy(fontFamily = KioskMono, textAlign = TextAlign.Center),
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.Characters,
                imeAction = ImeAction.Done,
            ),
            keyboardActions = KeyboardActions(onDone = { if (match != null) onConfirm() }),
            modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
        )
        Spacer(Modifier.height(24.dp))
        if (match != null) {
            Surface(color = KioskColors.SurfaceVariant, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column {
                        Text(match.name, style = MaterialTheme.typography.bodyLarge, color = KioskColors.TextPrimary, fontWeight = FontWeight.Bold)
                        Text(
                            match.shiftName?.let { "$it · ${match.shiftStartTime}" } ?: "No shift today",
                            style = MaterialTheme.typography.bodySmall,
                            color = KioskColors.TextSecondary,
                        )
                    }
                    Surface(color = KioskColors.ManualTag, shape = MaterialTheme.shapes.small) {
                        Text(
                            "Manual",
                            style = MaterialTheme.typography.labelLarge,
                            color = KioskColors.Background,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        )
                    }
                }
            }
            Spacer(Modifier.height(16.dp))
        }
        Button(
            onClick = onConfirm,
            enabled = match != null,
            colors = ButtonDefaults.buttonColors(containerColor = KioskColors.Green, contentColor = KioskColors.GreenOn),
            modifier = Modifier.fillMaxWidth().height(64.dp),
        ) {
            Text("Confirm & punch in", style = MaterialTheme.typography.titleMedium)
        }
    }
}

// ---- Submission overlay -----------------------------------------------------------------

@Composable
private fun SubmissionOverlay(
    submission: PunchSubmission,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.55f))
            // A plain .background() draws over the screen behind it but does not intercept
            // touches — without this, a tap outside the centered card during e.g. InProgress
            // reaches IdleContent/ManualEntryContent underneath, letting a second punch start
            // while the first is still in flight and racing the shared submission state.
            .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {},
        contentAlignment = Alignment.Center,
    ) {
        Surface(
            color = KioskColors.Surface,
            shape = MaterialTheme.shapes.large,
            modifier = Modifier.widthIn(max = 520.dp).padding(24.dp),
        ) {
            Column(
                modifier = Modifier.padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                when (submission) {
                    PunchSubmission.InProgress -> {
                        CircularProgressIndicator(color = KioskColors.Teal)
                        Spacer(Modifier.height(16.dp))
                        Text("Checking…", style = MaterialTheme.typography.titleMedium, color = KioskColors.TextPrimary)
                    }
                    is PunchSubmission.Success -> {
                        Text("✓", style = MaterialTheme.typography.displayMedium, color = KioskColors.Green)
                        Spacer(Modifier.height(16.dp))
                        val directionLabel = if (submission.direction == "IN") "IN" else "OUT"
                        Text(
                            "${submission.employeeName} punched $directionLabel",
                            style = MaterialTheme.typography.headlineSmall,
                            textAlign = TextAlign.Center,
                            fontWeight = FontWeight.Bold,
                            color = KioskColors.TextPrimary,
                        )
                        if (submission.wasDuplicate) {
                            Spacer(Modifier.height(4.dp))
                            Text("(already recorded)", style = MaterialTheme.typography.bodyMedium, color = KioskColors.TextSecondary)
                        }
                    }
                    is PunchSubmission.NeedsAttention -> {
                        Text("⚠", style = MaterialTheme.typography.displayMedium, color = KioskColors.Amber)
                        Spacer(Modifier.height(16.dp))
                        Text(submission.employeeName, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, color = KioskColors.TextPrimary)
                        Spacer(Modifier.height(8.dp))
                        Text(submission.detail, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center, color = KioskColors.TextSecondary)
                        Spacer(Modifier.height(24.dp))
                        Button(onClick = onDismiss) { Text("OK") }
                    }
                    is PunchSubmission.Invalid -> {
                        Text("✕", style = MaterialTheme.typography.displayMedium, color = KioskColors.Error)
                        Spacer(Modifier.height(16.dp))
                        Text(submission.detail, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center, color = KioskColors.TextPrimary)
                        Spacer(Modifier.height(24.dp))
                        Button(onClick = onDismiss) { Text("OK") }
                    }
                    is PunchSubmission.RetryPrompt -> {
                        Text(submission.employeeName, style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center, color = KioskColors.TextPrimary)
                        Spacer(Modifier.height(8.dp))
                        Text(submission.detail, style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Center, color = KioskColors.TextSecondary)
                        Spacer(Modifier.height(16.dp))
                        Text(
                            "It'll stay queued and retry automatically even if you dismiss this.",
                            style = MaterialTheme.typography.bodySmall,
                            color = KioskColors.TextMuted,
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
