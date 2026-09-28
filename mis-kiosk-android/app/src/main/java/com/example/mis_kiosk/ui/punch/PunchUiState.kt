package com.example.mis_kiosk.ui.punch

sealed interface PunchUiState {
    /** No cached roster yet and a sync is in flight — nothing to punch against. */
    data object Loading : PunchUiState

    data class Ready(
        val employeeCount: Int,
        val lastSyncedAtMillis: Long?,
        val syncing: Boolean,
        val syncError: String?,
        val queuedCount: Int,
    ) : PunchUiState

    /** No cache, and the first sync failed — nothing usable to show at all. */
    data class Error(val message: String) : PunchUiState

    /** Server said `{"error":"REVOKED","wipe":true}` — screen should return to pairing. */
    data object Revoked : PunchUiState
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
