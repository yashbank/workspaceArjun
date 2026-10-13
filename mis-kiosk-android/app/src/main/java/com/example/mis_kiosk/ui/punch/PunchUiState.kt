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
        /** R3 B66: the server answered 401 - this tablet must be paired again. */
        val needsRepair: Boolean = false,
    ) : PunchUiState

    /** No cache, and the first sync failed — nothing usable to show at all. */
    data class Error(val message: String) : PunchUiState

    /** Server said `{"error":"REVOKED","wipe":true}` — screen should return to pairing. */
    data class Revoked(
        /** R3 B65: punches still queued after the wipe's one drain attempt (0 = nothing to say). */
        val unsent: Int = 0,
    ) : PunchUiState
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
    data class Confirming(
        val employee: EmployeeEntity,
        val kind: String,
        /** Why [kind] was pre-selected, when it is not the plain toggle (e.g. an assumed missed OUT). */
        val hint: String? = null,
    ) : PunchMode
}

/** The outcome of one submitted punch attempt, shown as an overlay on the entry screen. */
sealed interface PunchSubmission {
    data object InProgress : PunchSubmission
    data class Success(
        val employeeName: String,
        val direction: String,
        val wasDuplicate: Boolean,
        /** R3 B71: the server's `note` (ALREADY_IN / NO_OPEN_IN), shown under the result. */
        val note: String? = null,
    ) : PunchSubmission
    /** PARKED — needs a person's judgement; resending the same attempt will not help. */
    data class NeedsAttention(val employeeName: String, val detail: String) : PunchSubmission
    /** REJECTED, or the badge wasn't found in the local cache at all. */
    data class Invalid(val detail: String) : PunchSubmission
    /** 503 RETRY, or a network hiccup — resending this exact same attempt may succeed. */
    data class RetryPrompt(val employeeName: String, val detail: String) : PunchSubmission
}

/** R3 B71: operator-facing text for the punch result's `note`; null for none or an unknown code. */
fun punchNoteText(note: String?): String? = when (note) {
    "ALREADY_IN" -> "Already clocked IN (no change)"
    "NO_OPEN_IN" -> "OUT recorded without an IN today"
    else -> null
}

/** R3 B65: the message on the revoked screen when punches could not be sent before the wipe. */
fun unsentAfterWipeText(unsent: Int): String? =
    if (unsent <= 0) null else "$unsent punch${if (unsent == 1) "" else "es"} could not be sent from this tablet. Re-pair to send them."
