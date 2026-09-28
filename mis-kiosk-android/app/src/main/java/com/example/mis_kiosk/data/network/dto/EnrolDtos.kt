package com.example.mis_kiosk.data.network.dto

import kotlinx.serialization.Serializable

/** POST /api/mis/kiosk/enrol — HANDOVER.md §4.1. No auth; the tablet has nothing yet. */
@Serializable
data class EnrolRequest(
    val hardwareLabel: String? = null,
)

@Serializable
data class EnrolResponse(
    val deviceId: String,
    val code: String,
    val pollSecret: String,
    val expiresAt: String,
)
