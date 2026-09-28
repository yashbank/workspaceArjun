package com.example.mis_kiosk

import android.app.Application
import android.net.ConnectivityManager
import android.net.Network
import com.example.mis_kiosk.data.work.PunchFlushScheduler

/**
 * Registers a process-wide network callback so a regained connection triggers an immediate
 * queue flush, rather than waiting on WorkManager's own (slightly looser) constraint polling.
 * WorkManager, scheduled here too, is the durable fallback that survives this process dying.
 */
class MISKioskApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        PunchFlushScheduler.schedule(this)

        val connectivityManager = getSystemService(ConnectivityManager::class.java)
        connectivityManager?.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                PunchFlushScheduler.schedule(applicationContext)
            }
        })
    }
}
