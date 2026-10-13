package com.example.mis_kiosk.data.repository

import com.example.mis_kiosk.data.local.PunchQueueStatus
import com.example.mis_kiosk.data.time.ShiftWindow
import java.time.Instant
import java.time.ZoneId
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** R3-AND B65-B68, B71: the queue/flush/wipe rules, against a real KioskApi on a scripted fake server. */
class PunchQueueFlushTest {
    private val queue = FakePunchQueueDao()
    private val state = FakePunchStateDao()
    private var needsRepair = false

    private fun repo(
        server: FakeServer,
        shifts: List<ShiftWindow> = emptyList(),
        zone: ZoneId = ZoneId.of("Asia/Kolkata"),
        wipeCalls: MutableList<String>? = null,
    ) = PunchRepository(
        api = server.api,
        punchStateDao = state,
        punchQueueDao = queue,
        deviceProvider = { TEST_DEVICE },
        zoneProvider = { zone },
        shiftsProvider = { shifts },
        onNeedsRepair = { needsRepair = true },
        onRevoked = { wipeCalls?.add("revoked-wipe") },
    )

    // ---- B66 no head-of-line blocking ------------------------------------------------------

    @Test
    fun badRowDoesNotBlockTheOneBehindIt() = runBlocking {
        queue.rows += queued("A", "2026-10-12T10:00:00Z")
        queue.rows += queued("B", "2026-10-12T10:05:00Z", employeeId = "e2")
        val server = FakeServer { key, _ -> if (key == "A") Replies.error(400, "bad badge") else Replies.applied() }

        val stop = repo(server).flushQueue()

        assertEquals(FlushStop.DRAINED, stop)
        assertEquals(PunchQueueStatus.STUCK, queue.row("A")!!.status)
        assertEquals("bad badge", queue.row("A")!!.lastError)
        assertNull("B was applied and left the queue", queue.row("B"))
        assertEquals(listOf("A", "B"), server.sentKeys)
    }

    @Test
    fun http404And413AlsoParkTheRow() = runBlocking {
        queue.rows += queued("A", "2026-10-12T10:00:00Z")
        queue.rows += queued("B", "2026-10-12T10:01:00Z")
        queue.rows += queued("C", "2026-10-12T10:02:00Z")
        val server = FakeServer { key, _ ->
            when (key) {
                "A" -> Replies.error(404)
                "B" -> Replies.error(413) // body is {"error":"PAYLOAD_TOO_LARGE"} in production; message absent here
                else -> Replies.applied()
            }
        }
        repo(server).flushQueue()
        assertEquals(PunchQueueStatus.STUCK, queue.row("A")!!.status)
        assertEquals(PunchQueueStatus.STUCK, queue.row("B")!!.status)
        assertEquals("Punch too large", queue.row("B")!!.lastError) // B71
        assertNull(queue.row("C"))
    }

    @Test
    fun serverErrorIsStuckOnlyAfterTheTenthFlush() = runBlocking {
        queue.rows += queued("A", "2026-10-12T10:00:00Z")
        val server = FakeServer { _, _ -> Replies.error(500) }
        val repo = repo(server)

        repeat(9) { n ->
            assertEquals(FlushStop.RETRY_NEEDED, repo.flushQueue())
            assertEquals(PunchQueueStatus.PENDING, queue.row("A")!!.status)
            assertEquals(n + 1, queue.row("A")!!.attempts)
        }
        assertEquals(FlushStop.DRAINED, repo.flushQueue()) // the 10th: parked, so nothing blocks
        assertEquals(PunchQueueStatus.STUCK, queue.row("A")!!.status)
        assertEquals(10, queue.row("A")!!.attempts)
        assertEquals(10, server.sentKeys.size)
    }

    @Test
    fun networkFailureCountsLikeA5xx() = runBlocking {
        queue.rows += queued("A", "2026-10-12T10:00:00Z")
        val server = FakeServer { _, _ -> Reply.Io }
        assertEquals(FlushStop.RETRY_NEEDED, repo(server).flushQueue())
        assertEquals(1, queue.row("A")!!.attempts)
        assertEquals(PunchQueueStatus.PENDING, queue.row("A")!!.status)
    }

    @Test
    fun http401StopsTheFlushRaisesTheBannerAndMarksNothing() = runBlocking {
        queue.rows += queued("A", "2026-10-12T10:00:00Z")
        queue.rows += queued("B", "2026-10-12T10:05:00Z")
        val server = FakeServer { _, _ -> Replies.error(401, "bad token") }

        val stop = repo(server).flushQueue()

        assertEquals(FlushStop.NEEDS_REPAIR, stop)
        assertTrue(needsRepair)
        assertEquals(listOf("A"), server.sentKeys) // stopped at the first row
        assertTrue(queue.rows.none { it.status == PunchQueueStatus.STUCK })
        assertEquals(0, queue.row("A")!!.attempts) // 401 never counts toward attempts
        assertEquals(PunchQueueStatus.PENDING, queue.row("A")!!.status)
    }

    @Test
    fun retryOnAStuckRowResetsAttemptsAndPutsItBackInTheQueue() = runBlocking {
        queue.rows += queued("A", "2026-10-12T10:00:00Z").copy(status = PunchQueueStatus.STUCK, attempts = 10, lastError = "boom")
        repo(FakeServer { _, _ -> Replies.applied() }).retryStuck("A")
        val row = queue.row("A")!!
        assertEquals(PunchQueueStatus.PENDING, row.status)
        assertEquals(0, row.attempts)
        assertNull(row.lastError)
    }

    @Test
    fun immediateAttemptThatCanNeverSucceedIsReportedStuckNotRetried() = runBlocking {
        val server = FakeServer { _, _ -> Replies.error(413) }
        val result = repo(server).enqueueAndAttempt("e1", "Asha", "B1", null, "attendance.punch_in", "K1", "2026-10-12T10:00:00Z")
        assertTrue(result is PunchAttemptResult.Stuck)
        assertEquals("Punch too large", (result as PunchAttemptResult.Stuck).detail)
    }

    // ---- B67 / B68 / B71 on APPLIED --------------------------------------------------------

    @Test
    fun appliedPunchRecordsTheTapTimeNotTheFlushTime() = runBlocking {
        // Recorded at 23:00 IST on the 11th (17:30Z), flushed "at 07:00 the next morning" - i.e. now.
        val tap = "2026-10-11T17:30:00Z"
        queue.rows += queued("A", tap)
        repo(FakeServer { _, _ -> Replies.applied(workDate = "2026-10-11") }).flushQueue()

        val saved = state.states["e1"]!!
        assertEquals(Instant.parse(tap).toEpochMilli(), saved.lastPunchedAtMillis)
        assertTrue("must not be the flush time", saved.lastPunchedAtMillis < System.currentTimeMillis() - 60_000)
    }

    @Test
    fun serverWorkDateIsStoredAndBeatsTheLocalGuess() = runBlocking {
        queue.rows += queued("A", "2026-10-12T16:40:00Z")
        repo(FakeServer { _, _ -> Replies.applied(workDate = "2026-10-09") }).flushQueue()
        assertEquals("2026-10-09", state.states["e1"]!!.lastWorkDate)
    }

    @Test
    fun missingServerWorkDateFallsBackToTheLocalPort() = runBlocking {
        // 22:10 IST on the 12th = 16:40Z; a night shift 22:00-06:00 -> work date the 12th.
        val night = listOf(ShiftWindow("n", "22:00", "06:00"), ShiftWindow("d", "06:00", "22:00"))
        queue.rows += queued("A", "2026-10-12T16:40:00Z")
        repo(FakeServer { _, _ -> Replies.applied() }, shifts = night).flushQueue()
        assertEquals("2026-10-12", state.states["e1"]!!.lastWorkDate)
    }

    @Test
    fun serverNoteReachesTheResult() = runBlocking {
        val result = repo(FakeServer { _, _ -> Replies.applied(note = "ALREADY_IN") })
            .enqueueAndAttempt("e1", "Asha", "B1", null, "attendance.punch_in", "K1", "2026-10-12T10:00:00Z")
        assertEquals("ALREADY_IN", (result as PunchAttemptResult.Applied).result.note)
    }

    // ---- B65 drain before wipe -------------------------------------------------------------

    @Test
    fun wipeDrainsThreePendingPunchesFirstWhenTheApiAccepts() = runBlocking {
        listOf("A", "B", "C").forEachIndexed { i, k -> queue.rows += queued(k, "2026-10-12T10:0$i:00Z", employeeId = "e$i") }
        val events = mutableListOf<String>()
        val server = FakeServer { key, _ -> events += "send:$key"; Replies.applied() }
        val repo = repo(server)

        drainThenWipe(drain = { repo.flushQueue(allowWipe = false) }, wipe = { events += "clear-credentials" })

        assertEquals(0, queue.pendingCount())
        assertEquals(listOf("send:A", "send:B", "send:C", "clear-credentials"), events)
        assertEquals(setOf("Bearer tok-123"), server.tokens.toSet()) // the still-valid token was used
    }

    @Test
    fun wipeStillCompletesWhenTheApiFailsAndTheRowsStayQueued() = runBlocking {
        listOf("A", "B", "C").forEachIndexed { i, k -> queue.rows += queued(k, "2026-10-12T10:0$i:00Z", employeeId = "e$i") }
        var wiped = false
        val repo = repo(FakeServer { _, _ -> Reply.Io })

        drainThenWipe(drain = { repo.flushQueue(allowWipe = false) }, wipe = { wiped = true })

        assertTrue(wiped)
        assertEquals(3, queue.pendingCount())
    }

    @Test
    fun aHangingDrainIsCutOffAtTheTimeoutAndTheWipeStillRuns() = runBlocking {
        var wiped = false
        drainThenWipe(drain = { delay(60_000) }, wipe = { wiped = true }, timeoutMs = 50)
        assertTrue(wiped)
    }

    @Test
    fun aThrowingDrainDoesNotStopTheWipe() = runBlocking {
        var wiped = false
        drainThenWipe(drain = { error("boom") }, wipe = { wiped = true })
        assertTrue(wiped)
    }

    @Test
    fun theDrainInsideTheWipeNeverStartsASecondWipe() = runBlocking {
        queue.rows += queued("A", "2026-10-12T10:00:00Z")
        val calls = mutableListOf<String>()
        val repo = repo(FakeServer { _, _ -> Replies.error(401, wipe = true) }, wipeCalls = calls)

        val stop = repo.flushQueue(allowWipe = false)

        assertEquals(FlushStop.REVOKED, stop)
        assertTrue("no recursive wipe from inside the drain", calls.isEmpty())
        assertNotNull(queue.row("A")) // left queued
        assertFalse(needsRepair)
    }

    @Test
    fun anOrdinaryRevokedReplyStillWipes() = runBlocking {
        queue.rows += queued("A", "2026-10-12T10:00:00Z")
        val calls = mutableListOf<String>()
        val repo = repo(FakeServer { _, _ -> Replies.error(401, wipe = true) }, wipeCalls = calls)
        repo.flushQueue()
        assertEquals(listOf("revoked-wipe"), calls)
    }
}
