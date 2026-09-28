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
        OkHttpClient.Builder()
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}
