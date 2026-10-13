package com.example.mis_kiosk.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [EmployeeEntity::class, PunchStateEntity::class, ActiveShiftEntity::class],
    version = 6,
    exportSchema = true,
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

        /** R3 B68: the factory work date of each employee's last punch (nullable, additive). */
        val MIGRATION_5_6 = object : Migration(5, 6) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("ALTER TABLE punch_state ADD COLUMN lastWorkDate TEXT")
            }
        }

        @Volatile private var instance: RosterDatabase? = null

        fun getInstance(context: Context): RosterDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, RosterDatabase::class.java, "roster.db")
                    .addMigrations(MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6)
                    // Last resort only for versions older than 3 (they predate every Migration above).
                    // Any roster version bump needs a Migration + test. A destructive fallback also
                    // wipes punch_state, so it must never apply to a version we can migrate.
                    .fallbackToDestructiveMigrationFrom(true, 1, 2)
                    .build()
                    .also { instance = it }
            }
    }
}
