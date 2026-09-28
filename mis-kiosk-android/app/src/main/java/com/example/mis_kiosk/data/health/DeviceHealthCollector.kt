package com.example.mis_kiosk.data.health

import android.content.Context
import android.os.BatteryManager
import com.example.mis_kiosk.BuildConfig
import com.example.mis_kiosk.data.network.dto.HealthReportDto

/**
 * Builds the optional health object sent on pull/punch calls (HANDOVER.md §3.5). Bad or
 * unsupported readings are just left out rather than sent as -1/garbage — the server drops
 * anything outside its own bounds anyway, so there's no point guessing here.
 */
fun collectHealthReport(context: Context, queuedPunches: Int = 0): HealthReportDto {
    val batteryManager = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
    val batteryPercent = batteryManager
        ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        ?.takeIf { it in 0..100 }
    val isCharging = batteryManager?.isCharging

    return HealthReportDto(
        appVersion = BuildConfig.VERSION_NAME,
        batteryPercent = batteryPercent,
        isCharging = isCharging,
        queuedPunches = queuedPunches,
    )
}
