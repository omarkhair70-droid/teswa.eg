package com.teswa.mobile.feature.notifications

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import org.json.JSONObject

interface NotificationsRepository {
    suspend fun load(session: AuthSession, limit: Int = 50): NotificationsResult<List<AppNotification>>
    suspend fun markRead(session: AuthSession, notificationId: String): NotificationsResult<Unit>
    suspend fun markAllRead(session: AuthSession): NotificationsResult<Unit>
}

class OracleNotificationsRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : NotificationsRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun load(session: AuthSession, limit: Int): NotificationsResult<List<AppNotification>> {
        val safeLimit = limit.coerceIn(1, 100)
        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/notifications?limit=$safeLimit"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return NotificationsResult.Failure("استجابة الإشعارات غير مكتملة.", result.session)
                    val items = buildList {
                        for (index in 0 until raw.length()) raw.optJSONObject(index)?.let(::parse)?.let(::add)
                    }
                    NotificationsResult.Success(items, result.session)
                }
                401 -> expired(result.session)
                else -> NotificationsResult.Failure("تعذر تحميل الإشعارات (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل الإشعارات الآن.")
        }
    }

    override suspend fun markRead(session: AuthSession, notificationId: String): NotificationsResult<Unit> {
        val id = notificationId.takeIf(UUID_LIKE::matches)
            ?: return NotificationsResult.Failure("معرّف الإشعار غير صالح.", session)
        return write(
            session,
            "/v1/notifications/read",
            JSONObject().put("userId", session.user.id).put("notificationId", id),
        )
    }

    override suspend fun markAllRead(session: AuthSession): NotificationsResult<Unit> = write(
        session,
        "/v1/notifications/read-all",
        JSONObject().put("userId", session.user.id),
    )

    private suspend fun write(session: AuthSession, path: String, body: JSONObject): NotificationsResult<Unit> =
        when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, path, body))) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") ->
                    NotificationsResult.Success(Unit, result.session)
                result.value.status == 401 -> expired(result.session)
                result.value.status == 404 -> NotificationsResult.Failure("الإشعار مش موجود.", result.session)
                else -> NotificationsResult.Failure("تعذر تحديث الإشعار (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحديث الإشعار الآن.")
        }

    private fun parse(body: JSONObject): AppNotification? {
        val id = body.optString("id").takeIf(UUID_LIKE::matches) ?: return null
        val title = body.optString("title").trim().takeIf(String::isNotEmpty) ?: return null
        val type = body.optString("type").trim().takeIf(String::isNotEmpty) ?: return null
        val createdAt = body.optString("createdAt").trim().takeIf(String::isNotEmpty) ?: return null
        return AppNotification(
            id, type, title, nullable(body, "body"), nullable(body, "route"),
            nullableUuid(body, "actorUserId"), nullableUuid(body, "itemId"),
            nullableUuid(body, "offerId"), nullableUuid(body, "dealId"),
            nullableUuid(body, "conversationId"), nullable(body, "readAt"), createdAt,
        )
    }

    private fun nullable(body: JSONObject, key: String): String? =
        if (!body.has(key) || body.isNull(key)) null else body.optString(key).trim().takeIf(String::isNotEmpty)
    private fun nullableUuid(body: JSONObject, key: String): String? = nullable(body, key)?.takeIf(UUID_LIKE::matches)

    private fun AuthenticatedOracleResult.toFailure(message: String): NotificationsResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> NotificationsResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> NotificationsResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> NotificationsResult.Failure(
            failure.message,
            network = failure.reason == AuthResult.Reason.NETWORK,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses must be handled by the caller.")
    }

    private fun expired(session: AuthSession) =
        NotificationsResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private companion object { val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$") }
}
