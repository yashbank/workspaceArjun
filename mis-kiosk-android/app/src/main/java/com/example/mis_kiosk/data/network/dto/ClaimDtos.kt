package com.example.mis_kiosk.data.network.dto

import kotlinx.serialization.Serializable

/** POST /api/mis/kiosk/enrol/claim — HANDOVER.md §4.2. No auth; proves itself with `pollSecret`. */
@Serializable
data class ClaimRequest(
    val deviceId: String,
    val pollSecret: String,
)

/**
 * The five `status` shapes share one wire type since only the fields present differ
 * per status (a real sealed hierarchy would need a custom polymorphic serializer for
 * no benefit here) — [com.example.mis_kiosk.data.network.dto.toClaimResult] does the
 * narrowing into a real sealed type for the rest of the app to consume.
 */
@Serializable
data class ClaimResponse(
    val status: String,
    val expiresAt: String? = null,
    val token: String? = null,
    val name: String? = null,
)
