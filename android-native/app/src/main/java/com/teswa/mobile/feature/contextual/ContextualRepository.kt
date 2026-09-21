package com.teswa.mobile.feature.contextual

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
import com.teswa.mobile.feature.voice.VoiceDraft
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult

interface ContextualRepository {
    suspend fun loadInbox(session: AuthSession): ContextualResult<List<ContextualConversation>>
    suspend fun loadThread(session: AuthSession, conversationId: String): ContextualResult<ContextualThread>
    suspend fun sendText(session: AuthSession, conversationId: String, body: String): ContextualResult<ContextualMessage>
    suspend fun sendVoice(session: AuthSession, conversationId: String, draft: VoiceDraft, onProgress: (Int) -> Unit = {}): ContextualResult<ContextualMessage> =
        ContextualResult.Failure("الرسائل الصوتية غير متاحة الآن.", session)
    suspend fun markRead(session: AuthSession, conversationId: String): ContextualResult<Unit>
}

class OracleContextualRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val voiceMediaRepository: VoiceMediaRepository? = null,
) : ContextualRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun loadInbox(session: AuthSession): ContextualResult<List<ContextualConversation>> =
        when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/contextual/conversations?userId=${session.user.id}"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return ContextualResult.Failure("استجابة ردود القصص غير مكتملة.", result.session)
                    val values = buildList {
                        for (index in 0 until raw.length()) raw.optJSONObject(index)?.let(::parseSummary)?.let(::add)
                    }
                    ContextualResult.Success(values, result.session)
                }
                401 -> expired(result.session)
                else -> ContextualResult.Failure("تعذر تحميل ردود القصص (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل ردود القصص الآن.")
        }

    override suspend fun loadThread(session: AuthSession, conversationId: String): ContextualResult<ContextualThread> {
        val id = conversationId.validId() ?: return ContextualResult.Failure("معرّف المحادثة غير صالح.", session)
        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/contextual/conversations/$id"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val item = result.value.body.optJSONObject("item")
                        ?: return ContextualResult.Failure("المحادثة غير موجودة أو غير متاحة.", result.session)
                    parseThread(item)?.let { ContextualResult.Success(it, result.session) }
                        ?: ContextualResult.Failure("استجابة المحادثة غير مكتملة.", result.session)
                }
                401 -> expired(result.session)
                403, 404 -> ContextualResult.Failure("المحادثة غير موجودة أو غير متاحة.", result.session)
                else -> ContextualResult.Failure("تعذر تحميل المحادثة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل المحادثة الآن.")
        }
    }

    override suspend fun sendText(
        session: AuthSession,
        conversationId: String,
        body: String,
    ): ContextualResult<ContextualMessage> {
        val id = conversationId.validId() ?: return ContextualResult.Failure("معرّف المحادثة غير صالح.", session)
        val clean = body.trim()
        if (clean.isEmpty() || clean.length > 1_200) return ContextualResult.Failure("الرسالة لازم تكون من 1 إلى 1200 حرف.", session)
        val response = executor.execute(
            session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/contextual/conversations/$id/messages",
                JSONObject().put("senderId", session.user.id).put("body", clean),
            ),
        )
        if (response !is AuthenticatedOracleResult.Response) return response.failure("تعذر إرسال الرد الآن.")
        if (response.value.status == 401) return expired(response.session)
        if (response.value.status != 201) return ContextualResult.Failure("تعذر إرسال الرد (${response.value.status}).", response.session)
        val message = parseMessage(response.value.body)
            ?: return ContextualResult.Failure("استجابة إرسال الرد غير مكتملة.", response.session)

        // Notification creation is intentionally best-effort after the durable message insert.
        val notification = executor.execute(
            response.session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/contextual/notifications",
                JSONObject().put("conversationId", id).put("messageId", message.id).put("kind", "thread_message"),
            ),
        )
        val updatedSession = when (notification) {
            is AuthenticatedOracleResult.Response -> notification.session
            is AuthenticatedOracleResult.NetworkFailure -> notification.session ?: response.session
            is AuthenticatedOracleResult.InvalidResponse -> notification.session ?: response.session
            is AuthenticatedOracleResult.SessionFailure -> response.session
        }
        return ContextualResult.Success(message, updatedSession)
    }

    override suspend fun sendVoice(
        session: AuthSession,
        conversationId: String,
        draft: VoiceDraft,
        onProgress: (Int) -> Unit,
    ): ContextualResult<ContextualMessage> {
        val id = conversationId.validId() ?: return ContextualResult.Failure("معرّف المحادثة غير صالح.", session)
        val media = voiceMediaRepository ?: return ContextualResult.Failure("الرسائل الصوتية غير متاحة الآن.", session)
        val uploaded = media.upload(session, "contextual_voice", "contextual/$id/${session.user.id}", draft, onProgress)
        if (uploaded is VoiceMediaResult.Failure) {
            return ContextualResult.Failure(uploaded.message, uploaded.session, uploaded.unauthorized, uploaded.network)
        }
        uploaded as VoiceMediaResult.Success
        val voice = uploaded.value
        val body = JSONObject()
            .put("senderId", session.user.id)
            .put("mediaStoragePath", voice.objectKey)
            .put("mediaDurationMs", voice.durationMs)
        val response = executor.execute(
            uploaded.session,
            OracleRequest(OracleHttpMethod.POST, "/v1/contextual/conversations/$id/voice", body),
        )
        if (response !is AuthenticatedOracleResult.Response) {
            val failure = response.failure("تعذر إرسال التسجيل الآن.")
            val cleaned = media.discard(failure.session ?: uploaded.session, "contextual_voice", voice)
            return failure.copy(session = cleaned)
        }
        if (response.value.status != 201) {
            val cleaned = media.discard(response.session, "contextual_voice", voice)
            return if (response.value.status == 401) expired(cleaned)
            else ContextualResult.Failure("تعذر إرسال التسجيل (${response.value.status}).", cleaned)
        }
        val message = parseMessage(response.value.body)
        if (message == null) {
            val cleaned = media.discard(response.session, "contextual_voice", voice)
            return ContextualResult.Failure("استجابة إرسال التسجيل غير مكتملة.", cleaned)
        }
        val notification = executor.execute(
            response.session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/contextual/notifications",
                JSONObject().put("conversationId", id).put("messageId", message.id).put("kind", "thread_message"),
            ),
        )
        val updated = when (notification) {
            is AuthenticatedOracleResult.Response -> notification.session
            is AuthenticatedOracleResult.NetworkFailure -> notification.session ?: response.session
            is AuthenticatedOracleResult.InvalidResponse -> notification.session ?: response.session
            is AuthenticatedOracleResult.SessionFailure -> response.session
        }
        return ContextualResult.Success(message, updated)
    }

    override suspend fun markRead(session: AuthSession, conversationId: String): ContextualResult<Unit> {
        val id = conversationId.validId() ?: return ContextualResult.Failure("معرّف المحادثة غير صالح.", session)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/contextual/read", JSONObject().put("conversationId", id)),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> ContextualResult.Success(Unit, result.session)
                result.value.status == 401 -> expired(result.session)
                else -> ContextualResult.Failure("تعذر تحديث حالة القراءة.", result.session)
            }
            else -> result.failure("تعذر تحديث حالة القراءة الآن.")
        }
    }

    private fun parseSummary(row: JSONObject): ContextualConversation? {
        val id = row.optString("conversationId").validId() ?: return null
        val storyId = row.optString("contextEntityId").validId() ?: return null
        if (row.optString("contextType") != "story_reply") return null
        val other = parseParticipant(row.optJSONObject("otherParticipant") ?: return null) ?: return null
        val activity = row.optString("lastActivityAt").trim().takeIf(String::isNotEmpty) ?: return null
        val latest = row.optJSONObject("latestMessage")
        return ContextualConversation(
            id = id,
            storyId = storyId,
            context = parseStoryContext(row.optJSONObject("context"), storyId),
            other = other,
            latestBody = latest?.let { nullable(it, "body") },
            latestKind = latest?.let { nullable(it, "kind") },
            unreadCount = row.optInt("unreadCount", 0).coerceAtLeast(0),
            lastActivityAt = activity,
        )
    }

    private fun parseThread(row: JSONObject): ContextualThread? {
        val id = row.optString("id").validId() ?: return null
        val storyId = row.optString("contextEntityId").validId() ?: return null
        val starter = row.optString("starterId").validId() ?: return null
        val recipient = row.optString("recipientId").validId() ?: return null
        val other = parseParticipant(row.optJSONObject("otherParticipant") ?: return null) ?: return null
        val raw = row.optJSONArray("messages") ?: return null
        val messages = buildList {
            for (index in 0 until raw.length()) raw.optJSONObject(index)?.let(::parseMessage)?.let(::add)
        }
        return ContextualThread(
            ContextualConversation(
                id = id,
                storyId = storyId,
                context = parseStoryContext(row.optJSONObject("context"), storyId),
                other = other,
                latestBody = messages.lastOrNull()?.body,
                latestKind = messages.lastOrNull()?.kind,
                unreadCount = 0,
                lastActivityAt = messages.lastOrNull()?.createdAt ?: "",
            ),
            starter,
            recipient,
            messages,
        )
    }

    private fun parseStoryContext(
        row: JSONObject?,
        fallbackStoryId: String,
    ): ContextualStoryContext {
        val storyId = row?.let { nullable(it, "storyId")?.validId() } ?: fallbackStoryId
        return ContextualStoryContext(
            storyId = storyId,
            caption = row?.let { nullable(it, "caption") },
            mediaType = row?.let { nullable(it, "mediaType") }?.takeIf { it in setOf("image", "video") },
            mediaStoragePath = row?.let { nullable(it, "mediaStoragePath") },
            authorId = row?.let { nullable(it, "authorId")?.validId() },
            createdAt = row?.let { nullable(it, "createdAt") },
        )
    }

    private fun parseParticipant(row: JSONObject): ContextualParticipant? {
        val id = row.optString("id").validId() ?: return null
        return ContextualParticipant(id, nullable(row, "displayName"), nullable(row, "username"), nullable(row, "avatarUrl"))
    }

    private fun parseMessage(row: JSONObject): ContextualMessage? {
        val id = row.optString("id").validId() ?: return null
        val conversation = row.optString("conversationId").validId() ?: return null
        val sender = row.optString("senderId").validId() ?: return null
        val created = row.optString("createdAt").trim().takeIf(String::isNotEmpty) ?: return null
        val kind = row.optString("messageKind", "text").takeIf { it in setOf("text", "voice") } ?: return null
        return ContextualMessage(
            id, conversation, sender, row.optString("body"), kind, nullable(row, "mediaStoragePath"),
            if (row.isNull("mediaDurationMs")) null else row.optInt("mediaDurationMs"), created,
        )
    }

    private fun AuthenticatedOracleResult.failure(message: String): ContextualResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> ContextualResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> ContextualResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> ContextualResult.Failure(failure.message, unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED)
        is AuthenticatedOracleResult.Response -> error("HTTP response must be handled.")
    }

    private fun expired(session: AuthSession) = ContextualResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)
    private fun nullable(row: JSONObject, key: String) = if (!row.has(key) || row.isNull(key)) null else row.optString(key).trim().takeIf(String::isNotEmpty)
    private fun String.validId() = trim().takeIf(UUID::matches)
    private companion object { val UUID = Regex("^[0-9a-fA-F-]{36}$") }
}
