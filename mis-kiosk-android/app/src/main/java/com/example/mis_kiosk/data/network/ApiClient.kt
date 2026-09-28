package com.example.mis_kiosk.data.network

import com.example.mis_kiosk.BuildConfig
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor

object ApiClient {

    val kioskApi: KioskApi by lazy {
        KioskApi(baseUrl = BuildConfig.API_BASE_URL, client = okHttpClient, json = json)
    }

    private val json: Json = Json { ignoreUnknownKeys = true }

    private val okHttpClient: OkHttpClient by lazy {
        // BASIC only: it never logs headers or bodies, so a device token or poll
        // secret can never end up in logcat even in a debug build (HANDOVER.md §6).
        val logging = HttpLoggingInterceptor().apply { level = HttpLoggingInterceptor.Level.BASIC }
        // 12s was set to cover a measured 5-8s Vercel cold start (US-East compute hitting a
        // Singapore DB). That's now fixed backend-side (region pinned to sin1 + Fluid Compute)
        // — /punch measures ~1s live. 6s keeps ~6x headroom over that while failing a genuine
        // outage much faster than 12s did, so the tablet falls back to the offline queue
        // promptly instead of leaving someone waiting at a turnstile.
        OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(6, TimeUnit.SECONDS)
            .build()
    }
}
