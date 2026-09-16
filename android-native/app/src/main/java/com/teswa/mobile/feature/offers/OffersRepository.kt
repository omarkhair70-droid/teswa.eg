package com.teswa.mobile.feature.offers

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

interface OffersRepository {
    suspend fun load(session: AuthSession): OffersResult<OffersInbox>
    suspend fun act(session: AuthSession, offer: OfferSummary, action: OfferAction): OffersResult<OfferActionOutcome>
    suspend fun loadCreation(session: AuthSession, requestedItemId: String): OffersResult<OfferCreationContext>
    suspend fun create(
        session: AuthSession,
        requestedItemId: String,
        offeredItemId: String,
        receiverId: String,
        message: String,
    ): OffersResult<CreatedOffer>
}

class OracleOffersRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val notificationDispatcher: NotificationDispatcher? = null,
) : OffersRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun load(session: AuthSession): OffersResult<OffersInbox> {
        val incoming = loadDirection(session, OfferDirection.INCOMING)
        if (incoming is OffersResult.Failure) return incoming
        incoming as OffersResult.Success
        val sent = loadDirection(incoming.session, OfferDirection.SENT)
        if (sent is OffersResult.Failure) return sent
        sent as OffersResult.Success

        val raw = incoming.value + sent.value
        if (raw.isEmpty()) return OffersResult.Success(OffersInbox(emptyList(), emptyList()), sent.session)
        val ids = raw.flatMap { listOf(it.requestedItem.id, it.offeredItem.id) }.distinct()
        val items = loadItems(sent.session, ids)
        if (items is OffersResult.Failure) return items
        items as OffersResult.Success
        val byId = items.value.associateBy { it.id }
        val hydrated = raw.map { offer ->
            offer.copy(
                requestedItem = byId[offer.requestedItem.id] ?: offer.requestedItem,
                offeredItem = byId[offer.offeredItem.id] ?: offer.offeredItem,
            )
        }
        return OffersResult.Success(
            OffersInbox(
                incoming = hydrated.filter { it.direction == OfferDirection.INCOMING && it.status in ACTIONABLE },
                sent = hydrated.filter { it.direction == OfferDirection.SENT },
            ),
            items.session,
        )
    }

    override suspend fun act(
        session: AuthSession,
        offer: OfferSummary,
        action: OfferAction,
    ): OffersResult<OfferActionOutcome> {
        val id = offer.id.validId() ?: return OffersResult.Failure("معرّف العرض غير صالح.", session)
        val path = when (action) {
            OfferAction.THINKING -> "/v1/offers/$id/thinking"
            OfferAction.SOFT_REJECT -> "/v1/offers/$id/soft-reject"
            OfferAction.ACCEPT -> "/v1/offers/$id/accept"
        }
        val body = if (action == OfferAction.ACCEPT) JSONObject() else JSONObject().put("note", JSONObject.NULL)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, path, body),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 401 -> expired(result.session)
                action == OfferAction.ACCEPT && result.value.status == 200 -> {
                    val dealId = result.value.body.optString("dealId").validId()
                        ?: return OffersResult.Failure("استجابة قبول العرض غير مكتملة.", result.session)
                    var updatedSession = result.session
                    updatedSession = notify(updatedSession, offer.senderId, "offer_accepted", "العرض اتقبل", "صاحب الحاجة قبل العرض.", offerId = id, dealId = dealId)
                    updatedSession = notify(updatedSession, offer.senderId, "deal_created", "اتفتحت دردشة الصفقة", "العرض اتقبل، وتقدروا تكملوا التنسيق.", offerId = id, dealId = dealId)
                    updatedSession = notify(updatedSession, offer.receiverId, "deal_created", "اتفتحت دردشة الصفقة", "العرض اتقبل، وتقدروا تكملوا التنسيق.", offerId = id, dealId = dealId)
                    OffersResult.Success(OfferActionOutcome(dealId), updatedSession)
                }
                action != OfferAction.ACCEPT && result.value.status == 200 && result.value.body.optBoolean("ok") -> {
                    val type = if (action == OfferAction.THINKING) "offer_thinking" else "offer_soft_rejected"
                    val title = if (action == OfferAction.THINKING) "صاحب الحاجة محتاج يفكر" else "العرض ما ظبطش المرة دي"
                    val body = if (action == OfferAction.THINKING) "العرض لسه مفتوح، بس محتاج وقت." else "صاحب الحاجة رفض العرض بلطف."
                    val updatedSession = notify(result.session, offer.senderId, type, title, body, offerId = id)
                    OffersResult.Success(OfferActionOutcome(), updatedSession)
                }
                result.value.status == 403 -> OffersResult.Failure("مش مسموح لك تغيّر العرض ده.", result.session)
                result.value.status == 404 -> OffersResult.Failure("العرض مش موجود أو انتهى.", result.session)
                result.value.status == 409 -> OffersResult.Failure("حالة العرض اتغيرت. حدّث القائمة وجرب تاني.", result.session)
                else -> OffersResult.Failure("تعذر تحديث العرض (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحديث العرض الآن.")
        }
    }

    override suspend fun loadCreation(
        session: AuthSession,
        requestedItemId: String,
    ): OffersResult<OfferCreationContext> {
        val requestedId = requestedItemId.validId()
            ?: return OffersResult.Failure("معرّف العنصر غير صالح.", session)
        val validation = when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/offers/items/$requestedId"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> result
                401 -> return expired(result.session)
                404 -> return OffersResult.Failure("العنصر المطلوب مش موجود.", result.session)
                else -> return OffersResult.Failure("تعذر تجهيز العرض (${result.value.status}).", result.session)
            }
            else -> return result.toFailure("تعذر تجهيز العرض الآن.")
        }
        val ownerId = validation.value.body.optString("ownerId").validId()
            ?: return OffersResult.Failure("استجابة العنصر غير مكتملة.", validation.session)
        if (validation.value.body.optString("status") != "active") {
            return OffersResult.Failure("العنصر المطلوب مش متاح للتبديل حاليًا.", validation.session)
        }
        if (ownerId == validation.session.user.id) {
            return OffersResult.Failure("ما ينفعش تبعت عرض على عنصر من حاجتك.", validation.session)
        }

        val blockState = executor.execute(
            validation.session,
            OracleRequest(path = "/v1/profiles/$ownerId/block-state"),
        )
        if (blockState !is AuthenticatedOracleResult.Response) return blockState.toFailure("تعذر التحقق من إمكانية التبادل.")
        if (blockState.value.status == 401) return expired(blockState.session)
        if (blockState.value.status != 200) return OffersResult.Failure("تعذر التحقق من إمكانية التبادل.", blockState.session)
        if (blockState.value.body.optBoolean("isBlockedEitherDirection")) {
            return OffersResult.Failure("مش ممكن إنشاء عرض لأن التواصل بين الحسابين مقفول.", blockState.session)
        }

        val owned = executor.execute(
            blockState.session,
            OracleRequest(path = "/v1/offers/owned-active-items?userId=${blockState.session.user.id}&limit=50&offset=0"),
        )
        if (owned !is AuthenticatedOracleResult.Response) return owned.toFailure("تعذر تحميل حاجتك المعروضة.")
        if (owned.value.status == 401) return expired(owned.session)
        if (owned.value.status != 200) return OffersResult.Failure("تعذر تحميل حاجتك المعروضة.", owned.session)
        val rawIds = owned.value.body.optJSONArray("items")
            ?: return OffersResult.Failure("استجابة حاجتك المعروضة غير مكتملة.", owned.session)
        val ownedIds = buildList {
            for (index in 0 until rawIds.length()) {
                rawIds.optJSONObject(index)?.optString("id")?.validId()?.let(::add)
            }
        }.filterNot { it == requestedId }
        val summaries = loadItems(owned.session, listOf(requestedId) + ownedIds)
        if (summaries is OffersResult.Failure) return summaries
        summaries as OffersResult.Success
        val byId = summaries.value.associateBy { it.id }
        val requested = byId[requestedId] ?: OfferItemSummary(
            requestedId,
            validation.value.body.optString("title").trim().ifBlank { "عنصر بدون عنوان" },
            null,
        )
        return OffersResult.Success(
            OfferCreationContext(requested, ownedIds.mapNotNull(byId::get), ownerId),
            summaries.session,
        )
    }

    override suspend fun create(
        session: AuthSession,
        requestedItemId: String,
        offeredItemId: String,
        receiverId: String,
        message: String,
    ): OffersResult<CreatedOffer> {
        val requested = requestedItemId.validId() ?: return OffersResult.Failure("معرّف العنصر المطلوب غير صالح.", session)
        val offered = offeredItemId.validId() ?: return OffersResult.Failure("اختار عنصر صالح من حاجتك.", session)
        val receiver = receiverId.validId() ?: return OffersResult.Failure("صاحب العنصر غير صالح.", session)
        if (requested == offered || receiver == session.user.id) {
            return OffersResult.Failure("اختيارات عرض التبديل غير صالحة.", session)
        }
        val cleanMessage = message.trim()
        if (cleanMessage.length > 1_000) return OffersResult.Failure("رسالة العرض لازم تكون 1000 حرف أو أقل.", session)
        val body = JSONObject()
            .put("requestedItemId", requested)
            .put("offeredItemId", offered)
            .put("senderId", session.user.id)
            .put("receiverId", receiver)
            .put("message", cleanMessage.takeIf(String::isNotEmpty) ?: JSONObject.NULL)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/offers", body),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> {
                    val offerId = result.value.body.optString("offerId").validId()
                    if (offerId != null && result.value.body.optBoolean("eventRecorded")) {
                        val updatedSession = notify(
                            result.session, receiver, "offer_received", "وصلك عرض جديد",
                            "عندك عرض تبديل جديد مستني ردك.", itemId = requested, offerId = offerId,
                        )
                        OffersResult.Success(CreatedOffer(offerId), updatedSession)
                    } else {
                        OffersResult.Failure("استجابة إرسال العرض غير مكتملة.", result.session)
                    }
                }
                401 -> expired(result.session)
                403 -> OffersResult.Failure("العرض غير مسموح؛ راجع حالة العناصر أو الحظر.", result.session)
                409 -> OffersResult.Failure("حالة أحد العنصرين اتغيرت. حدّث وحاول تاني.", result.session)
                else -> OffersResult.Failure("تعذر إرسال العرض (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر إرسال العرض الآن.")
        }
    }

    private suspend fun loadDirection(
        session: AuthSession,
        direction: OfferDirection,
    ): OffersResult<List<OfferSummary>> {
        val query = if (direction == OfferDirection.INCOMING) "incoming" else "sent"
        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/offers?direction=$query&limit=50&offset=0"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return OffersResult.Failure("استجابة العروض غير مكتملة.", result.session)
                    val values = buildList {
                        for (index in 0 until raw.length()) {
                            val row = raw.optJSONObject(index) ?: continue
                            parseOffer(row, direction)?.let(::add)
                        }
                    }
                    OffersResult.Success(values, result.session)
                }
                401 -> expired(result.session)
                else -> OffersResult.Failure("تعذر تحميل العروض (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل العروض الآن.")
        }
    }

    private suspend fun loadItems(session: AuthSession, ids: List<String>): OffersResult<List<OfferItemSummary>> {
        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/marketplace/exchange-items?ids=${ids.joinToString(",")}"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return OffersResult.Failure("استجابة عناصر العروض غير مكتملة.", result.session)
                    val values = buildList {
                        for (index in 0 until raw.length()) {
                            val row = raw.optJSONObject(index) ?: continue
                            val id = row.optString("id").validId() ?: continue
                            add(OfferItemSummary(id, row.optString("title").trim().ifBlank { "عنصر بدون عنوان" }, nullable(row, "imageUrl")))
                        }
                    }
                    OffersResult.Success(values, result.session)
                }
                401 -> expired(result.session)
                else -> OffersResult.Failure("تعذر تحميل عناصر العروض.", result.session)
            }
            else -> result.toFailure("تعذر تحميل عناصر العروض الآن.")
        }
    }

    private fun parseOffer(row: JSONObject, direction: OfferDirection): OfferSummary? {
        val id = row.optString("id").validId() ?: return null
        val requested = row.optString("requestedItemId").validId() ?: return null
        val offered = row.optString("offeredItemId").validId() ?: return null
        val sender = row.optString("senderId").validId() ?: return null
        val receiver = row.optString("receiverId").validId() ?: return null
        return OfferSummary(
            id = id,
            status = row.optString("status"),
            message = nullable(row, "message"),
            requestedItem = OfferItemSummary(requested, "عنصر مطلوب غير متاح", null),
            offeredItem = OfferItemSummary(offered, "عنصر معروض غير متاح", null),
            senderId = sender,
            receiverId = receiver,
            dealId = nullable(row, "dealId")?.validId(),
            createdAt = nullable(row, "createdAt"),
            direction = direction,
        )
    }

    private fun AuthenticatedOracleResult.toFailure(message: String): OffersResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> OffersResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> OffersResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> OffersResult.Failure(
            failure.message,
            network = failure.reason == AuthResult.Reason.NETWORK,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses must be handled by the caller.")
    }

    private fun expired(session: AuthSession) = OffersResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)
    private suspend fun notify(
        session: AuthSession,
        targetUserId: String,
        type: String,
        title: String,
        body: String,
        itemId: String? = null,
        offerId: String? = null,
        dealId: String? = null,
    ): AuthSession = notificationDispatcher?.dispatch(
        session,
        NotificationDispatch(targetUserId, type, title, body, itemId, offerId, dealId),
    ) ?: session
    private fun String.validId() = trim().takeIf(UUID_LIKE::matches)
    private fun nullable(json: JSONObject, key: String): String? =
        if (!json.has(key) || json.isNull(key)) null else json.optString(key).trim().takeIf(String::isNotEmpty)

    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$")
        val ACTIONABLE = setOf("pending", "thinking")
    }
}
