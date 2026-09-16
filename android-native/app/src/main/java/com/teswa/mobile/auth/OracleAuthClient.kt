package com.teswa.mobile.auth

import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleResponse
import com.teswa.mobile.core.network.OracleTransport
import com.teswa.mobile.core.network.OracleTransportResult
import kotlinx.coroutines.delay
import org.json.JSONObject

class OracleAuthClient(
    private val transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) {
    suspend fun exchangeGoogleIdToken(idToken: String): AuthResult<AuthSession> {
        val body = JSONObject().put("id_token", idToken)
        return when (val response = requestWithConnectRetry(OracleHttpMethod.POST, "/v1/auth/google", body = body)) {
            is OracleTransportResult.NetworkFailure -> AuthResult.Failure(
                AuthResult.Reason.NETWORK,
                "تعذر الوصول إلى خادم تِسوى بعد نجاح Google.",
                retryable = true,
            )
            OracleTransportResult.InvalidResponse -> invalidResponse("استجابة تسجيل الدخول من الخادم غير صالحة.")
            is OracleTransportResult.Response -> mapSessionResponse(response.value)
        }
    }

    suspend fun refresh(refreshToken: String): AuthResult<AuthSession> {
        val body = JSONObject().put("refresh_token", refreshToken)
        return when (val response = request(OracleHttpMethod.POST, "/v1/auth/refresh", body = body)) {
            is OracleTransportResult.NetworkFailure -> AuthResult.Failure(
                AuthResult.Reason.NETWORK,
                "تعذر تجديد جلسة تِسوى.",
                retryable = true,
            )
            OracleTransportResult.InvalidResponse -> invalidResponse("استجابة تجديد الجلسة غير صالحة.")
            is OracleTransportResult.Response -> if (response.value.status == 401) {
                AuthResult.Failure(AuthResult.Reason.SESSION_EXPIRED, "انتهت جلسة تِسوى.")
            } else {
                mapSessionResponse(response.value)
            }
        }
    }

    suspend fun validate(session: AuthSession): AuthResult<AuthSession> {
        return when (val response = request(
            OracleHttpMethod.GET,
            "/v1/auth/session",
            accessToken = session.accessToken,
        )) {
            is OracleTransportResult.NetworkFailure -> AuthResult.Failure(
                AuthResult.Reason.NETWORK,
                "تعذر التحقق من الجلسة الآن.",
                retryable = true,
            )
            OracleTransportResult.InvalidResponse -> invalidResponse("استجابة التحقق من الجلسة غير صالحة.")
            is OracleTransportResult.Response -> {
                when (response.value.status) {
                    200 -> {
                        val user = mapUser(response.value.body.optJSONObject("user"))
                            ?: return AuthResult.Failure(
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
                    else -> mapHttpFailure(response.value)
                }
            }
        }
    }

    suspend fun logout(accessToken: String) {
        request(OracleHttpMethod.POST, "/v1/auth/logout", accessToken = accessToken)
    }

    private suspend fun requestWithConnectRetry(
        method: OracleHttpMethod,
        path: String,
        body: JSONObject? = null,
        accessToken: String? = null,
    ): OracleTransportResult {
        val first = request(method, path, body, accessToken)
        if (first !is OracleTransportResult.NetworkFailure || !first.safeToRetry) return first
        delay(350)
        return request(method, path, body, accessToken)
    }

    private suspend fun request(
        method: OracleHttpMethod,
        path: String,
        body: JSONObject? = null,
        accessToken: String? = null,
    ): OracleTransportResult {
        return transport.execute(
            OracleRequest(
                method = method,
                path = path,
                body = body,
                bearerToken = accessToken,
            ),
        )
    }

    private fun mapSessionResponse(response: OracleResponse): AuthResult<AuthSession> {
        if (response.status !in 200..299) return mapHttpFailure(response)
        val session = mapSession(response.body)
            ?: return AuthResult.Failure(
                AuthResult.Reason.INVALID_RESPONSE,
                "الخادم أعاد جلسة غير صالحة.",
            )
        return AuthResult.Success(session)
    }

    private fun mapHttpFailure(response: OracleResponse): AuthResult.Failure {
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

    private fun invalidResponse(message: String) = AuthResult.Failure(
        AuthResult.Reason.INVALID_RESPONSE,
        message,
    )

}
