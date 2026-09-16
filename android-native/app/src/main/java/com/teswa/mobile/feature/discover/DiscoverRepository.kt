package com.teswa.mobile.feature.discover

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import org.json.JSONObject

interface DiscoverRepository {
    suspend fun loadPage(
        session: AuthSession,
        filters: DiscoverFilters,
        offset: Int = 0,
        limit: Int = 20,
    ): DiscoverResult<DiscoverPage>

    suspend fun loadNearby(
        session: AuthSession,
        latitude: Double,
        longitude: Double,
        offset: Int = 0,
        limit: Int = 20,
    ): DiscoverResult<DiscoverPage>

    suspend fun loadCategories(session: AuthSession): DiscoverResult<List<DiscoverCategory>>
    suspend fun loadPeoplePreview(session: AuthSession, limit: Int = 4): DiscoverResult<List<DiscoverPersonPreview>>
}

class OracleDiscoverRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : DiscoverRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun loadPage(
        session: AuthSession,
        filters: DiscoverFilters,
        offset: Int,
        limit: Int,
    ): DiscoverResult<DiscoverPage> {
        val safe = filters.normalized()
        val query = buildList {
            add("offset=${offset.coerceAtLeast(0)}")
            add("limit=${limit.coerceIn(1, 40)}")
            safe.query.takeIf(String::isNotBlank)?.let { add("query=${it.encoded()}") }
            safe.category?.let { add("category=${it.encoded()}") }
            safe.condition?.let { add("condition=${it.encoded()}") }
            safe.city?.let { add("city=${it.encoded()}") }
        }.joinToString("&")
        return readPage(session, "/v1/marketplace/feed?$query", "تعذر تحميل الاكتشاف الآن.")
    }

    override suspend fun loadNearby(
        session: AuthSession,
        latitude: Double,
        longitude: Double,
        offset: Int,
        limit: Int,
    ): DiscoverResult<DiscoverPage> {
        if (!latitude.isFinite() || latitude !in -90.0..90.0 || !longitude.isFinite() || longitude !in -180.0..180.0) {
            return DiscoverResult.Failure("الموقع غير صالح.", session)
        }
        val path = "/v1/marketplace/nearby?latitude=$latitude&longitude=$longitude&radiusKm=3&offset=${offset.coerceAtLeast(0)}&limit=${limit.coerceIn(1, 40)}"
        return readPage(session, path, "تعذر تحميل العناصر القريبة الآن.")
    }

    override suspend fun loadCategories(session: AuthSession): DiscoverResult<List<DiscoverCategory>> {
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/marketplace/categories"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val rows = result.value.body.optJSONArray("items")
                        ?: return DiscoverResult.Failure("استجابة التصنيفات غير مكتملة.", result.session)
                    val values = buildList {
                        for (index in 0 until rows.length()) {
                            val row = rows.optJSONObject(index) ?: continue
                            val id = row.optString("id").trim()
                            val name = row.optString("nameAr").trim()
                            if (id.isNotBlank() && name.isNotBlank()) add(DiscoverCategory(id, name))
                        }
                    }
                    DiscoverResult.Success(values, result.session)
                }
                401 -> expired(result.session)
                else -> DiscoverResult.Failure("تعذر تحميل التصنيفات (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل التصنيفات الآن.")
        }
    }

    override suspend fun loadPeoplePreview(session: AuthSession, limit: Int): DiscoverResult<List<DiscoverPersonPreview>> {
        val pageSize = limit.coerceIn(1, 8)
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/people?query=&page=1&pageSize=$pageSize"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val rows = result.value.body.optJSONArray("entries")
                        ?: return DiscoverResult.Failure("استجابة ناس تِسوى غير مكتملة.", result.session)
                    val values = buildList {
                        for (index in 0 until rows.length()) {
                            val row = rows.optJSONObject(index) ?: continue
                            parsePerson(row)?.let(::add)
                        }
                    }
                    DiscoverResult.Success(values, result.session)
                }
                401 -> expired(result.session)
                else -> DiscoverResult.Failure("تعذر تحميل ناس تِسوى (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل ناس تِسوى الآن.")
        }
    }

    private suspend fun readPage(session: AuthSession, path: String, failureMessage: String): DiscoverResult<DiscoverPage> {
        return when (val result = executor.execute(session, OracleRequest(path = path))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parsePage(result.value.body, result.session)
                401 -> expired(result.session)
                else -> DiscoverResult.Failure("$failureMessage (${result.value.status})", result.session)
            }
            else -> result.failure(failureMessage)
        }
    }

    private fun parsePage(body: JSONObject, session: AuthSession): DiscoverResult<DiscoverPage> {
        val rows = body.optJSONArray("items")
            ?: return DiscoverResult.Failure("استجابة الاكتشاف غير مكتملة.", session)
        if (!body.has("hasMore")) return DiscoverResult.Failure("استجابة الاكتشاف غير مكتملة.", session)
        val items = buildList {
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                val id = row.optString("id").trim()
                if (id.isBlank()) continue
                val distance = row.optDouble("distanceKm", Double.NaN).takeIf { it.isFinite() }
                add(
                    DiscoverItem(
                        id = id,
                        title = nullable(row, "title") ?: "عنصر بدون عنوان",
                        description = nullable(row, "description"),
                        imageUrl = nullable(row, "coverImageUrl"),
                        category = nullable(row, "category"),
                        condition = nullable(row, "condition"),
                        city = nullable(row, "city"),
                        ownerDisplayName = nullable(row, "ownerDisplayName"),
                        createdAt = nullable(row, "createdAt"),
                        distanceKm = distance,
                    ),
                )
            }
        }
        return DiscoverResult.Success(DiscoverPage(items, body.optBoolean("hasMore", false)), session)
    }

    private fun parsePerson(row: JSONObject): DiscoverPersonPreview? {
        val id = row.optString("id").trim().takeIf(String::isNotEmpty) ?: return null
        val displayName = row.optString("displayName").trim().takeIf(String::isNotEmpty) ?: return null
        val username = row.optString("username").trim().takeIf(String::isNotEmpty) ?: return null
        return DiscoverPersonPreview(
            id = id,
            displayName = displayName,
            username = username,
            avatarUrl = nullable(row, "avatarUrl"),
            city = nullable(row, "city"),
            area = nullable(row, "area"),
            successfulSwapsCount = row.optInt("successfulSwapsCount", 0).coerceAtLeast(0),
            activeItemsCount = row.optInt("activeItemsCount", 0).coerceAtLeast(0),
        )
    }

    private fun AuthenticatedOracleResult.failure(message: String): DiscoverResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> DiscoverResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> DiscoverResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> DiscoverResult.Failure(
            failure.message,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
            network = failure.reason == AuthResult.Reason.NETWORK,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses must be handled by caller")
    }

    private fun expired(session: AuthSession) = DiscoverResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private fun nullable(body: JSONObject, key: String): String? =
        if (!body.has(key) || body.isNull(key)) null else body.optString(key).trim().takeIf(String::isNotEmpty)

    private fun String.encoded(): String = URLEncoder.encode(this, StandardCharsets.UTF_8.name())
}
