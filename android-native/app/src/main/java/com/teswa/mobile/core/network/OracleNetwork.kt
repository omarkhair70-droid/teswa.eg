package com.teswa.mobile.core.network

import com.teswa.mobile.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.URL
import java.net.UnknownHostException

enum class OracleHttpMethod {
    GET,
    POST,
    DELETE,
}

data class OracleRequest(
    val method: OracleHttpMethod = OracleHttpMethod.GET,
    val path: String,
    val body: JSONObject? = null,
    val bearerToken: String? = null,
)

data class OracleResponse(
    val status: Int,
    val body: JSONObject,
)

enum class OracleNetworkFailureKind {
    OFFLINE,
    TIMEOUT,
    IO,
}

sealed interface OracleTransportResult {
    data class Response(val value: OracleResponse) : OracleTransportResult
    data class NetworkFailure(
        val kind: OracleNetworkFailureKind,
        val safeToRetry: Boolean,
    ) : OracleTransportResult
    data object InvalidResponse : OracleTransportResult
}

fun interface OracleTransport {
    suspend fun execute(request: OracleRequest): OracleTransportResult
}

class HttpUrlConnectionOracleTransport(
    private val baseUrl: String = BuildConfig.TESWA_API_BASE_URL.trimEnd('/'),
    private val connectTimeoutMs: Int = 8_000,
    private val readTimeoutMs: Int = 12_000,
) : OracleTransport {
    override suspend fun execute(request: OracleRequest): OracleTransportResult = withContext(Dispatchers.IO) {
        require(request.path.startsWith('/')) { "Oracle request paths must be absolute." }

        var connection: HttpURLConnection? = null
        try {
            connection = (URL(baseUrl + request.path).openConnection() as HttpURLConnection).apply {
                requestMethod = request.method.name
                connectTimeout = connectTimeoutMs
                readTimeout = readTimeoutMs
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "TeswaNative/${BuildConfig.VERSION_NAME} Android")
                request.bearerToken?.let { setRequestProperty("Authorization", "Bearer $it") }
                request.body?.let { json ->
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(json.toString()) }
                }
            }

            val status = connection.responseCode
            val stream = if (status in 200..399) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val body = if (raw.isBlank()) {
                JSONObject()
            } else {
                runCatching { JSONObject(raw) }.getOrNull()
                    ?: return@withContext OracleTransportResult.InvalidResponse
            }
            OracleTransportResult.Response(OracleResponse(status, body))
        } catch (error: IOException) {
            OracleTransportResult.NetworkFailure(
                kind = when (error) {
                    is ConnectException, is UnknownHostException, is NoRouteToHostException ->
                        OracleNetworkFailureKind.OFFLINE
                    is SocketTimeoutException -> OracleNetworkFailureKind.TIMEOUT
                    else -> OracleNetworkFailureKind.IO
                },
                safeToRetry = error is ConnectException ||
                    error is UnknownHostException ||
                    error is NoRouteToHostException,
            )
        } finally {
            connection?.disconnect()
        }
    }
}
