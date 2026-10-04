package com.example.mis_kiosk.ui.queue

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.mis_kiosk.data.local.PunchQueueEntity
import com.example.mis_kiosk.data.local.PunchQueueStatus
import com.example.mis_kiosk.ui.common.BilingualText
import com.example.mis_kiosk.ui.theme.KioskColors
import java.util.concurrent.TimeUnit

/**
 * K2 — offline sync queue. Read-only list of every punch sitting in the local queue
 * (PENDING, PARKED, REJECTED) — not just the subset that [com.example.mis_kiosk.ui.punch.PunchScreen]
 * surfaces inline as "needs attention". Nothing here can be dismissed or retried; this
 * tablet's queue-mutation path stays entirely in the punch flow.
 */
@Composable
fun QueueScreen(
    viewModel: QueueViewModel = viewModel(),
    onClose: () -> Unit,
) {
    val entries by viewModel.entries.collectAsStateWithLifecycle()

    Surface(modifier = Modifier.fillMaxSize(), color = KioskColors.Background) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                BilingualText(
                    en = "Offline queue",
                    hi = "ऑफ़लाइन कतार",
                    style = MaterialTheme.typography.headlineSmall,
                    color = KioskColors.TextPrimary,
                )
                TextButton(onClick = onClose) { Text("Close", color = KioskColors.Teal) }
            }
            HorizontalDivider(color = KioskColors.Border)

            if (entries.isEmpty()) {
                Column(modifier = Modifier.fillMaxWidth().padding(24.dp)) {
                    Text(
                        "Queue is empty — nothing waiting to sync.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = KioskColors.TextSecondary,
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 16.dp)) {
                    items(entries, key = { it.key }) { entry ->
                        QueueRow(entry)
                        HorizontalDivider(color = KioskColors.Border)
                    }
                }
            }
        }
    }
}

@Composable
private fun QueueRow(entry: PunchQueueEntity) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "${entry.employeeName} — ${entry.kind}",
                style = MaterialTheme.typography.bodyLarge,
                color = KioskColors.TextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                formatElapsed(entry.queuedAtMillis),
                style = MaterialTheme.typography.bodyMedium,
                color = KioskColors.TextSecondary,
            )
        }
        Text(
            statusLabel(entry.status),
            style = MaterialTheme.typography.bodyMedium,
            color = statusColor(entry.status),
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun statusLabel(status: String): String = when (status) {
    PunchQueueStatus.PENDING -> "Pending"
    PunchQueueStatus.PARKED -> "Parked"
    PunchQueueStatus.REJECTED -> "Rejected"
    else -> status
}

private fun statusColor(status: String): Color = when (status) {
    PunchQueueStatus.PENDING -> KioskColors.TextSecondary
    PunchQueueStatus.PARKED -> KioskColors.Amber
    PunchQueueStatus.REJECTED -> KioskColors.Error
    else -> KioskColors.TextSecondary
}

/** "how long ago queued" — same band style as [com.example.mis_kiosk.ui.health.formatCacheAge]. */
private fun formatElapsed(queuedAtMillis: Long): String {
    val minutes = TimeUnit.MILLISECONDS.toMinutes(System.currentTimeMillis() - queuedAtMillis)
    return when {
        minutes < 1 -> "just now"
        minutes < 60 -> "$minutes min ago"
        minutes < 24 * 60 -> "${minutes / 60} h ago"
        else -> "${minutes / (24 * 60)} days ago"
    }
}
