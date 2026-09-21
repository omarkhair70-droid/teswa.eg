package com.teswa.mobile.feature.messages

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
import com.teswa.mobile.feature.notifications.NotificationDispatch
import com.teswa.mobile.feature.notifications.NotificationDispatcher
import com.teswa.mobile.feature.voice.VoiceDraft
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult

interface MessagingRepository {
    suspend fun loadInbox(session: AuthSession, offset: Int = 0, limit: Int = 50): MessagingResult<DealInboxPage>
    suspend fun loadMessages(session: AuthSession, dealId: String): MessagingResult<List<DealMessage>>
    suspend fun sendText(session: AuthSession, dealId: String, recipientUserId: String, body: String): MessagingResult<DealMessage>
    suspend fun sendVoice(
        session: AuthSession,
        dealId: String,
        recipientUserId: String,
        draft: VoiceDraft,
        onProgress: (Int) -> Unit = {},
    ): MessagingResult<DealMessage> = MessagingResult.Failure("الرسائل الصوتية غير متاحة الآن.", session)
    suspend fun markRead(session: AuthSession, dealId: String): MessagingResult<Unit>
    suspend fun loadConfirmations(session: AuthSession, dealId: String): MessagingResult<Set<String>>
    suspend fun confirmCompletion(session: AuthSession, conversation: DealConversation): MessagingResult<Boolean>
}

class OracleMessagingRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val notificationDispatcher: NotificationDispatcher? = null,
    private val voiceMediaRepository: VoiceMediaRepository? = null,
) : MessagingRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun loadInbox(session: AuthSession, offset: Int, limit: Int): MessagingResult<DealInboxPage> {
        val safeOffset = offset.coerceAtLeast(0)
        val safeLimit = limit.coerceIn(1, 50)
        val inbox = executor.execute(
            session,
            OracleRequest(path = "/v1/deals/inbox?userId=${session.user.id}&limit=$safeLimit&offset=$safeOffset"),
        )
        if (inbox !is AuthenticatedOracleResult.Response) return inbox.toFailure("تعذر تحميل المحادثات الآن.")
        if (inbox.value.status == 401) return expired(inbox.session)
        if (inbox.value.status != 200) {
            return MessagingResult.Failure("تعذر تحميل المحادثات (${inbox.value.status}).", inbox.session)
        }
        val raw = inbox.value.body.optJSONArray("items")
            ?: return MessagingResult.Failure("استجابة المحادثات غير مكتملة.", inbox.session)
        if (!inbox.value.body.has("hasMore")) {
            return MessagingResult.Failure("استجابة المحادثات غير مكتملة.", inbox.session)
        }

        val rows = buildList {
            for (index in 0 until raw.length()) {
                val row = raw.optJSONObject(index) ?: continue
                parseConversation(row)?.let(::add)
            }
        }
        val itemIds = rows.flatMap { listOf(it.requestedItemTitle, it.offeredItemTitle) }
        if (itemIds.isEmpty()) {
            return MessagingResult.Success(DealInboxPage(rows, inbox.value.body.optBoolean("hasMore")), inbox.session)
        }

        val summaries = loadItemSummaries(inbox.session, itemIds.distinct())
        if (summaries is MessagingResult.Failure) return summaries
        summaries as MessagingResult.Success
        val summaryById = summaries.value
        return MessagingResult.Success(
            DealInboxPage(
                items = rows.map { row ->
                    val requested = summaryById[row.requestedItemTitle]
                    val offered = summaryById[row.offeredItemTitle]
                    row.copy(
                        requestedItemTitle = requested?.title ?: "عنصر مطلوب غير متاح",
                        offeredItemTitle = offered?.title ?: "عنصر معروض غير متاح",
                        requestedItemImageUrl = requested?.imageUrl,
                        offeredItemImageUrl = offered?.imageUrl,
                    )
                },
                hasMore = inbox.value.body.optBoolean("hasMore"),
            ),
            summaries.session,
        )
    }

    override suspend fun loadMessages(session: AuthSession, dealId: String): MessagingResult<List<DealMessage>> {
        val id = dealId.validId() ?: return MessagingResult.Failure("معرّف المحادثة غير صالح.", session)
        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/deals/$id/messages?limit=100&offset=0&order=desc"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return MessagingResult.Failure("استجابة الرسائل غير مكتملة.", result.session)
                    val messages = buildList {
                        for (index in 0 until raw.length()) {
                            val row = raw.optJSONObject(index) ?: continue
                            parseMessage(row, id)?.let(::add)
                        }
                    }
                    MessagingResult.Success(messages.asReversed(), result.session)
                }
                401 -> expired(result.session)
                404 -> MessagingResult.Failure("المحادثة مش موجودة أو غير متاحة.", result.session)
                else -> MessagingResult.Failure("تعذر تحميل الرسائل (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل الرسائل الآن.")
        }
    }

    override suspend fun sendText(
        session: AuthSession,
        dealId: String,
        recipientUserId: String,
        body: String,
    ): MessagingResult<DealMessage> {
        val id = dealId.validId() ?: return MessagingResult.Failure("معرّف المحادثة غير صالح.", session)
        val recipient = recipientUserId.validId() ?: return MessagingResult.Failure("الطرف الآخر غير صالح.", session)
        val clean = body.trim()
        if (clean.isEmpty()) return MessagingResult.Failure("اكتب رسالة الأول.", session)
        if (clean.length > 2_000) return MessagingResult.Failure("الرسالة لازم تكون 2000 حرف أو أقل.", session)
        val payload = JSONObject().put("senderId", session.user.id).put("body", clean)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/deals/$id/messages", payload),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> {
                    val message = parseMessage(result.value.body, id)
                        ?: return MessagingResult.Failure("استجابة إرسال الرسالة غير مكتملة.", result.session)
                    val updatedSession = notificationDispatcher?.dispatch(
                        result.session,
                        NotificationDispatch(
                            targetUserId = recipient,
                            type = "deal_message_received",
                            title = "رسالة جديدة في الصفقة",
                            body = clean.take(140),
                            dealId = id,
                            messageId = message.id,
                        ),
                    ) ?: result.session
                    MessagingResult.Success(message, updatedSession)
                }
                401 -> expired(result.session)
                403, 404 -> MessagingResult.Failure("مش مسموح بإرسال رسالة في المحادثة دي.", result.session)
                else -> MessagingResult.Failure("تعذر إرسال الرسالة (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر إرسال الرسالة الآن.")
        }
    }

    override suspend fun sendVoice(
        session: AuthSession,
        dealId: String,
        recipientUserId: String,
        draft: VoiceDraft,
        onProgress: (Int) -> Unit,
    ): MessagingResult<DealMessage> {
        val id = dealId.validId() ?: return MessagingResult.Failure("معرّف المحادثة غير صالح.", session)
        val recipient = recipientUserId.validId() ?: return MessagingResult.Failure("الطرف الآخر غير صالح.", session)
        val media = voiceMediaRepository ?: return MessagingResult.Failure("الرسائل الصوتية غير متاحة الآن.", session)
        val uploaded = media.upload(session, "deal_voice", "deals/$id/${session.user.id}", draft, onProgress)
        if (uploaded is VoiceMediaResult.Failure) {
            return MessagingResult.Failure(uploaded.message, uploaded.session, uploaded.network, uploaded.unauthorized)
        }
        uploaded as VoiceMediaResult.Success
        val voice = uploaded.value
        val payload = JSONObject()
            .put("dealId", id)
            .put("senderId", session.user.id)
            .put("body", "رسالة صوتية")
            .put("audioStoragePath", voice.objectKey)
            .put("audioDurationMs", voice.durationMs)
            .put("audioMimeType", voice.mimeType)
            .put("audioSizeBytes", voice.sizeBytes)
            .put("messageType", "voice")
        return when (val result = executor.execute(
            uploaded.session,
            OracleRequest(OracleHttpMethod.POST, "/v1/deals/$id/messages", payload),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> {
                    val message = parseMessage(result.value.body, id)
                    if (message == null) {
                        val cleaned = media.discard(result.session, "deal_voice", voice)
                        MessagingResult.Failure("استجابة إرسال التسجيل غير مكتملة.", cleaned)
                    } else {
                        val updated = notificationDispatcher?.dispatch(
                            result.session,
                            NotificationDispatch(
                                targetUserId = recipient,
                                type = "deal_voice_message_received",
                                title = "رسالة صوتية في الصفقة",
                                body = "وصلك تسجيل صوتي جديد.",
                                dealId = id,
                                messageId = message.id,
                            ),
                        ) ?: result.session
                        MessagingResult.Success(message, updated)
                    }
                }
                else -> {
                    val cleaned = media.discard(result.session, "deal_voice", voice)
                    if (result.value.status == 401) expired(cleaned)
                    else MessagingResult.Failure("تعذر إرسال التسجيل (${result.value.status}).", cleaned)
                }
            }
            else -> {
                val failure = result.toFailure("تعذر إرسال التسجيل الآن.")
                val cleaned = media.discard(failure.session ?: uploaded.session, "deal_voice", voice)
                failure.copy(session = cleaned)
            }
        }
    }

    override suspend fun markRead(session: AuthSession, dealId: String): MessagingResult<Unit> {
        val id = dealId.validId() ?: return MessagingResult.Failure("معرّف المحادثة غير صالح.", session)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/deals/$id/read", JSONObject()),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.optBoolean("ok") -> MessagingResult.Success(Unit, result.session)
                result.value.status == 401 -> expired(result.session)
                else -> MessagingResult.Failure("تعذر تحديث حالة القراءة.", result.session)
            }
            else -> result.toFailure("تعذر تحديث حالة القراءة الآن.")
        }
    }

    override suspend fun loadConfirmations(session: AuthSession, dealId: String): MessagingResult<Set<String>> {
        val id = dealId.validId() ?: return MessagingResult.Failure("معرّف الصفقة غير صالح.", session)
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/deals/$id/confirmations"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("userIds")
                        ?: return MessagingResult.Failure("استجابة تأكيدات الصفقة غير مكتملة.", result.session)
                    val users = buildSet {
                        for (index in 0 until raw.length()) raw.optString(index).validId()?.let(::add)
                    }
                    MessagingResult.Success(users, result.session)
                }
                401 -> expired(result.session)
                404 -> MessagingResult.Failure("الصفقة غير موجودة أو غير متاحة.", result.session)
                else -> MessagingResult.Failure("تعذر تحميل تأكيدات الصفقة.", result.session)
            }
            else -> result.toFailure("تعذر تحميل تأكيدات الصفقة الآن.")
        }
    }

    override suspend fun confirmCompletion(
        session: AuthSession,
        conversation: DealConversation,
    ): MessagingResult<Boolean> {
        val id = conversation.dealId.validId() ?: return MessagingResult.Failure("معرّف الصفقة غير صالح.", session)
        if (conversation.status !in COORDINATING) return MessagingResult.Failure("حالة الصفقة لا تسمح بالتأكيد.", session)
        val confirmation = executor.execute(
            session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/deals/$id/confirmations",
                JSONObject().put("userId", session.user.id).put("note", JSONObject.NULL),
            ),
        )
        if (confirmation !is AuthenticatedOracleResult.Response) return confirmation.toFailure("تعذر تسجيل تأكيدك الآن.")
        if (confirmation.value.status == 401) return expired(confirmation.session)
        if (confirmation.value.status != 200 || !confirmation.value.body.optBoolean("ok")) {
            return MessagingResult.Failure("تعذر تسجيل تأكيدك (${confirmation.value.status}).", confirmation.session)
        }
        val completion = executor.execute(
            confirmation.session,
            OracleRequest(OracleHttpMethod.POST, "/v1/deals/$id/complete", JSONObject()),
        )
        if (completion !is AuthenticatedOracleResult.Response) return completion.toFailure("تم تسجيل تأكيدك، لكن تعذر تحديث حالة الصفقة.")
        if (completion.value.status == 401) return expired(completion.session)
        if (completion.value.status != 200 || !completion.value.body.has("completed")) {
            return MessagingResult.Failure("تم تسجيل تأكيدك، لكن استجابة إتمام الصفقة غير صالحة.", completion.session)
        }
        val completed = completion.value.body.optBoolean("completed")
        var updatedSession = completion.session
        val dispatcher = notificationDispatcher
        if (dispatcher != null) {
            if (completed) {
                val notice = NotificationDispatch(
                    conversation.otherParticipantId, "deal_completed", "المقايضة تمت",
                    "الطرفين أكدوا الإتمام. تقدروا تسيبوا تقييم لبعض.", dealId = id,
                )
                updatedSession = dispatcher.dispatch(updatedSession, notice)
                updatedSession = dispatcher.dispatch(updatedSession, notice.copy(targetUserId = session.user.id))
            } else {
                updatedSession = dispatcher.dispatch(
                    updatedSession,
                    NotificationDispatch(
                        conversation.otherParticipantId, "deal_completion_confirmation_needed",
                        "الصفقة مستنية تأكيدك", "الطرف التاني أكد إن المقايضة تمت.", dealId = id,
                    ),
                )
            }
        }
        return MessagingResult.Success(completed, updatedSession)
    }

    private data class DealExchangeItemSummary(
        val title: String,
        val imageUrl: String?,
    )

    private suspend fun loadItemSummaries(
        session: AuthSession,
        ids: List<String>,
    ): MessagingResult<Map<String, DealExchangeItemSummary>> {
        val value = ids.joinToString(",")
        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/marketplace/exchange-items?ids=$value"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return MessagingResult.Failure("استجابة عناصر التبادل غير مكتملة.", result.session)
                    val summaries = buildMap {
                        for (index in 0 until raw.length()) {
                            val row = raw.optJSONObject(index) ?: continue
                            val id = row.optString("id").trim()
                            val title = row.optString("title").trim()
                            if (id.isNotBlank() && title.isNotBlank()) {
                                put(id, DealExchangeItemSummary(title, nullable(row, "imageUrl")))
                            }
                        }
                    }
                    MessagingResult.Success(summaries, result.session)
                }
                401 -> expired(result.session)
                else -> MessagingResult.Failure("تعذر تحميل عناصر التبادل.", result.session)
            }
            else -> result.toFailure("تعذر تحميل عناصر التبادل الآن.")
        }
    }

    private fun parseConversation(row: JSONObject): DealConversation? {
        val dealId = row.optString("dealId").validId() ?: return null
        val requestedId = row.optString("requestedItemId").validId() ?: return null
        val offeredId = row.optString("offeredItemId").validId() ?: return null
        val other = row.optJSONObject("otherParticipant") ?: return null
        val otherId = other.optString("id").validId() ?: return null
        val activity = row.optString("lastActivityAt").trim().takeIf(String::isNotEmpty) ?: return null
        val unread = row.optInt("unreadCount", -1).takeIf { it >= 0 } ?: return null
        val preview = row.optJSONObject("latestMessage")?.let { message ->
            val createdAt = message.optString("createdAt").trim()
            val senderId = message.optString("senderId").trim()
            if (createdAt.isBlank() || senderId.isBlank()) null else DealMessagePreview(
                body = message.optString("body"),
                createdAt = createdAt,
                senderId = senderId,
                messageType = message.optString("messageType", "text"),
            )
        }
        return DealConversation(
            dealId = dealId,
            status = row.optString("status"),
            requestedItemTitle = requestedId,
            offeredItemTitle = offeredId,
            otherParticipantId = otherId,
            otherDisplayName = nullable(other, "displayName"),
            otherAvatarUrl = nullable(other, "avatarUrl"),
            latestMessage = preview,
            unreadCount = unread,
            lastActivityAt = activity,
        )
    }

    private fun parseMessage(row: JSONObject, dealId: String): DealMessage? {
        val id = row.optString("id").validId() ?: return null
        if (row.optString("dealId") != dealId) return null
        val senderId = row.optString("senderId").validId() ?: return null
        val createdAt = row.optString("createdAt").trim().takeIf(String::isNotEmpty) ?: return null
        return DealMessage(
            id = id,
            dealId = dealId,
            senderId = senderId,
            body = row.optString("body"),
            messageType = row.optString("messageType", "text"),
            audioStoragePath = nullable(row, "audioStoragePath"),
            audioDurationMs = row.optInt("audioDurationMs").takeIf { !row.isNull("audioDurationMs") && it > 0 },
            audioMimeType = nullable(row, "audioMimeType"),
            audioSizeBytes = row.optLong("audioSizeBytes").takeIf { !row.isNull("audioSizeBytes") && it > 0 },
            createdAt = createdAt,
        )
    }

    private fun AuthenticatedOracleResult.toFailure(message: String): MessagingResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> MessagingResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> MessagingResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> MessagingResult.Failure(
            failure.message,
            network = failure.reason == AuthResult.Reason.NETWORK,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses must be handled by the caller.")
    }

    private fun expired(session: AuthSession) = MessagingResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)
    private fun String.validId() = trim().takeIf(UUID_LIKE::matches)
    private fun nullable(json: JSONObject, key: String): String? =
        if (!json.has(key) || json.isNull(key)) null else json.optString(key).trim().takeIf(String::isNotEmpty)

    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$")
        val COORDINATING = setOf("coordinating", "completed_pending_confirmation")
    }
}
