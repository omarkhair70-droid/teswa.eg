package com.teswa.mobile.feature.notifications

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import org.json.JSONObject

data class NotificationDispatch(
    val targetUserId: String,
    val type: String,
    val title: String,
    val body: String? = null,
    val itemId: String? = null,
    val offerId: String? = null,
    val dealId: String? = null,
    val messageId: String? = null,
)

fun interface NotificationDispatcher {
    suspend fun dispatch(session: AuthSession, value: NotificationDispatch): AuthSession
}

class OracleNotificationDispatcher(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : NotificationDispatcher {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun dispatch(session: AuthSession, value: NotificationDispatch): AuthSession {
        if (!UUID_LIKE.matches(value.targetUserId) || value.type !in TYPES || value.title.isBlank()) return session
        val body = JSONObject()
            .put("targetUserId", value.targetUserId)
            .put("type", value.type)
            .put("title", value.title.trim().take(160))
            .putNullable("body", value.body?.trim()?.take(500))
            .putNullable("itemId", value.itemId)
            .putNullable("offerId", value.offerId)
            .putNullable("dealId", value.dealId)
            .putNullable("messageId", value.messageId)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/notifications/dispatch", body),
        )) {
            is AuthenticatedOracleResult.Response -> result.session
            is AuthenticatedOracleResult.NetworkFailure -> result.session ?: session
            is AuthenticatedOracleResult.InvalidResponse -> result.session ?: session
            is AuthenticatedOracleResult.SessionFailure -> session
        }
    }

    private fun JSONObject.putNullable(key: String, value: String?): JSONObject =
        put(key, value?.takeIf(String::isNotBlank) ?: JSONObject.NULL)

    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$")
        val TYPES = setOf(
            "offer_received", "offer_thinking", "offer_soft_rejected", "offer_accepted",
            "deal_created", "deal_message_received", "deal_voice_message_received",
            "deal_completed", "deal_completion_confirmation_needed",
        )
    }
}
