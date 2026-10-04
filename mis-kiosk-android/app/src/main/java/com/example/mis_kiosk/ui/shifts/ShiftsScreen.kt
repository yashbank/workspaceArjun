package com.example.mis_kiosk.ui.shifts

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
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.mis_kiosk.data.local.ShiftSummary
import com.example.mis_kiosk.ui.common.BilingualText
import com.example.mis_kiosk.ui.theme.KioskColors

/**
 * Read-only — this is a factory-floor punch tablet, not an admin tool. Lists the distinct
 * shifts currently present in the local roster cache with how many cached employees sit on
 * each. Creating/editing shifts belongs in the web admin portal, out of scope here.
 */
@Composable
fun ShiftsScreen(
    viewModel: ShiftsViewModel = viewModel(),
    onClose: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Surface(modifier = Modifier.fillMaxSize(), color = KioskColors.Background) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 14.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                BilingualText(
                    en = "Shifts",
                    hi = "शिफ्ट",
                    style = MaterialTheme.typography.headlineSmall,
                    color = KioskColors.TextPrimary,
                )
                TextButton(onClick = onClose) { Text("Close", color = KioskColors.Teal) }
            }
            HorizontalDivider(color = KioskColors.Border)

            if (state.shifts.isEmpty() && !state.loading) {
                Column(modifier = Modifier.fillMaxWidth().padding(24.dp)) {
                    Text(
                        "No shifts in the local cache yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = KioskColors.TextSecondary,
                    )
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp, vertical = 16.dp)) {
                    items(state.shifts, key = { it.shiftId }) { shift ->
                        ShiftRow(shift)
                        HorizontalDivider(color = KioskColors.Border)
                    }
                }
            }
        }
    }
}

@Composable
private fun ShiftRow(shift: ShiftSummary) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(
                shift.shiftName ?: shift.shiftId,
                style = MaterialTheme.typography.bodyLarge,
                color = KioskColors.TextPrimary,
                fontWeight = FontWeight.SemiBold,
            )
            Spacer(Modifier.height(4.dp))
            Text(
                "${shift.shiftStartTime ?: "—"} – ${shift.shiftEndTime ?: "—"}",
                style = MaterialTheme.typography.bodyMedium,
                color = KioskColors.TextSecondary,
            )
        }
        Text(
            "${shift.employeeCount} ${if (shift.employeeCount == 1) "person" else "people"}",
            style = MaterialTheme.typography.bodyMedium,
            color = KioskColors.TextPrimary,
        )
    }
}
