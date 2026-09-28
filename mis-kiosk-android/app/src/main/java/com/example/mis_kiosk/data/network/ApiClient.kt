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
        // Measured live against this backend's actual Vercel deployment: a cold serverless
        // function can take 5-8s to respond, so an 8s timeout (the shipped web kiosk's number)
        // would spuriously fail a cold-start punch and push it to the offline queue for no
        // reason. 12s gives real cold starts headroom while still failing well short of
        // leaving someone standing at a turnstile indefinitely.
        OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .build()
    }
}
