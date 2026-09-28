package com.example.mis_kiosk.ui.health

import android.app.Application
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.StatFs
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.mis_kiosk.BuildConfig
import com.example.mis_kiosk.data.local.EmployeeDao
import com.example.mis_kiosk.data.local.PunchQueueDatabase
import com.example.mis_kiosk.data.local.RosterDatabase
import com.example.mis_kiosk.data.local.RosterPreferences
import com.example.mis_kiosk.data.work.PunchFlushScheduler
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DeviceHealthState(
    val online: Boolean = false,
    val queuedPunches: Int = 0,
    val employeeCacheCount: Int = 0,
    val employeeCacheAgeMillis: Long? = null,
    val batteryPercent: Int? = null,
    val isCharging: Boolean = false,
    val freeStorageGb: Double = 0.0,
    val appVersion: String = BuildConfig.VERSION_NAME,
)

class DeviceHealthViewModel(application: Application) : AndroidViewModel(application) {
    private val employeeDao: EmployeeDao = RosterDatabase.getInstance(application).employeeDao()
    private val punchQueueDao = PunchQueueDatabase.getInstance(application).punchQueueDao()
    private val rosterPreferences = RosterPreferences(application)

    private val _state = MutableStateFlow(DeviceHealthState())
    val state: StateFlow<DeviceHealthState> = _state.asStateFlow()

    init {
        refresh()
        // Cheap diagnostic screen, polled while open rather than wired into every DAO's Flow.
        viewModelScope.launch {
            while (true) {
                delay(3000)
                refresh()
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            val context = getApplication<Application>()
            val connectivityManager = context.getSystemService(ConnectivityManager::class.java)
            val capabilities = connectivityManager?.getNetworkCapabilities(connectivityManager.activeNetwork)
            val online = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true

            val batteryManager = context.getSystemService(BatteryManager::class.java)
            val batteryPercent = batteryManager?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)?.takeIf { it in 0..100 }
            val isCharging = batteryManager?.isCharging == true

            val statFs = StatFs(context.filesDir.path)
            val freeGb = (statFs.availableBytes.toDouble()) / (1024.0 * 1024.0 * 1024.0)

            _state.value = DeviceHealthState(
                online = online,
                queuedPunches = punchQueueDao.pendingCount(),
                employeeCacheCount = employeeDao.count(),
                employeeCacheAgeMillis = rosterPreferences.lastSyncedAtMillis,
                batteryPercent = batteryPercent,
                isCharging = isCharging,
                freeStorageGb = freeGb,
            )
        }
    }

    fun retrySyncNow() {
        PunchFlushScheduler.schedule(getApplication())
        refresh()
    }
}
