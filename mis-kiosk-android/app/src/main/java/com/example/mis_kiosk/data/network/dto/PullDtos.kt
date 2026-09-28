package com.example.mis_kiosk.data.network.dto

import kotlinx.serialization.Serializable

/**
 * POST /api/mis/kiosk/pull — HANDOVER.md §4.3. Bearer-authenticated. `pullForDevice` calls
 * `parseHealthReport(body)` on the raw request body itself (not `body.health`), so — unlike
 * punch, which nests health under a "health" key — the health fields here ARE the whole body;
 * send [HealthReportDto] directly as the pull request, with no wrapper object.
 */

/** Matches `parseHealthReport` in kiosk-device.ts exactly — bad values are just dropped server-side. */
@Serializable
data class HealthReportDto(
    val appVersion: String? = null,
    val batteryPercent: Int? = null,
    val isCharging: Boolean? = null,
    val queuedPunches: Int? = null,
)

@Serializable
data class PullDeviceDto(
    val id: String,
    val name: String,
)

@Serializable
data class ShiftDto(
    val id: String,
    val name: String,
    val startTime: String,
    val endTime: String,
)

/** `PULL_EMPLOYEE_KEYS` on the server: exactly id, name, badgeCode, shift — nothing else, ever. */
@Serializable
data class EmployeeDto(
    val id: String,
    val name: String,
    val badgeCode: String,
    val shift: ShiftDto? = null,
)

@Serializable
data class PullResponse(
    val device: PullDeviceDto,
    val pulledAt: String,
    val employees: List<EmployeeDto>,
)
