package com.teswa.mobile.auth

import com.teswa.mobile.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.ConnectException
import java.net.HttpURLConnection
import java.net.NoRouteToHostException
import java.net.URL
import java.net.UnknownHostException

class OracleAuthClient(
    private val baseUrl: String = BuildConfig.TESWA_API_BASE_URL.trimEnd('/'),
) {
    suspend fun exchangeGoogleIdToken(idToken: String): AuthResult<AuthSession> = withContext(Dispatchers.IO) {
        val body = JSONObject().put("id_token", idToken)
        when (val response = requestWithConnectRetry("POST", "/v1/auth/google", body = body)) {
            is TransportResult.Failure -> AuthResult.Failure(
                AuthResult.Reason.NETWORK,
                "تعذر الوصول إلى خادم تِسوى بعد نجاح Google.",
                retryable = true,
            )
            is TransportResult.Response -> mapSessionResponse(response)
        }
    }

    suspend fun refresh(refreshToken: String): AuthResult<AuthSession> = withContext(Dispatchers.IO) {
        val body = JSONObject().put("refresh_token", refreshToken)
        when (val response = request("POST", "/v1/auth/refresh", body = body)) {
            is TransportResult.Failure -> AuthResult.Failure(
                AuthResult.Reason.NETWORK,
                "تعذر تجديد جلسة تِسوى.",
                retryable = true,
            )
            is TransportResult.Response -> mapSessionResponse(response)
        }
    }

    suspend fun validate(session: AuthSession): AuthResult<AuthSession> = withContext(Dispatchers.IO) {
        when (val response = request("GET", "/v1/auth/session", accessToken = session.accessToken)) {
            is TransportResult.Failure -> AuthResult.Failure(
                AuthResult.Reason.NETWORK,
                "تعذر التحقق من الجلسة الآن.",
                retryable = true,
            )
            is TransportResult.Response -> {
                when (response.status) {
                    200 -> {
                        val user = mapUser(response.body.optJSONObject("user"))
                            ?: return@withContext AuthResult.Failure(
                                AuthResult.Reason.INVALID_RESPONSE,
                                "استجابة الجلسة من الخادم غير صالحة.",
                            )
                        AuthResult.Success(session.copy(user = user))
                    }
                    401 -> AuthResult.Failure(
                        AuthResult.Reason.SESSION_EXPIRED,
                        "انتهت جلسة تِسوى.",
                    )
                    429 -> AuthResult.Failure(
                        AuthResult.Reason.RATE_LIMITED,
                        "محاولات كثيرة. جرّب بعد قليل.",
                        retryable = true,
                    )
                    else -> mapHttpFailure(response)
                }
            }
        }
    }

    suspend fun logout(accessToken: String) = withContext(Dispatchers.IO) {
        request("POST", "/v1/auth/logout", accessToken = accessToken)
        Unit
    }

    private suspend fun requestWithConnectRetry(
        method: String,
        path: String,
        body: JSONObject? = null,
        accessToken: String? = null,
    ): TransportResult {
        val first = request(method, path, body, accessToken)
        if (first !is TransportResult.Failure || !first.safeToRetry) return first
        delay(350)
        return request(method, path, body, accessToken)
    }

    private fun request(
        method: String,
        path: String,
        body: JSONObject? = null,
        accessToken: String? = null,
    ): TransportResult {
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
                requestMethod = method
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "TeswaNative/${BuildConfig.VERSION_NAME} Android")
                if (accessToken != null) setRequestProperty("Authorization", "Bearer $accessToken")
                if (body != null) {
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body.toString()) }
                }
            }

            val status = connection.responseCode
            val stream = if (status in 200..399) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val parsed = runCatching { if (raw.isBlank()) JSONObject() else JSONObject(raw) }.getOrElse { JSONObject() }
            TransportResult.Response(status, parsed)
        } catch (error: IOException) {
            TransportResult.Failure(
                error,
                safeToRetry = error is ConnectException || error is UnknownHostException || error is NoRouteToHostException,
            )
        } finally {
            connection?.disconnect()
        }
    }

    private fun mapSessionResponse(response: TransportResult.Response): AuthResult<AuthSession> {
        if (response.status !in 200..299) return mapHttpFailure(response)
        val session = mapSession(response.body)
            ?: return AuthResult.Failure(
                AuthResult.Reason.INVALID_RESPONSE,
                "الخادم أعاد جلسة غير صالحة.",
            )
        return AuthResult.Success(session)
    }

    private fun mapHttpFailure(response: TransportResult.Response): AuthResult.Failure {
        val error = response.body.optString("error", "unknown")
        return when {
            response.status == 401 && (error == "invalid_session" || error == "invalid_refresh_token") ->
                AuthResult.Failure(AuthResult.Reason.SESSION_EXPIRED, "انتهت جلسة تِسوى.")
            response.status == 429 ->
                AuthResult.Failure(AuthResult.Reason.RATE_LIMITED, "محاولات كثيرة. جرّب بعد قليل.", retryable = true)
            error == "invalid_google_token" || error == "identity_not_mapped" ->
                AuthResult.Failure(AuthResult.Reason.PROVIDER, "تعذر إكمال تسجيل الدخول بحساب Google.")
            response.status >= 500 ->
                AuthResult.Failure(AuthResult.Reason.NETWORK, "خدمة تسجيل الدخول غير متاحة مؤقتًا.", retryable = true)
            else ->
                AuthResult.Failure(AuthResult.Reason.UNKNOWN, "فشل تسجيل الدخول ($error).")
        }
    }

    private fun mapSession(body: JSONObject): AuthSession? {
        val accessToken = body.optString("access_token").takeIf { it.isNotBlank() } ?: return null
        val user = mapUser(body.optJSONObject("user")) ?: return null
        val expiresAt = if (body.has("expires_at") && !body.isNull("expires_at")) body.optLong("expires_at") else null
        return AuthSession(
            accessToken = accessToken,
            refreshToken = nullableString(body, "refresh_token"),
            expiresAtEpochSeconds = expiresAt,
            user = user,
        )
    }

    private fun mapUser(body: JSONObject?): AuthUser? {
        body ?: return null
        val id = body.optString("id").takeIf { it.isNotBlank() } ?: return null
        return AuthUser(
            id = id,
            email = nullableString(body, "email"),
            phone = nullableString(body, "phone"),
            displayName = nullableString(body, "display_name") ?: nullableString(body, "displayName"),
            avatarUrl = nullableString(body, "avatar_url") ?: nullableString(body, "avatarUrl"),
        )
    }

    private fun nullableString(body: JSONObject, key: String): String? {
        if (!body.has(key) || body.isNull(key)) return null
        return body.optString(key).takeIf { it.isNotBlank() }
    }

    private sealed interface TransportResult {
        data class Response(val status: Int, val body: JSONObject) : TransportResult
        data class Failure(val error: IOException, val safeToRetry: Boolean) : TransportResult
    }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 8_000
        const val READ_TIMEOUT_MS = 12_000
    }
}
