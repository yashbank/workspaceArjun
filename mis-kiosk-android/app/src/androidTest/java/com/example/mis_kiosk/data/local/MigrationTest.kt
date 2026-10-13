package com.example.mis_kiosk.data.local

import androidx.room.testing.MigrationTestHelper
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * R3-AND B70: every Room hop on a tablet that may be holding unsent punches. Runs against the
 * exported schemas in `app/schemas` (wired as androidTest assets in build.gradle.kts).
 * Rule: any roster/queue version bump needs a Migration AND a hop added here.
 */
@RunWith(AndroidJUnit4::class)
class MigrationTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    @get:Rule
    val queueHelper = MigrationTestHelper(instrumentation, PunchQueueDatabase::class.java)

    @get:Rule
    val rosterHelper = MigrationTestHelper(instrumentation, RosterDatabase::class.java)

    // ---- punch queue --------------------------------------------------------------------------

    @Test
    fun queue_1_to_2_keepsUnsentRowsAndAddsNullOperator() {
        queueHelper.createDatabase("q12", 1).apply {
            execSQL(
                "INSERT INTO punch_queue (`key`, employeeId, employeeName, badgeCode, shiftId, kind, clientRecordedAt, queuedAtMillis, status, detail) " +
                    "VALUES ('k1', 'e1', 'Asha', 'B1', NULL, 'attendance.punch_in', '2026-10-12T10:00:00Z', 1, 'PENDING', NULL)",
            )
            close()
        }
        val db = queueHelper.runMigrationsAndValidate("q12", 2, true, PunchQueueDatabase.MIGRATION_1_2)
        db.query("SELECT `key`, status, operatorId FROM punch_queue").use {
            assertEquals(1, it.count)
            it.moveToFirst()
            assertEquals("PENDING", it.getString(1))
            assertNull(it.getString(2))
        }
    }

    @Test
    fun queue_2_to_3_keepsRowsWithZeroAttempts() {
        queueHelper.createDatabase("q23", 2).apply {
            execSQL(
                "INSERT INTO punch_queue (`key`, employeeId, employeeName, badgeCode, shiftId, kind, clientRecordedAt, queuedAtMillis, status, detail, operatorId) " +
                    "VALUES ('k1', 'e1', 'Asha', 'B1', 's1', 'attendance.punch_out', '2026-10-12T10:00:00Z', 1, 'PENDING', NULL, 'op1'), " +
                    "('k2', 'e2', 'Ravi', 'B2', NULL, 'attendance.punch_in', '2026-10-12T10:05:00Z', 2, 'PARKED', 'needs review', NULL)",
            )
            close()
        }
        val db = queueHelper.runMigrationsAndValidate("q23", 3, true, PunchQueueDatabase.MIGRATION_2_3)
        db.query("SELECT `key`, status, attempts, lastError, operatorId FROM punch_queue ORDER BY `key`").use {
            assertEquals(2, it.count)
            it.moveToFirst()
            assertEquals("k1", it.getString(0))
            assertEquals("PENDING", it.getString(1))
            assertEquals(0, it.getInt(2))
            assertNull(it.getString(3))
            assertEquals("op1", it.getString(4))
            it.moveToNext()
            assertEquals("PARKED", it.getString(1))
            assertEquals(0, it.getInt(2))
        }
    }

    @Test
    fun queue_1_to_3_wholeChain() {
        queueHelper.createDatabase("q13", 1).apply {
            execSQL(
                "INSERT INTO punch_queue (`key`, employeeId, employeeName, badgeCode, shiftId, kind, clientRecordedAt, queuedAtMillis, status, detail) " +
                    "VALUES ('k1', 'e1', 'Asha', 'B1', NULL, 'attendance.punch_in', '2026-10-12T10:00:00Z', 1, 'PENDING', NULL)",
            )
            close()
        }
        val db = queueHelper.runMigrationsAndValidate(
            "q13", 3, true, PunchQueueDatabase.MIGRATION_1_2, PunchQueueDatabase.MIGRATION_2_3,
        )
        db.query("SELECT COUNT(*) FROM punch_queue WHERE status = 'PENDING' AND attempts = 0").use {
            it.moveToFirst()
            assertEquals(1, it.getInt(0))
        }
    }

    // ---- roster -------------------------------------------------------------------------------

    private fun seedRosterV3(name: String) {
        rosterHelper.createDatabase(name, 3).apply {
            execSQL("INSERT INTO employees (id, name, badgeCode) VALUES ('e1', 'Asha', 'B1')")
            execSQL("INSERT INTO punch_state (employeeId, lastDirection, lastPunchedAtMillis) VALUES ('e1', 'IN', 1760000000000)")
            close()
        }
    }

    @Test
    fun roster_3_to_4_and_4_to_5_keepPunchState() {
        seedRosterV3("r345")
        val db = rosterHelper.runMigrationsAndValidate(
            "r345", 5, true, RosterDatabase.MIGRATION_3_4, RosterDatabase.MIGRATION_4_5,
        )
        db.query("SELECT lastDirection, lastPunchedAtMillis FROM punch_state WHERE employeeId = 'e1'").use {
            assertEquals(1, it.count)
            it.moveToFirst()
            assertEquals("IN", it.getString(0))
            assertEquals(1760000000000L, it.getLong(1))
        }
    }

    @Test
    fun roster_5_to_6_keepsPunchStateAndAddsNullWorkDate() {
        rosterHelper.createDatabase("r56", 5).apply {
            execSQL("INSERT INTO punch_state (employeeId, lastDirection, lastPunchedAtMillis) VALUES ('e1', 'IN', 1760000000000)")
            close()
        }
        val db = rosterHelper.runMigrationsAndValidate("r56", 6, true, RosterDatabase.MIGRATION_5_6)
        db.query("SELECT lastDirection, lastPunchedAtMillis, lastWorkDate FROM punch_state").use {
            assertEquals(1, it.count)
            it.moveToFirst()
            assertEquals("IN", it.getString(0))
            assertEquals(1760000000000L, it.getLong(1))
            assertNull(it.getString(2))
        }
    }

    @Test
    fun roster_3_to_6_wholeChain() {
        seedRosterV3("r36")
        val db = rosterHelper.runMigrationsAndValidate(
            "r36", 6, true,
            RosterDatabase.MIGRATION_3_4, RosterDatabase.MIGRATION_4_5, RosterDatabase.MIGRATION_5_6,
        )
        db.query("SELECT COUNT(*) FROM punch_state").use {
            it.moveToFirst()
            assertEquals(1, it.getInt(0))
        }
        db.query("SELECT COUNT(*) FROM employees WHERE operatorRole IS NULL").use {
            it.moveToFirst()
            assertEquals(1, it.getInt(0))
        }
    }
}
