package com.example.mis_kiosk.data.network.dto

import kotlinx.serialization.Serializable

/** The error body shape every kiosk route returns on failure — HANDOVER.md §4.5. */
@Serializable
data class ApiErrorDto(
    val error: String? = null,
    val message: String? = null,
    val wipe: Boolean? = null,
)
