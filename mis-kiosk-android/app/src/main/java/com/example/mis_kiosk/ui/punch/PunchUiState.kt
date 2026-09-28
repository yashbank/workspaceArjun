package com.example.mis_kiosk.ui.punch

import com.example.mis_kiosk.data.local.EmployeeEntity

sealed interface PunchUiState {
    /** No cached roster yet and a sync is in flight — nothing to punch against. */
    data object Loading : PunchUiState

    data class Ready(
        val employeeCount: Int,
        val lastSyncedAtMillis: Long?,
        val syncing: Boolean,
        val syncError: String?,
        val queuedCount: Int,
        val clockedInCount: Int,
    ) : PunchUiState

    /** No cache, and the first sync failed — nothing usable to show at all. */
    data class Error(val message: String) : PunchUiState

    /** Server said `{"error":"REVOKED","wipe":true}` — screen should return to pairing. */
    data object Revoked : PunchUiState
}

/**
 * Where the operator currently is in the punch flow (K1 resting → scan → confirm, or the
 * K8 keypad fallback). Independent of [PunchUiState.Ready] — the roster status bar always
 * shows, this just drives what's below it.
 */
sealed interface PunchMode {
    data object Idle : PunchMode
    data object Scanning : PunchMode
    data object ManualEntry : PunchMode
    data class Confirming(val employee: EmployeeEntity, val kind: String) : PunchMode
}

/** The outcome of one submitted punch attempt, shown as an overlay on the entry screen. */
sealed interface PunchSubmission {
    data object InProgress : PunchSubmission
    data class Success(val employeeName: String, val direction: String, val wasDuplicate: Boolean) : PunchSubmission
    /** PARKED — needs a person's judgement; resending the same attempt will not help. */
    data class NeedsAttention(val employeeName: String, val detail: String) : PunchSubmission
    /** REJECTED, or the badge wasn't found in the local cache at all. */
    data class Invalid(val detail: String) : PunchSubmission
    /** 503 RETRY, or a network hiccup — resending this exact same attempt may succeed. */
    data class RetryPrompt(val employeeName: String, val detail: String) : PunchSubmission
}
