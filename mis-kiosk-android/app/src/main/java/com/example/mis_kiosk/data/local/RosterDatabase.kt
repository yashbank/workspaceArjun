package com.example.mis_kiosk.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [EmployeeEntity::class, PunchStateEntity::class, ActiveShiftEntity::class],
    version = 5,
    exportSchema = false,
)
abstract class RosterDatabase : RoomDatabase() {
    abstract fun employeeDao(): EmployeeDao
    abstract fun punchStateDao(): PunchStateDao
    abstract fun activeShiftDao(): ActiveShiftDao

    companion object {
        /** Keeps punch_state (each employee's last IN/OUT) alive across the 3 -> 5 upgrade. */
        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE employees ADD COLUMN operatorRole TEXT")
            }
        }

        val MIGRATION_4_5 = object : Migration(4, 5) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `active_shifts` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, " +
                        "`startTime` TEXT NOT NULL, `endTime` TEXT NOT NULL, PRIMARY KEY(`id`))",
                )
            }
        }

        @Volatile private var instance: RosterDatabase? = null

        fun getInstance(context: Context): RosterDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, RosterDatabase::class.java, "roster.db")
                    .addMigrations(MIGRATION_3_4, MIGRATION_4_5)
                    // Last resort only (versions older than 3). It also wipes punch_state, so every
                    // future version bump needs a real Migration above.
                    .fallbackToDestructiveMigration(dropAllTables = true)
                    .build()
                    .also { instance = it }
            }
    }
}
