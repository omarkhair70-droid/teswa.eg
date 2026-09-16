package com.teswa.mobile.feature.direct

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

interface DirectRepository {
    suspend fun loadInbox(session: AuthSession): DirectResult<List<DirectConversation>>
    suspend fun loadMessages(session: AuthSession, conversationId: String): DirectResult<List<DirectMessage>>
    suspend fun send(session: AuthSession, conversation: DirectConversation, body: String): DirectResult<Unit>
    suspend fun act(session: AuthSession, conversationId: String, accept: Boolean): DirectResult<Unit>
    suspend fun markRead(session: AuthSession, conversationId: String): DirectResult<Unit>
}

class OracleDirectRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : DirectRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun loadInbox(session: AuthSession): DirectResult<List<DirectConversation>> = when (val result = executor.execute(session, OracleRequest(path = "/v1/direct/conversations"))) {
        is AuthenticatedOracleResult.Response -> when (result.value.status) {
            200 -> {
                val raw = result.value.body.optJSONArray("items") ?: return DirectResult.Failure("استجابة الرسائل المباشرة غير مكتملة.", result.session)
                val items = buildList { for (index in 0 until raw.length()) raw.optJSONObject(index)?.let(::conversation)?.let(::add) }
                DirectResult.Success(items, result.session)
            }
            401 -> expired(result.session)
            else -> DirectResult.Failure("تعذر تحميل الرسائل المباشرة (${result.value.status}).", result.session)
        }
        else -> result.failure("تعذر تحميل الرسائل المباشرة الآن.")
    }

    override suspend fun loadMessages(session: AuthSession, conversationId: String): DirectResult<List<DirectMessage>> {
        val id = conversationId.validId() ?: return DirectResult.Failure("معرّف المحادثة غير صالح.", session)
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/direct/conversations/$id/messages"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items") ?: return DirectResult.Failure("استجابة الرسائل غير مكتملة.", result.session)
                    val items = buildList { for (index in 0 until raw.length()) raw.optJSONObject(index)?.let(::message)?.let(::add) }
                    DirectResult.Success(items, result.session)
                }
                401 -> expired(result.session)
                else -> DirectResult.Failure("تعذر تحميل المحادثة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل المحادثة الآن.")
        }
    }

    override suspend fun send(session: AuthSession, conversation: DirectConversation, body: String): DirectResult<Unit> {
        val id = conversation.id.validId() ?: return DirectResult.Failure("معرّف المحادثة غير صالح.", session)
        val clean = body.trim()
        if (clean.isEmpty() || clean.length > 1_200) return DirectResult.Failure("الرسالة لازم تكون من 1 إلى 1200 حرف.", session)
        return when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, "/v1/direct/conversations/$id/messages", JSONObject().put("body", clean)))) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> {
                    val messageId = result.value.body.optString("messageId").validId()
                    if (messageId == null) DirectResult.Failure("استجابة إرسال الرسالة غير مكتملة.", result.session)
                    else DirectResult.Success(Unit, result.session)
                }
                result.value.status == 401 -> expired(result.session)
                result.value.status == 403 -> DirectResult.Failure("المحادثة غير متاحة بسبب الخصوصية أو الحظر.", result.session)
                else -> DirectResult.Failure("تعذر إرسال الرسالة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر إرسال الرسالة الآن.")
        }
    }

    override suspend fun act(session: AuthSession, conversationId: String, accept: Boolean): DirectResult<Unit> = emptyWrite(
        session, conversationId, if (accept) "accept" else "ignore", "تعذر تحديث طلب المراسلة.",
    )

    override suspend fun markRead(session: AuthSession, conversationId: String): DirectResult<Unit> = emptyWrite(
        session, conversationId, "read", "تعذر تحديث حالة القراءة.",
    )

    private suspend fun emptyWrite(session: AuthSession, conversationId: String, action: String, message: String): DirectResult<Unit> {
        val id = conversationId.validId() ?: return DirectResult.Failure("معرّف المحادثة غير صالح.", session)
        return when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, "/v1/direct/conversations/$id/$action", JSONObject()))) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> DirectResult.Success(Unit, result.session)
                result.value.status == 401 -> expired(result.session)
                else -> DirectResult.Failure(message, result.session)
            }
            else -> result.failure(message)
        }
    }

    private fun conversation(row: JSONObject): DirectConversation? {
        val id = row.optString("conversationId").validId() ?: return null
        val requestedBy = row.optString("requestedBy").validId() ?: return null
        val other = row.optString("otherUserId").validId() ?: return null
        val status = row.optString("status").takeIf { it in STATUSES } ?: return null
        return DirectConversation(id, status, requestedBy, other, nullable(row,"otherDisplayName"), nullable(row,"otherUsername"), nullable(row,"otherAvatarUrl"), nullable(row,"lastMessageBody"), nullable(row,"lastMessageAt"), row.optInt("unreadCount",0).coerceAtLeast(0), row.optBoolean("requiresAction"))
    }
    private fun message(row: JSONObject): DirectMessage? {
        val id = row.optString("id").validId() ?: return null
        val sender = row.optString("senderId").validId() ?: return null
        val created = row.optString("createdAt").trim().takeIf(String::isNotEmpty) ?: return null
        return DirectMessage(id, sender, row.optString("body"), row.optString("messageType","text"), created, nullable(row,"readAt"))
    }
    private fun AuthenticatedOracleResult.failure(message: String): DirectResult.Failure = when(this) {
        is AuthenticatedOracleResult.NetworkFailure -> DirectResult.Failure(message, session, network=true)
        is AuthenticatedOracleResult.InvalidResponse -> DirectResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> DirectResult.Failure(failure.message, unauthorized=failure.reason==AuthResult.Reason.SESSION_EXPIRED)
        is AuthenticatedOracleResult.Response -> error("handled")
    }
    private fun expired(session: AuthSession)=DirectResult.Failure("انتهت جلسة تِسوى.",session,unauthorized=true)
    private fun nullable(row:JSONObject,key:String)=if(!row.has(key)||row.isNull(key)) null else row.optString(key).trim().takeIf(String::isNotEmpty)
    private fun String.validId()=trim().takeIf(UUID::matches)
    private companion object { val UUID=Regex("^[0-9a-fA-F-]{36}$"); val STATUSES=setOf("requested","accepted","ignored","blocked") }
}
