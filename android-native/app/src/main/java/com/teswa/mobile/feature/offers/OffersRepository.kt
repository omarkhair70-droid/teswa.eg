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

interface OffersRepository {
    suspend fun load(session: AuthSession): OffersResult<OffersInbox>
    suspend fun act(session: AuthSession, offerId: String, action: OfferAction): OffersResult<OfferActionOutcome>
}

class OracleOffersRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
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
        offerId: String,
        action: OfferAction,
    ): OffersResult<OfferActionOutcome> {
        val id = offerId.validId() ?: return OffersResult.Failure("معرّف العرض غير صالح.", session)
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
                    OffersResult.Success(OfferActionOutcome(dealId), result.session)
                }
                action != OfferAction.ACCEPT && result.value.status == 200 && result.value.body.optBoolean("ok") ->
                    OffersResult.Success(OfferActionOutcome(), result.session)
                result.value.status == 403 -> OffersResult.Failure("مش مسموح لك تغيّر العرض ده.", result.session)
                result.value.status == 404 -> OffersResult.Failure("العرض مش موجود أو انتهى.", result.session)
                result.value.status == 409 -> OffersResult.Failure("حالة العرض اتغيرت. حدّث القائمة وجرب تاني.", result.session)
                else -> OffersResult.Failure("تعذر تحديث العرض (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحديث العرض الآن.")
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
    private fun String.validId() = trim().takeIf(UUID_LIKE::matches)
    private fun nullable(json: JSONObject, key: String): String? =
        if (!json.has(key) || json.isNull(key)) null else json.optString(key).trim().takeIf(String::isNotEmpty)

    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$")
        val ACTIONABLE = setOf("pending", "thinking")
    }
}
