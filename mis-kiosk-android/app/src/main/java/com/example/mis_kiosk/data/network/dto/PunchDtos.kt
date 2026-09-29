package com.example.mis_kiosk.data.network.dto

import kotlinx.serialization.Serializable

/** The two `kind` values the punch endpoint accepts — HANDOVER.md §4.4. */
object PunchKind {
    const val IN = "attendance.punch_in"
    const val OUT = "attendance.punch_out"
}

@Serializable
data class PunchPayloadDto(
    val badgeCode: String,
    val shiftId: String? = null,
    /** The signed-in kiosk operator who processed this punch (K9). Optional server-side (D21) —
     *  never persisted in the offline queue, so a background-flushed retry sends it without one
     *  rather than block on Room migration for an optional accountability field. */
    val operatorId: String? = null,
)

/**
 * The queued-write envelope (`src/lib/mis/offline/idempotency.ts`). `key` must be a fresh
 * UUID per logical punch, reused only when retrying this exact same attempt — never across a
 * new scan, and never after a REJECTED response (that key is permanently poisoned server-side;
 * the fix is a new key, not a corrected resend). `health` here IS nested under this key, unlike
 * `/pull`'s body (see [KioskApi.pull]'s doc).
 */
@Serializable
data class PunchRequest(
    val key: String,
    val kind: String,
    val payload: PunchPayloadDto,
    val clientRecordedAt: String,
    val health: HealthReportDto? = null,
)

@Serializable
data class PunchResultDto(
    val punchId: String,
    val employeeId: String,
    val employeeName: String,
    val direction: String,
    val punchedAt: String,
    val workDate: String? = null,
    val dayRebuilt: Boolean = false,
    val dayHeld: String? = null,
)

/**
 * `outcome` is one of APPLIED / DUPLICATE / PARKED / REJECTED / RETRY. RETRY arrives over HTTP
 * 503, the other four over 200 — [KioskApi.punch] normalizes both into this same type so the
 * caller branches on `outcome`, not on HTTP status.
 */
@Serializable
data class PunchResponse(
    val outcome: String,
    val reason: String? = null,
    val detail: String? = null,
    val result: PunchResultDto? = null,
)
