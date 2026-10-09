package com.example.mis_kiosk.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [EmployeeEntity::class, PunchStateEntity::class], version = 3, exportSchema = false)
abstract class RosterDatabase : RoomDatabase() {
    abstract fun employeeDao(): EmployeeDao
    abstract fun punchStateDao(): PunchStateDao

    companion object {
        @Volatile private var instance: RosterDatabase? = null

        fun getInstance(context: Context): RosterDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(context.applicationContext, RosterDatabase::class.java, "roster.db")
                    // The roster is a disposable cache re-fetched from /pull; a destructive
                    // migration just means one extra sync, never lost source-of-truth data.
                    .fallbackToDestructiveMigration(dropAllTables = true)
                    .build()
                    .also { instance = it }
            }
    }
}
