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
import org.json.JSONArray
import org.json.JSONObject
import com.teswa.mobile.feature.voice.VoiceDraft
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult

interface DirectRepository {
    suspend fun loadInbox(session: AuthSession): DirectResult<List<DirectConversation>>
    suspend fun loadMessages(session: AuthSession, conversationId: String): DirectResult<List<DirectMessage>>
    suspend fun startWithMessage(session: AuthSession, targetUserId: String, body: String): DirectResult<DirectStartOutcome>
    suspend fun send(session: AuthSession, conversation: DirectConversation, body: String): DirectResult<Unit>
    suspend fun sendReply(
        session: AuthSession,
        conversation: DirectConversation,
        body: String,
        replyToMessageId: String,
    ): DirectResult<Unit> = send(session, conversation, body)
    suspend fun sendRich(
        session: AuthSession,
        conversation: DirectConversation,
        body: String?,
        replyToMessageId: String?,
        attachments: List<DirectAttachment>,
    ): DirectResult<Unit> = when {
        attachments.isNotEmpty() -> DirectResult.Failure("إرسال المرفقات غير متاح الآن.", session)
        replyToMessageId != null && !body.isNullOrBlank() -> sendReply(session, conversation, body, replyToMessageId)
        !body.isNullOrBlank() -> send(session, conversation, body)
        else -> DirectResult.Failure("الرسالة فاضية.", session)
    }
    suspend fun toggleReaction(
        session: AuthSession,
        messageId: String,
        reaction: String,
    ): DirectResult<DirectReactionToggle> = DirectResult.Failure("التفاعل غير متاح الآن.", session)
    suspend fun deleteMessage(session: AuthSession, messageId: String): DirectResult<DirectDeleteOutcome> =
        DirectResult.Failure("حذف الرسالة غير متاح الآن.", session)
    suspend fun setTyping(session: AuthSession, conversationId: String, isTyping: Boolean): DirectResult<Unit> =
        DirectResult.Failure("حالة الكتابة غير متاحة الآن.", session)
    suspend fun loadTyping(session: AuthSession, conversationId: String): DirectResult<Set<String>> =
        DirectResult.Success(emptySet(), session)
    suspend fun sendVoice(session: AuthSession, conversation: DirectConversation, draft: VoiceDraft, onProgress: (Int) -> Unit = {}): DirectResult<Unit> =
        DirectResult.Failure("الرسائل الصوتية غير متاحة الآن.", session)
    suspend fun act(session: AuthSession, conversationId: String, accept: Boolean): DirectResult<Unit>
    suspend fun markRead(session: AuthSession, conversationId: String): DirectResult<Unit>
}

class OracleDirectRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val voiceMediaRepository: VoiceMediaRepository? = null,
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
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/direct/conversations/$id/native?limit=100"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items") ?: return DirectResult.Failure("استجابة الرسائل غير مكتملة.", result.session)
                    val items = buildList { for (index in 0 until raw.length()) raw.optJSONObject(index)?.let(::nativeMessage)?.let(::add) }
                    DirectResult.Success(items, result.session)
                }
                401 -> expired(result.session)
                else -> DirectResult.Failure("تعذر تحميل المحادثة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل المحادثة الآن.")
        }
    }

    override suspend fun startWithMessage(
        session: AuthSession,
        targetUserId: String,
        body: String,
    ): DirectResult<DirectStartOutcome> {
        val target = targetUserId.validId() ?: return DirectResult.Failure("الحساب المطلوب غير صالح.", session)
        val clean = body.trim()
        if (clean.isEmpty() || clean.length > 1_200) {
            return DirectResult.Failure("الرسالة لازم تكون من 1 إلى 1200 حرف.", session)
        }
        val request = OracleRequest(
            method = OracleHttpMethod.POST,
            path = "/v1/direct/conversations/start-with-message",
            body = JSONObject().put("targetUserId", target).put("body", clean),
        )
        return when (val result = executor.execute(session, request)) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val payload = result.value.body
                    if (!payload.has("ok")) {
                        DirectResult.Failure("استجابة بدء المراسلة غير مكتملة.", result.session)
                    } else {
                        val conversationId = payload.optString("conversationId").validId()
                        val status = payload.optString("status").takeIf { it in STATUSES }
                        if (conversationId == null || status == null) {
                            DirectResult.Failure(
                                payload.optString("message").trim().takeIf(String::isNotEmpty)
                                    ?: "تعذر بدء المراسلة.",
                                result.session,
                            )
                        } else {
                            DirectResult.Success(
                                DirectStartOutcome(
                                    conversationId = conversationId,
                                    messageId = payload.optString("messageId").validId(),
                                    status = status,
                                    accepted = payload.optBoolean("ok"),
                                    message = nullable(payload, "message"),
                                ),
                                result.session,
                            )
                        }
                    }
                }
                401 -> expired(result.session)
                403 -> DirectResult.Failure("المراسلة غير متاحة بسبب الخصوصية أو الحظر.", result.session)
                else -> DirectResult.Failure("تعذر بدء المراسلة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر بدء المراسلة الآن.")
        }
    }

    override suspend fun send(
        session: AuthSession,
        conversation: DirectConversation,
        body: String,
    ): DirectResult<Unit> = sendNative(session, conversation, body, null, emptyList())

    override suspend fun sendReply(
        session: AuthSession,
        conversation: DirectConversation,
        body: String,
        replyToMessageId: String,
    ): DirectResult<Unit> = sendNative(session, conversation, body, replyToMessageId, emptyList())

    override suspend fun sendRich(
        session: AuthSession,
        conversation: DirectConversation,
        body: String?,
        replyToMessageId: String?,
        attachments: List<DirectAttachment>,
    ): DirectResult<Unit> = sendNative(session, conversation, body, replyToMessageId, attachments)

    private suspend fun sendNative(
        session: AuthSession,
        conversation: DirectConversation,
        body: String?,
        replyToMessageId: String?,
        attachments: List<DirectAttachment> = emptyList(),
    ): DirectResult<Unit> {
        val id = conversation.id.validId() ?: return DirectResult.Failure("معرّف المحادثة غير صالح.", session)
        val clean = body?.trim()?.takeIf(String::isNotEmpty)
        if (clean != null && clean.length > 1_200) return DirectResult.Failure("الرسالة لازم تكون 1200 حرف أو أقل.", session)
        if (clean == null && attachments.isEmpty()) return DirectResult.Failure("اكتب رسالة أو اختار مرفق.", session)
        if (attachments.size > 5) return DirectResult.Failure("مسموح بحد أقصى 5 مرفقات.", session)
        val reply = replyToMessageId?.validId()
            ?: if (replyToMessageId == null) null else return DirectResult.Failure("الرسالة اللي بترد عليها غير صالحة.", session)
        val attachmentJson = JSONArray()
        attachments.forEach { attachment ->
            if (attachment.kind !in setOf("image", "video", "file", "audio") || attachment.storagePath.isBlank()) {
                return DirectResult.Failure("في مرفق غير صالح.", session)
            }
            attachmentJson.put(
                JSONObject()
                    .put("id", attachment.id ?: JSONObject.NULL)
                    .put("kind", attachment.kind)
                    .put("storagePath", attachment.storagePath)
                    .put("storageBucket", attachment.storageBucket ?: "direct-chat-media")
                    .put("fileName", attachment.fileName ?: JSONObject.NULL)
                    .put("mimeType", attachment.mimeType ?: JSONObject.NULL)
                    .put("sizeBytes", attachment.sizeBytes ?: JSONObject.NULL)
                    .put("durationMs", attachment.durationMs ?: JSONObject.NULL)
                    .put("width", attachment.width ?: JSONObject.NULL)
                    .put("height", attachment.height ?: JSONObject.NULL),
            )
        }
        val payload = JSONObject()
            .put("body", clean ?: JSONObject.NULL)
            .put("replyToMessageId", reply ?: JSONObject.NULL)
            .put("attachments", attachmentJson)
            .put("metadata", JSONObject())
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/direct/conversations/$id/native", payload),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> {
                    val messageId = result.value.body.optString("messageId").validId()
                    if (messageId == null) DirectResult.Failure("استجابة إرسال الرسالة غير مكتملة.", result.session)
                    else DirectResult.Success(Unit, result.session)
                }
                result.value.status == 401 -> expired(result.session)
                result.value.status == 403 -> DirectResult.Failure("المحادثة غير متاحة بسبب الخصوصية أو الحظر.", result.session)
                else -> DirectResult.Failure("تعذر إرسال الرسالة (" + result.value.status + ").", result.session)
            }
            else -> result.failure("تعذر إرسال الرسالة الآن.")
        }
    }

    override suspend fun toggleReaction(
        session: AuthSession,
        messageId: String,
        reaction: String,
    ): DirectResult<DirectReactionToggle> {
        val id = messageId.validId() ?: return DirectResult.Failure("الرسالة غير صالحة.", session)
        if (reaction !in setOf("love", "thumbs_up")) return DirectResult.Failure("التفاعل غير مدعوم.", session)
        return when (val result = executor.execute(
            session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/direct/messages/$id/reaction",
                JSONObject().put("reaction", reaction),
            ),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> DirectResult.Success(
                    DirectReactionToggle(
                        enabled = result.value.body.optBoolean("enabled"),
                        count = result.value.body.optInt("count").coerceAtLeast(0),
                    ),
                    result.session,
                )
                result.value.status == 401 -> expired(result.session)
                else -> DirectResult.Failure("تعذر تحديث التفاعل.", result.session)
            }
            else -> result.failure("تعذر تحديث التفاعل الآن.")
        }
    }

    override suspend fun deleteMessage(
        session: AuthSession,
        messageId: String,
    ): DirectResult<DirectDeleteOutcome> {
        val id = messageId.validId() ?: return DirectResult.Failure("الرسالة غير صالحة.", session)
        return when (
            val result = executor.execute(
                session,
                OracleRequest(OracleHttpMethod.POST, "/v1/direct/messages/$id/delete", JSONObject()),
            )
        ) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> {
                    val raw = result.value.body.optJSONArray("storagePaths") ?: JSONArray()
                    val paths = buildList {
                        for (index in 0 until raw.length()) {
                            raw.optString(index).trim().takeIf(String::isNotEmpty)?.let(::add)
                        }
                    }
                    DirectResult.Success(DirectDeleteOutcome(paths), result.session)
                }
                result.value.status == 401 -> expired(result.session)
                else -> DirectResult.Failure("تعذر حذف الرسالة.", result.session)
            }
            else -> result.failure("تعذر حذف الرسالة الآن.")
        }
    }

    override suspend fun setTyping(
        session: AuthSession,
        conversationId: String,
        isTyping: Boolean,
    ): DirectResult<Unit> {
        val id = conversationId.validId() ?: return DirectResult.Failure("المحادثة غير صالحة.", session)
        return when (val result = executor.execute(
            session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/direct/conversations/$id/typing",
                JSONObject().put("isTyping", isTyping),
            ),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> DirectResult.Success(Unit, result.session)
                result.value.status == 401 -> expired(result.session)
                else -> DirectResult.Failure("تعذر تحديث حالة الكتابة.", result.session)
            }
            else -> result.failure("تعذر تحديث حالة الكتابة الآن.")
        }
    }

    override suspend fun loadTyping(
        session: AuthSession,
        conversationId: String,
    ): DirectResult<Set<String>> {
        val id = conversationId.validId() ?: return DirectResult.Failure("المحادثة غير صالحة.", session)
        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/direct/conversations/$id/typing"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("userIds") ?: JSONArray()
                    val ids = buildSet {
                        for (index in 0 until raw.length()) raw.optString(index).validId()?.let(::add)
                    }
                    DirectResult.Success(ids, result.session)
                }
                401 -> expired(result.session)
                else -> DirectResult.Failure("تعذر تحميل حالة الكتابة.", result.session)
            }
            else -> result.failure("تعذر تحميل حالة الكتابة الآن.")
        }
    }

    override suspend fun sendVoice(
        session: AuthSession,
        conversation: DirectConversation,
        draft: VoiceDraft,
        onProgress: (Int) -> Unit,
    ): DirectResult<Unit> {
        val id = conversation.id.validId() ?: return DirectResult.Failure("معرّف المحادثة غير صالح.", session)
        val media = voiceMediaRepository ?: return DirectResult.Failure("الرسائل الصوتية غير متاحة الآن.", session)
        val uploaded = media.upload(session, "direct_voice", "direct/$id/${session.user.id}", draft, onProgress)
        if (uploaded is VoiceMediaResult.Failure) {
            return DirectResult.Failure(uploaded.message, uploaded.session, uploaded.unauthorized, uploaded.network)
        }
        uploaded as VoiceMediaResult.Success
        val voice = uploaded.value
        val body = JSONObject()
            .put("audioStoragePath", voice.objectKey)
            .put("audioMimeType", voice.mimeType)
            .put("audioDurationMs", voice.durationMs)
            .put("audioSizeBytes", voice.sizeBytes)
        return when (val result = executor.execute(
            uploaded.session,
            OracleRequest(OracleHttpMethod.POST, "/v1/direct/conversations/$id/voice", body),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") && result.value.body.optString("messageId").validId() != null ->
                    DirectResult.Success(Unit, result.session)
                else -> {
                    val cleaned = media.discard(result.session, "direct_voice", voice)
                    if (result.value.status == 401) expired(cleaned)
                    else DirectResult.Failure("تعذر إرسال التسجيل (${result.value.status}).", cleaned)
                }
            }
            else -> {
                val failure = result.failure("تعذر إرسال التسجيل الآن.")
                val cleaned = media.discard(failure.session ?: uploaded.session, "direct_voice", voice)
                failure.copy(session = cleaned)
            }
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
    private fun nativeMessage(row: JSONObject): DirectMessage? {
        val id = row.optString("id").validId() ?: return null
        val sender = row.optString("senderId").validId() ?: return null
        val created = row.optString("createdAt").trim().takeIf(String::isNotEmpty) ?: return null
        val attachments = buildList {
            val raw = row.optJSONArray("attachments") ?: JSONArray()
            for (index in 0 until raw.length()) {
                val value = raw.optJSONObject(index) ?: continue
                val path = nullable(value, "storagePath") ?: continue
                val kind = value.optString("kind").takeIf { it in setOf("image", "video", "file", "audio") } ?: continue
                add(
                    DirectAttachment(
                        id = nullable(value, "id"),
                        kind = kind,
                        storagePath = path,
                        storageBucket = nullable(value, "storageBucket"),
                        fileName = nullable(value, "fileName"),
                        mimeType = nullable(value, "mimeType"),
                        sizeBytes = value.optLong("sizeBytes").takeIf { !value.isNull("sizeBytes") && it > 0 },
                        durationMs = value.optInt("durationMs").takeIf { !value.isNull("durationMs") && it > 0 },
                        width = value.optInt("width").takeIf { !value.isNull("width") && it > 0 },
                        height = value.optInt("height").takeIf { !value.isNull("height") && it > 0 },
                    ),
                )
            }
        }
        val reactions = buildList {
            val raw = row.optJSONArray("reactions") ?: JSONArray()
            for (index in 0 until raw.length()) {
                val value = raw.optJSONObject(index) ?: continue
                val userId = nullable(value, "userId")?.validId() ?: continue
                val reaction = value.optString("reaction").takeIf { it in setOf("love", "thumbs_up") } ?: continue
                add(DirectReaction(reaction, userId, nullable(value, "createdAt")))
            }
        }
        val legacyAudio = attachments.firstOrNull { it.kind == "audio" }
        return DirectMessage(
            id = id,
            senderId = sender,
            body = row.optString("body"),
            messageType = row.optString("messageType", if (legacyAudio != null) "voice" else "text"),
            createdAt = created,
            readAt = nullable(row, "readAt"),
            audioStoragePath = legacyAudio?.storagePath,
            audioDurationMs = legacyAudio?.durationMs,
            audioMimeType = legacyAudio?.mimeType,
            audioSizeBytes = legacyAudio?.sizeBytes,
            replyToMessageId = nullable(row, "replyToMessageId")?.validId(),
            replySenderId = nullable(row, "replySenderId")?.validId(),
            replyBody = nullable(row, "replyBody"),
            deletedAt = nullable(row, "deletedAt"),
            attachments = attachments,
            reactions = reactions,
        )
    }

    private fun message(row: JSONObject): DirectMessage? {
        val id = row.optString("id").validId() ?: return null
        val sender = row.optString("senderId").validId() ?: return null
        val created = row.optString("createdAt").trim().takeIf(String::isNotEmpty) ?: return null
        return DirectMessage(
            id, sender, row.optString("body"), row.optString("messageType","text"), created, nullable(row,"readAt"),
            nullable(row,"audioStoragePath"),
            row.optInt("audioDurationMs").takeIf { !row.isNull("audioDurationMs") && it > 0 },
            nullable(row,"audioMimeType"),
            row.optLong("audioSizeBytes").takeIf { !row.isNull("audioSizeBytes") && it > 0 },
        )
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
