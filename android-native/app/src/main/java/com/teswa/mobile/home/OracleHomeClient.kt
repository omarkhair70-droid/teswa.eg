package com.teswa.mobile.home

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import org.json.JSONObject

class OracleHomeClient(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : HomeRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun fetchFeed(
        session: AuthSession,
        offset: Int,
        limit: Int,
    ): HomeFeedResult<HomeFeedPage> {
        val safeOffset = offset.coerceAtLeast(0)
        val safeLimit = limit.coerceIn(1, 40)
        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/marketplace/feed?offset=$safeOffset&limit=$safeLimit"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parsePage(result.value.body, result.session)
                401 -> expired("انتهت الجلسة أثناء تحميل الرئيسية.", result.session)
                else -> HomeFeedResult.Failure(
                    message = "تعذر تحميل الرئيسية (${result.value.status}).",
                    session = result.session,
                )
            }
            is AuthenticatedOracleResult.NetworkFailure -> HomeFeedResult.Failure(
                message = "تعذر تحميل العناصر الآن. جرّب مرة تانية.",
                network = true,
                session = result.session,
            )
            is AuthenticatedOracleResult.InvalidResponse -> HomeFeedResult.Failure(
                message = "استجابة الرئيسية من الخادم غير صالحة.",
                session = result.session,
            )
            is AuthenticatedOracleResult.SessionFailure -> result.failure.toHomeFailure()
        }
    }

    override suspend fun fetchDetail(
        session: AuthSession,
        itemId: String,
    ): HomeFeedResult<ItemDetail> {
        val normalizedId = itemId.trim()
        if (!UUID_LIKE.matches(normalizedId)) {
            return HomeFeedResult.Failure("معرّف العنصر غير صالح.", session = session)
        }

        return when (val result = executor.execute(
            session,
            OracleRequest(path = "/v1/marketplace/items/$normalizedId/detail"),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parseDetail(result.value.body, result.session)
                401 -> expired("انتهت الجلسة أثناء تحميل العنصر.", result.session)
                404 -> HomeFeedResult.Failure(
                    message = "العنصر مش موجود أو لم يعد متاحًا.",
                    session = result.session,
                )
                else -> HomeFeedResult.Failure(
                    message = "تعذر تحميل تفاصيل العنصر (${result.value.status}).",
                    session = result.session,
                )
            }
            is AuthenticatedOracleResult.NetworkFailure -> HomeFeedResult.Failure(
                message = "تعذر تحميل تفاصيل العنصر الآن.",
                network = true,
                session = result.session,
            )
            is AuthenticatedOracleResult.InvalidResponse -> HomeFeedResult.Failure(
                message = "استجابة تفاصيل العنصر من الخادم غير صالحة.",
                session = result.session,
            )
            is AuthenticatedOracleResult.SessionFailure -> result.failure.toHomeFailure()
        }
    }

    override suspend fun fetchNearby(
        session: AuthSession,
        latitude: Double,
        longitude: Double,
        radiusKm: Double,
        offset: Int,
        limit: Int,
    ): HomeFeedResult<HomeFeedPage> {
        if (!latitude.isFinite() || latitude !in -90.0..90.0 || !longitude.isFinite() || longitude !in -180.0..180.0 ||
            !radiusKm.isFinite() || radiusKm !in 0.1..100.0
        ) return HomeFeedResult.Failure("الموقع غير صالح.", session = session)
        val safeOffset = offset.coerceAtLeast(0)
        val safeLimit = limit.coerceIn(1, 40)
        val path = "/v1/marketplace/nearby?latitude=$latitude&longitude=$longitude&radiusKm=$radiusKm&limit=$safeLimit&offset=$safeOffset"
        return when (val result = executor.execute(session, OracleRequest(path = path))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parsePage(result.value.body, result.session)
                401 -> expired("انتهت الجلسة أثناء تحميل العناصر القريبة.", result.session)
                else -> HomeFeedResult.Failure("تعذر تحميل العناصر القريبة (${result.value.status}).", session = result.session)
            }
            is AuthenticatedOracleResult.NetworkFailure -> HomeFeedResult.Failure("تعذر تحميل العناصر القريبة الآن.", network = true, session = result.session)
            is AuthenticatedOracleResult.InvalidResponse -> HomeFeedResult.Failure("استجابة العناصر القريبة غير صالحة.", session = result.session)
            is AuthenticatedOracleResult.SessionFailure -> result.failure.toHomeFailure()
        }
    }

    private fun parsePage(body: JSONObject, session: AuthSession): HomeFeedResult<HomeFeedPage> {
        val rawItems = body.optJSONArray("items")
            ?: return HomeFeedResult.Failure("استجابة الرئيسية غير مكتملة.", session = session)
        if (!body.has("hasMore")) {
            return HomeFeedResult.Failure("استجابة الرئيسية غير مكتملة.", session = session)
        }

        val items = buildList {
            for (index in 0 until rawItems.length()) {
                val row = rawItems.optJSONObject(index) ?: continue
                val id = row.optString("id").trim()
                if (id.isBlank()) continue
                add(
                    HomeFeedItem(
                        id = id,
                        title = nullable(row, "title") ?: "عنصر بدون عنوان",
                        description = nullable(row, "description"),
                        coverImageUrl = nullable(row, "coverImageUrl"),
                        category = nullable(row, "category"),
                        condition = nullable(row, "condition"),
                        city = nullable(row, "city"),
                        ownerDisplayName = nullable(row, "ownerDisplayName"),
                        createdAt = nullable(row, "createdAt"),
                    ),
                )
            }
        }

        return HomeFeedResult.Success(
            value = HomeFeedPage(items = items, hasMore = body.optBoolean("hasMore", false)),
            session = session,
        )
    }

    private fun parseDetail(body: JSONObject, session: AuthSession): HomeFeedResult<ItemDetail> {
        val id = body.optString("id").trim()
        if (id.isBlank()) {
            return HomeFeedResult.Failure("استجابة تفاصيل العنصر غير مكتملة.", session = session)
        }

        val images = buildList {
            val raw = body.optJSONArray("images")
            if (raw != null) {
                for (index in 0 until raw.length()) {
                    val row = raw.optJSONObject(index) ?: continue
                    nullable(row, "imageUrl")?.let(::add)
                }
            }
        }
        val owner = body.optJSONObject("ownerPresence")

        return HomeFeedResult.Success(
            value = ItemDetail(
                id = id,
                ownerId = nullable(body, "ownerId"),
                title = nullable(body, "title") ?: "عنصر بدون عنوان",
                description = nullable(body, "description"),
                condition = nullable(body, "condition"),
                conditionNotes = nullable(body, "conditionNotes"),
                category = nullable(body, "category"),
                city = nullable(body, "city"),
                area = nullable(body, "area"),
                images = images,
                ownerDisplayName = owner?.let { nullable(it, "displayName") },
                ownerUsername = owner?.let { nullable(it, "username") },
                desireText = nullable(body, "desireText"),
                itemStory = nullable(body, "itemStory"),
                swapReason = nullable(body, "swapReason"),
                goodFor = nullable(body, "goodFor"),
            ),
            session = session,
        )
    }

    private fun AuthResult.Failure.toHomeFailure(): HomeFeedResult.Failure {
        return HomeFeedResult.Failure(
            message = message,
            network = reason == AuthResult.Reason.NETWORK,
            unauthorized = reason == AuthResult.Reason.SESSION_EXPIRED,
        )
    }

    private fun expired(message: String, session: AuthSession) = HomeFeedResult.Failure(
        message = message,
        unauthorized = true,
        session = session,
    )

    private fun nullable(body: JSONObject, key: String): String? {
        if (!body.has(key) || body.isNull(key)) return null
        return body.optString(key).trim().takeIf { it.isNotEmpty() }
    }

    private companion object {
        val UUID_LIKE = Regex("^[0-9a-fA-F-]{36}$")
    }
}
