package com.example.mis_kiosk.ui.health

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.mis_kiosk.ui.queue.QueueScreen
import com.example.mis_kiosk.ui.shifts.ShiftsScreen
import com.example.mis_kiosk.ui.theme.KioskColors
import com.example.mis_kiosk.data.local.PunchQueueEntity
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.TimeUnit

@Composable
fun DeviceHealthScreen(
    viewModel: DeviceHealthViewModel = viewModel(),
    onClose: () -> Unit,
    onEndShift: (() -> Unit)? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var showShifts by remember { mutableStateOf(false) }
    var showQueue by remember { mutableStateOf(false) }

    if (showShifts) {
        ShiftsScreen(onClose = { showShifts = false })
        return
    }

    if (showQueue) {
        QueueScreen(onClose = { showQueue = false })
        return
    }

    Surface(modifier = Modifier.fillMaxSize(), color = KioskColors.Background) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row {
                    Text(
                        text = if (state.online) "●" else "●",
                        color = if (state.online) KioskColors.StatusOnline else KioskColors.StatusOffline,
                    )
                    Text(
                        "  ${if (state.online) "Online" else "Offline"} · ${state.queuedPunches} punches queued",
                        style = MaterialTheme.typography.bodyMedium,
                        color = KioskColors.TextSecondary,
                    )
                }
                TextButton(onClick = onClose) { Text("Close", color = KioskColors.Teal) }
            }
            HorizontalDivider(color = KioskColors.Border)

            Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp)) {
                Text("Device status", style = MaterialTheme.typography.headlineSmall, color = KioskColors.TextPrimary)
                Spacer(Modifier.height(20.dp))

                Surface(color = KioskColors.SurfaceVariant, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(horizontal = 20.dp)) {
                        HealthRow(
                            "Connection",
                            if (state.online) "Online" else "Offline",
                            valueColor = if (state.online) KioskColors.TextPrimary else KioskColors.Amber,
                        )
                        HorizontalDivider(color = KioskColors.Border)
                        HealthRow(
                            "Queued punches",
                            if (state.queuedPunches == 0) "0 — none lost" else "${state.queuedPunches} — none lost",
                            valueColor = if (state.queuedPunches == 0) KioskColors.TextPrimary else KioskColors.Amber,
                        )
                        HorizontalDivider(color = KioskColors.Border)
                        HealthRow(
                            "Employee cache",
                            "${formatCacheAge(state.employeeCacheAgeMillis)} · ${state.employeeCacheCount} people",
                            valueColor = cacheAgeColor(state.employeeCacheAgeMillis),
                        )
                        HorizontalDivider(color = KioskColors.Border)
                        val batteryPercent = state.batteryPercent
                        HealthRow(
                            "Battery",
                            "${batteryPercent ?: "—"}% · ${if (state.isCharging) "charging" else "not charging"}",
                            valueColor = if (batteryPercent != null && batteryPercent < 20 && !state.isCharging) KioskColors.Amber else KioskColors.TextPrimary,
                        )
                        HorizontalDivider(color = KioskColors.Border)
                        HealthRow("Storage", "%.1f GB free".format(state.freeStorageGb))
                        HorizontalDivider(color = KioskColors.Border)
                        HealthRow("App version", state.appVersion)
                    }
                }

                if (state.needsRepair) {
                    Spacer(Modifier.height(20.dp))
                    Surface(color = KioskColors.ErrorContainer, shape = MaterialTheme.shapes.medium) {
                        Text(
                            "This tablet must be paired again (HTTP 401). Queued punches are kept and will send after re-pairing.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = KioskColors.Error,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                }

                if (state.stuck.isNotEmpty()) {
                    Spacer(Modifier.height(20.dp))
                    Text(
                        "Stuck punches (${state.stuck.size})",
                        style = MaterialTheme.typography.titleMedium,
                        color = KioskColors.Amber,
                    )
                    Spacer(Modifier.height(8.dp))
                    state.stuck.forEach { row ->
                        StuckRow(row, state.zone, onRetry = { viewModel.retryStuck(row.key) })
                        HorizontalDivider(color = KioskColors.Border)
                    }
                }

                val lowBattery = state.batteryPercent
                if (lowBattery != null && lowBattery < 40 && !state.isCharging) {
                    Spacer(Modifier.height(20.dp))
                    Surface(color = KioskColors.AmberContainer, shape = MaterialTheme.shapes.medium) {
                        Text(
                            "Not charging. At $lowBattery% and no power, this device stops before the shift ends. Plug it in.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = KioskColors.Amber,
                            modifier = Modifier.padding(16.dp),
                        )
                    }
                }

                Spacer(Modifier.height(32.dp))
                Button(
                    onClick = viewModel::retrySyncNow,
                    enabled = !state.syncing,
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                ) {
                    Text(if (state.syncing) "Syncing…" else "Retry sync now")
                }
                state.syncMessage?.let { message ->
                    Spacer(Modifier.height(8.dp))
                    Text(
                        message,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (state.syncFailed) KioskColors.Amber else KioskColors.TextSecondary,
                    )
                }

                Spacer(Modifier.height(16.dp))
                // Read-only roster-cache rollup; no shift editing lives on this tablet.
                OutlinedButton(onClick = { showShifts = true }, modifier = Modifier.fillMaxWidth().height(56.dp)) {
                    Text("View shifts", color = KioskColors.TextPrimary)
                }

                Spacer(Modifier.height(16.dp))
                // K2 — offline sync queue; read-only, same local-nav pattern as "View shifts".
                OutlinedButton(onClick = { showQueue = true }, modifier = Modifier.fillMaxWidth().height(56.dp)) {
                    Text("View queue", color = KioskColors.TextPrimary)
                }

                if (onEndShift != null) {
                    Spacer(Modifier.height(16.dp))
                    // K11 — hands the tablet to the next operator; they must sign in fresh.
                    OutlinedButton(onClick = onEndShift, modifier = Modifier.fillMaxWidth().height(56.dp)) {
                        Text("End shift / hand over", color = KioskColors.TextPrimary)
                    }
                }
            }
        }
    }
}

/** R3 B66: one STUCK punch - who, when it was tapped, why it is stuck, and a Retry. */
@Composable
private fun StuckRow(row: PunchQueueEntity, zone: ZoneId, onRetry: () -> Unit) {
    val whenText = runCatching {
        Instant.parse(row.clientRecordedAt).atZone(zone).format(DateTimeFormatter.ofPattern("d MMM HH:mm", Locale.ENGLISH))
    }.getOrDefault(row.clientRecordedAt)
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "${row.employeeName} · ${if (row.kind.endsWith("in")) "IN" else "OUT"} · $whenText",
                style = MaterialTheme.typography.bodyMedium,
                color = KioskColors.TextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                row.lastError ?: "Could not be sent",
                style = MaterialTheme.typography.bodySmall,
                color = KioskColors.TextSecondary,
            )
        }
        OutlinedButton(onClick = onRetry) { Text("Retry", color = KioskColors.TextPrimary) }
    }
}

@Composable
private fun HealthRow(label: String, value: String, valueColor: Color = KioskColors.TextPrimary) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = KioskColors.TextSecondary)
        Text(value, style = MaterialTheme.typography.bodyMedium, color = valueColor, fontWeight = FontWeight.SemiBold)
    }
}

/** Bands from docs/DECISIONS.md — employee-list cache: green ≤24h, amber ≤72h, red beyond. */
private fun cacheAgeColor(ageMillis: Long?): Color {
    if (ageMillis == null) return KioskColors.Error
    val hours = TimeUnit.MILLISECONDS.toHours(System.currentTimeMillis() - ageMillis)
    return when {
        hours <= 24 -> KioskColors.TextPrimary
        hours <= 72 -> KioskColors.Amber
        else -> KioskColors.Error
    }
}

private fun formatCacheAge(ageMillis: Long?): String {
    if (ageMillis == null) return "never synced"
    val hours = TimeUnit.MILLISECONDS.toHours(System.currentTimeMillis() - ageMillis)
    return when {
        hours < 1 -> "just synced"
        hours < 24 -> "$hours h old"
        else -> "${hours / 24} days old"
    }
}
