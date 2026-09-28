package com.example.mis_kiosk.data.network

import com.example.mis_kiosk.data.network.dto.ApiErrorDto

sealed interface ApiResult<out T> {
    data class Success<T>(val body: T) : ApiResult<T>
    data class HttpError(val code: Int, val error: ApiErrorDto?) : ApiResult<Nothing>
    data object NetworkError : ApiResult<Nothing>
    data object MalformedResponse : ApiResult<Nothing>
}
