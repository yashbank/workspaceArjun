package com.example.mis_kiosk.ui.pairing

sealed interface PairingUiState {
    /** Requesting a fresh code from the server. */
    data object RequestingCode : PairingUiState

    /** A code is on screen; polling for an Admin to approve it in the web portal. */
    data class AwaitingApproval(
        val code: String,
        val expiresAtMillis: Long,
        val reconnecting: Boolean = false,
    ) : PairingUiState

    /** The code timed out, was declined, or was already used — the fix is always a fresh code. */
    data class NeedsNewCode(val message: String) : PairingUiState

    /** Could not even request a code (network down, server refused). */
    data class RequestFailed(val message: String) : PairingUiState

    /** Token collected and stored. */
    data class Paired(val deviceName: String) : PairingUiState
}
