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

interface MessagingRepository {
    suspend fun loadInbox(session: AuthSession, offset: Int = 0, limit: Int = 50): MessagingResult<DealInboxPage>
    suspend fun loadMessages(session: AuthSession, dealId: String): MessagingResult<List<DealMessage>>
    suspend fun sendText(session: AuthSession, dealId: String, recipientUserId: String, body: String): MessagingResult<DealMessage>
    suspend fun markRead(session: AuthSession, dealId: String): MessagingResult<Unit>
}

class OracleMessagingRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val notificationDispatcher: NotificationDispatcher? = null,
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

        val summaries = loadItemTitles(inbox.session, itemIds.distinct())
        if (summaries is MessagingResult.Failure) return summaries
        summaries as MessagingResult.Success
        val titleById = summaries.value
        return MessagingResult.Success(
            DealInboxPage(
                items = rows.map { row ->
                    row.copy(
                        requestedItemTitle = titleById[row.requestedItemTitle] ?: "عنصر مطلوب غير متاح",
                        offeredItemTitle = titleById[row.offeredItemTitle] ?: "عنصر معروض غير متاح",
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

    private suspend fun loadItemTitles(session: AuthSession, ids: List<String>): MessagingResult<Map<String, String>> {
        val value = ids.joinToString(",")
        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/marketplace/exchange-items?ids=$value"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return MessagingResult.Failure("استجابة عناصر التبادل غير مكتملة.", result.session)
                    val titles = buildMap {
                        for (index in 0 until raw.length()) {
                            val row = raw.optJSONObject(index) ?: continue
                            val id = row.optString("id").trim()
                            val title = row.optString("title").trim()
                            if (id.isNotBlank() && title.isNotBlank()) put(id, title)
                        }
                    }
                    MessagingResult.Success(titles, result.session)
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
    }
}
