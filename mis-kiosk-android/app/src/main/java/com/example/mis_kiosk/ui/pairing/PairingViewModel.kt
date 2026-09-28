package com.example.mis_kiosk.ui.pairing

import android.app.Application
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.mis_kiosk.data.network.ApiClient
import com.example.mis_kiosk.data.network.ApiResult
import com.example.mis_kiosk.data.network.KioskApi
import com.example.mis_kiosk.data.network.dto.ApiErrorDto
import com.example.mis_kiosk.data.network.dto.ClaimRequest
import com.example.mis_kiosk.data.network.dto.EnrolRequest
import com.example.mis_kiosk.data.security.ActiveDevice
import com.example.mis_kiosk.data.security.DeviceCredentialStore
import com.example.mis_kiosk.data.security.PendingEnrolment
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

private const val POLL_INTERVAL_MS = 4000L
private const val HTTP_UNAUTHORIZED = 401

// @JvmOverloads: Compose's default viewModel() factory reflectively looks for a
// constructor taking only (Application); without this, Kotlin only emits the
// two-arg constructor and that lookup throws NoSuchMethodException at runtime.
class PairingViewModel @JvmOverloads constructor(
    application: Application,
    private val api: KioskApi = ApiClient.kioskApi,
) : AndroidViewModel(application) {

    private val store = DeviceCredentialStore(application)

    private val _uiState = MutableStateFlow<PairingUiState>(PairingUiState.RequestingCode)
    val uiState: StateFlow<PairingUiState> = _uiState.asStateFlow()

    private var pollJob: Job? = null

    init {
        val active = store.activeDevice
        val pending = store.pendingEnrolment
        when {
            active != null -> _uiState.value = PairingUiState.Paired(active.name)
            // App was killed mid-pairing: resume polling the same code rather than
            // burning another slot against TOO_MANY_PENDING.
            pending != null && pending.expiresAtMillis > System.currentTimeMillis() -> resumePolling(pending)
            else -> requestNewCode()
        }
    }

    fun requestNewCode() {
        pollJob?.cancel()
        store.clearPendingEnrolment()
        _uiState.value = PairingUiState.RequestingCode
        viewModelScope.launch {
            when (val result = api.enrol(EnrolRequest(hardwareLabel = hardwareLabel()))) {
                is ApiResult.Success -> {
                    val body = result.body
                    val expiresAtMillis = parseIsoInstantMillis(body.expiresAt)
                    if (expiresAtMillis == null) {
                        _uiState.value = PairingUiState.RequestFailed("The server sent back something unexpected. Try again.")
                        return@launch
                    }
                    val pending = PendingEnrolment(
                        deviceId = body.deviceId,
                        pollSecret = body.pollSecret,
                        code = body.code,
                        expiresAtMillis = expiresAtMillis,
                    )
                    store.savePendingEnrolment(pending)
                    resumePolling(pending)
                }
                is ApiResult.HttpError -> _uiState.value = PairingUiState.RequestFailed(requestFailureMessage(result.code, result.error))
                ApiResult.NetworkError -> _uiState.value =
                    PairingUiState.RequestFailed("Can't reach the server. Check the tablet's network connection and try again.")
                ApiResult.MalformedResponse -> _uiState.value =
                    PairingUiState.RequestFailed("The server sent back something unexpected. Try again.")
            }
        }
    }

    private fun resumePolling(pending: PendingEnrolment) {
        _uiState.value = PairingUiState.AwaitingApproval(pending.code, pending.expiresAtMillis)
        pollJob = viewModelScope.launch {
            pollLoop@ while (isActive) {
                delay(POLL_INTERVAL_MS)
                when (val result = api.claim(ClaimRequest(pending.deviceId, pending.pollSecret))) {
                    // A gate tablet loses wifi routinely; a hiccup is not a failure (HANDOVER.md §3.6).
                    ApiResult.NetworkError, ApiResult.MalformedResponse ->
                        _uiState.value = PairingUiState.AwaitingApproval(pending.code, pending.expiresAtMillis, reconnecting = true)

                    is ApiResult.HttpError -> {
                        // UNAUTHORIZED here means the pending record is gone server-side
                        // (e.g. swept as expired) — same practical outcome as EXPIRED.
                        if (result.code == HTTP_UNAUTHORIZED) {
                            store.clearPendingEnrolment()
                            _uiState.value = PairingUiState.NeedsNewCode("That code is no longer valid. Request a new one.")
                            break@pollLoop
                        }
                        // Anything else (5xx, a bad network proxy) is transient — keep polling.
                        _uiState.value = PairingUiState.AwaitingApproval(pending.code, pending.expiresAtMillis, reconnecting = true)
                    }

                    is ApiResult.Success -> when (result.body.status) {
                        "PENDING" -> _uiState.value = PairingUiState.AwaitingApproval(pending.code, pending.expiresAtMillis)
                        "ACTIVE" -> {
                            val token = result.body.token
                            if (token == null) {
                                _uiState.value = PairingUiState.RequestFailed("The server sent back something unexpected. Try again.")
                                break@pollLoop
                            }
                            val name = result.body.name ?: "This tablet"
                            store.saveActiveDevice(ActiveDevice(pending.deviceId, token, name))
                            store.clearPendingEnrolment()
                            _uiState.value = PairingUiState.Paired(name)
                            break@pollLoop
                        }
                        "EXPIRED" -> {
                            store.clearPendingEnrolment()
                            _uiState.value = PairingUiState.NeedsNewCode("That code expired. Request a new one.")
                            break@pollLoop
                        }
                        "REVOKED" -> {
                            store.clearPendingEnrolment()
                            _uiState.value = PairingUiState.NeedsNewCode("Pairing was declined for this tablet. Request a new code.")
                            break@pollLoop
                        }
                        "ALREADY_CLAIMED" -> {
                            store.clearPendingEnrolment()
                            _uiState.value = PairingUiState.NeedsNewCode("That code was already used. Request a new one.")
                            break@pollLoop
                        }
                        else -> // Unrecognised shape — keep polling rather than getting stuck.
                            _uiState.value = PairingUiState.AwaitingApproval(pending.code, pending.expiresAtMillis, reconnecting = true)
                    }
                }
            }
        }
    }

    private fun requestFailureMessage(httpStatus: Int, error: ApiErrorDto?): String =
        when (error?.error) {
            "TOO_MANY_PENDING" -> "Too many tablets are waiting to be paired right now. Try again in a few minutes."
            else -> error?.message ?: "Could not request a pairing code (HTTP $httpStatus). Try again."
        }

    override fun onCleared() {
        pollJob?.cancel()
        super.onCleared()
    }

    private fun hardwareLabel(): String =
        "${Build.MANUFACTURER} ${Build.MODEL}".trim().take(80)
}

private fun parseIsoInstantMillis(value: String): Long? =
    try {
        Instant.parse(value).toEpochMilli()
    } catch (e: DateTimeParseException) {
        null
    }
