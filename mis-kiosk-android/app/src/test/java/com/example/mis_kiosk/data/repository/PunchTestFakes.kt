package com.example.mis_kiosk.data.repository

import com.example.mis_kiosk.data.local.PunchQueueDao
import com.example.mis_kiosk.data.local.PunchQueueEntity
import com.example.mis_kiosk.data.local.PunchQueueStatus
import com.example.mis_kiosk.data.local.PunchStateDao
import com.example.mis_kiosk.data.local.PunchStateEntity
import com.example.mis_kiosk.data.network.KioskApi
import com.example.mis_kiosk.data.security.ActiveDevice
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.serialization.json.Json
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody
import okio.Buffer

/** In-memory [PunchQueueDao]: just enough SQL semantics for the flush logic. */
class FakePunchQueueDao : PunchQueueDao {
    val rows = mutableListOf<PunchQueueEntity>()

    fun row(key: String) = rows.firstOrNull { it.key == key }
    private fun update(key: String, change: (PunchQueueEntity) -> PunchQueueEntity) {
        val i = rows.indexOfFirst { it.key == key }
        if (i >= 0) rows[i] = change(rows[i])
    }

    override suspend fun insert(entry: PunchQueueEntity) {
        rows.add(entry)
    }

    override suspend fun pendingOrdered() =
        rows.filter { it.status == PunchQueueStatus.PENDING }.sortedWith(compareBy({ it.clientRecordedAt }, { it.queuedAtMillis }))

    override fun observeNeedsAttention(): Flow<List<PunchQueueEntity>> = flowOf(rows.filter { it.status != PunchQueueStatus.PENDING })
    override fun observeAllOrdered(): Flow<List<PunchQueueEntity>> = flowOf(rows.toList())
    override fun observePendingCount(): Flow<Int> = flowOf(rows.count { it.status == PunchQueueStatus.PENDING })
    override suspend fun pendingCount() = rows.count { it.status == PunchQueueStatus.PENDING }
    override suspend fun mostRecentPendingKind(employeeId: String) =
        rows.filter { it.employeeId == employeeId && it.status == PunchQueueStatus.PENDING }.maxByOrNull { it.clientRecordedAt }?.kind

    override suspend fun updateStatus(key: String, status: String, detail: String?) = update(key) { it.copy(status = status, detail = detail) }
    override suspend fun attemptsOf(key: String) = row(key)?.attempts
    override suspend fun recordFailure(key: String, attempts: Int, error: String?) = update(key) { it.copy(attempts = attempts, lastError = error) }
    override suspend fun markStuck(key: String, attempts: Int, error: String?) =
        update(key) { it.copy(status = PunchQueueStatus.STUCK, attempts = attempts, lastError = error, detail = error) }

    override suspend fun stuckOrdered() = rows.filter { it.status == PunchQueueStatus.STUCK }.sortedBy { it.clientRecordedAt }
    override suspend fun retryStuck(key: String) {
        if (row(key)?.status == PunchQueueStatus.STUCK) {
            update(key) { it.copy(status = PunchQueueStatus.PENDING, attempts = 0, lastError = null, detail = null) }
        }
    }

    override suspend fun delete(key: String) {
        rows.removeAll { it.key == key }
    }
}

class FakePunchStateDao : PunchStateDao {
    val states = mutableMapOf<String, PunchStateEntity>()
    override suspend fun lastDirection(employeeId: String) = states[employeeId]?.lastDirection
    override fun observeClockedInCount(factoryDayStart: Long): Flow<Int> = flowOf(0)
    override suspend fun deleteAll() = states.clear()
    override suspend fun find(employeeId: String) = states[employeeId]
    override suspend fun record(state: PunchStateEntity) {
        states[state.employeeId] = state
    }
}

/** What the fake server answers for one punch request. */
sealed interface Reply {
    /** HTTP [code] with a JSON [body]. */
    data class Http(val code: Int, val body: String) : Reply
    /** A dropped connection / timeout. */
    data object Io : Reply
}

object Replies {
    fun applied(direction: String = "IN", workDate: String? = null, note: String? = null): Reply.Http {
        val extra = (workDate?.let { ",\"workDate\":\"$it\"" } ?: "") + (note?.let { ",\"note\":\"$it\"" } ?: "")
        return Reply.Http(
            200,
            """{"outcome":"APPLIED","result":{"punchId":"p1","employeeId":"e1","employeeName":"Asha","direction":"$direction","punchedAt":"2026-10-12T16:40:00Z"$extra}}""",
        )
    }
    fun error(code: Int, message: String? = null, wipe: Boolean = false): Reply.Http {
        val parts = listOfNotNull(message?.let { "\"message\":\"$it\"" }, if (wipe) "\"wipe\":true" else null)
        return Reply.Http(code, "{" + parts.joinToString(",") + "}")
    }
}

/** A real [KioskApi] whose OkHttp client never touches the network: [script] decides each reply. */
class FakeServer(private val script: (key: String, call: Int) -> Reply) {
    val sentKeys = mutableListOf<String>()
    val tokens = mutableListOf<String?>()

    val api: KioskApi = KioskApi(
        baseUrl = "http://kiosk.test/",
        client = OkHttpClient.Builder().addInterceptor(Interceptor { chain ->
            val request = chain.request()
            val text = Buffer().also { request.body?.writeTo(it) }.readUtf8()
            val key = Regex("\"key\":\"([^\"]+)\"").find(text)?.groupValues?.get(1) ?: "?"
            sentKeys += key
            tokens += request.header("Authorization")
            val reply = script(key, sentKeys.count { it == key })
            when (reply) {
                Reply.Io -> throw IOException("simulated outage")
                is Reply.Http -> Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(reply.code)
                    .message("test")
                    .body(reply.body.toResponseBody("application/json".toMediaType()))
                    .build()
            }
        }).build(),
        json = Json { ignoreUnknownKeys = true },
    )
}

fun queued(key: String, at: String, employeeId: String = "e1", kind: String = "attendance.punch_in") = PunchQueueEntity(
    key = key,
    employeeId = employeeId,
    employeeName = "Asha",
    badgeCode = "B1",
    shiftId = null,
    kind = kind,
    clientRecordedAt = at,
    queuedAtMillis = 0L,
    status = PunchQueueStatus.PENDING,
)

val TEST_DEVICE = ActiveDevice("dev1", "tok-123", "Gate 1")
