package com.example.mis_kiosk.data.network

import com.example.mis_kiosk.data.network.dto.ApiErrorDto
import com.example.mis_kiosk.data.network.dto.ClaimRequest
import com.example.mis_kiosk.data.network.dto.ClaimResponse
import com.example.mis_kiosk.data.network.dto.EnrolRequest
import com.example.mis_kiosk.data.network.dto.EnrolResponse
import com.example.mis_kiosk.data.network.dto.HealthReportDto
import com.example.mis_kiosk.data.network.dto.PullResponse
import com.example.mis_kiosk.data.network.dto.PunchRequest
import com.example.mis_kiosk.data.network.dto.PunchResponse
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * A thin, hand-written client for the kiosk device-lifecycle endpoints (HANDOVER.md §4).
 * Retrofit's kotlinx.serialization converter is published as a Kotlin/JVM artifact that
 * this toolchain's Kotlin compile classpath would not resolve; a handful of JSON POSTs
 * don't need Retrofit's reflection machinery to work around that.
 */
class KioskApi(
    baseUrl: String,
    private val client: OkHttpClient,
    private val json: Json,
) {
    private val baseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

    suspend fun enrol(body: EnrolRequest): ApiResult<EnrolResponse> =
        post("api/mis/kiosk/enrol", json.encodeToString(EnrolRequest.serializer(), body)) {
            json.decodeFromString(EnrolResponse.serializer(), it)
        }

    suspend fun claim(body: ClaimRequest): ApiResult<ClaimResponse> =
        post("api/mis/kiosk/enrol/claim", json.encodeToString(ClaimRequest.serializer(), body)) {
            json.decodeFromString(ClaimResponse.serializer(), it)
        }

    /**
     * Bearer-authenticated — HANDOVER.md §4.3. `pullForDevice` treats the whole request body
     * as the health report (`parseHealthReport(body)`, not `body.health`) — send [health]
     * directly with no wrapper.
     */
    suspend fun pull(token: String, health: HealthReportDto): ApiResult<PullResponse> =
        post("api/mis/kiosk/pull", json.encodeToString(HealthReportDto.serializer(), health), token = token) {
            json.decodeFromString(PullResponse.serializer(), it)
        }

    /**
     * Bearer-authenticated — HANDOVER.md §4.4. Unlike the other routes, a non-2xx status here
     * (503) is still a real, JSON-bodied outcome (`RETRY`), not an error envelope — 200 and 503
     * both decode as [PunchResponse] and get handed to the caller to branch on `outcome`.
     */
    suspend fun punch(token: String, body: PunchRequest): ApiResult<PunchResponse> =
        post(
            "api/mis/kiosk/punch",
            json.encodeToString(PunchRequest.serializer(), body),
            token = token,
            extraSuccessCodes = setOf(503),
        ) {
            json.decodeFromString(PunchResponse.serializer(), it)
        }

    /**
     * MIS V2 — GET a badge photo with the device token. `path` is what the pull returned
     * (`/api/mis/employees/<id>/photo?v=…`). Null on any failure: a missing face is never an error
     * worth failing a roster sync for.
     */
    suspend fun fetchPhoto(token: String, path: String): ByteArray? =
        withContext(Dispatchers.IO) {
            runCatching {
                val request = Request.Builder()
                    .url("$baseUrl${path.trimStart('/')}")
                    .header("Authorization", "Bearer $token")
                    .get()
                    .build()
                client.newCall(request).execute().use { response ->
                    if (response.isSuccessful) response.body?.bytes() else null
                }
            }.getOrNull()
        }

    private suspend fun <T> post(
        path: String,
        jsonBody: String,
        token: String? = null,
        extraSuccessCodes: Set<Int> = emptySet(),
        decode: (String) -> T,
    ): ApiResult<T> =
        withContext(Dispatchers.IO) {
            val request = Request.Builder()
                .url("$baseUrl$path")
                .apply { if (token != null) header("Authorization", "Bearer $token") }
                .post(jsonBody.toRequestBody(JSON_MEDIA_TYPE))
                .build()
            try {
                client.newCall(request).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    if (response.isSuccessful || response.code in extraSuccessCodes) {
                        val parsed = runCatching { decode(text) }.getOrNull()
                        if (parsed != null) ApiResult.Success(parsed) else ApiResult.MalformedResponse
                    } else {
                        val error = runCatching { json.decodeFromString(ApiErrorDto.serializer(), text) }.getOrNull()
                        ApiResult.HttpError(response.code, error)
                    }
                }
            } catch (e: IOException) {
                ApiResult.NetworkError
            }
        }

    private companion object {
        val JSON_MEDIA_TYPE = "application/json".toMediaType()
    }
}
