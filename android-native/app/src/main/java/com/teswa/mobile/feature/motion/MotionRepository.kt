package com.teswa.mobile.feature.motion

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

interface MotionRepository {
    suspend fun loadMoving(session: AuthSession, limit: Int = 12): MotionResult<List<MotionMovingItem>>
    suspend fun loadStoryItems(session: AuthSession, limit: Int = 12): MotionResult<List<MotionStoryItem>>
    suspend fun loadVideoDrops(session: AuthSession, limit: Int = 8): MotionResult<List<MotionVideoDrop>>
    suspend fun loadCityPulse(
        session: AuthSession,
        location: MotionCityLocation,
        movingLimit: Int = 8,
        storyLimit: Int = 8,
        peopleLimit: Int = 8,
        storyAuthorsLimit: Int = 10,
    ): MotionResult<MotionCityPulse>
}

class OracleMotionRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : MotionRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun loadMoving(session: AuthSession, limit: Int): MotionResult<List<MotionMovingItem>> =
        readItems(session, "/v1/marketplace/moving?limit=${limit.coerceIn(1, 24)}", "تعذر تحميل العناصر المتحركة الآن.") { row ->
            val id = row.optString("id").trim().takeIf(String::isNotEmpty) ?: return@readItems null
            MotionMovingItem(
                id = id,
                title = nullable(row, "title") ?: "عنصر بدون عنوان",
                imageUrl = nullable(row, "imageUrl"),
                category = nullable(row, "category"),
                condition = nullable(row, "condition"),
                location = nullable(row, "location"),
                ownerDisplayName = nullable(row, "ownerDisplayName"),
                openInterestCount = row.optInt("openInterestCount", 0).coerceAtLeast(0),
                latestInterestAt = nullable(row, "latestInterestAt"),
                hasVideoTeaser = row.optBoolean("hasVideoTeaser", false),
            )
        }

    override suspend fun loadStoryItems(session: AuthSession, limit: Int): MotionResult<List<MotionStoryItem>> =
        readItems(session, "/v1/marketplace/story-discovery?limit=${limit.coerceIn(1, 24)}", "تعذر تحميل حكايات العناصر الآن.") { row ->
            parseStoryItem(row, hasVideo = row.optBoolean("hasVideoTeaser", false))
        }

    override suspend fun loadVideoDrops(session: AuthSession, limit: Int): MotionResult<List<MotionVideoDrop>> =
        readItems(session, "/v1/marketplace/video-discovery?limit=${limit.coerceIn(1, 16)}", "تعذر تحميل لقطات الفيديو الآن.") { row ->
            val id = row.optString("id").trim().takeIf(String::isNotEmpty) ?: return@readItems null
            MotionVideoDrop(
                id = id,
                title = nullable(row, "title") ?: "عنصر بدون عنوان",
                description = nullable(row, "description"),
                imageUrl = nullable(row, "imageUrl"),
                category = nullable(row, "category"),
                condition = nullable(row, "condition"),
                location = nullable(row, "location"),
                ownerDisplayName = nullable(row, "ownerDisplayName"),
                durationMs = row.optInt("videoDurationMs", -1).takeIf { it >= 0 },
                createdAt = nullable(row, "videoCreatedAt"),
            )
        }

    override suspend fun loadCityPulse(
        session: AuthSession,
        location: MotionCityLocation,
        movingLimit: Int,
        storyLimit: Int,
        peopleLimit: Int,
        storyAuthorsLimit: Int,
    ): MotionResult<MotionCityPulse> {
        val terms = normalizeTerms(location.matchTerms)
        if (terms.isEmpty()) return MotionResult.Failure("تعذر تحديد نطاق نبض مدينتك.", session)
        val body = JSONObject()
            .put("matchTerms", JSONArray(terms))
            .put("movingItemsLimit", movingLimit.coerceIn(1, 16))
            .put("storyItemsLimit", storyLimit.coerceIn(1, 16))
            .put("peopleLimit", peopleLimit.coerceIn(1, 16))
            .put("storyAuthorsLimit", storyAuthorsLimit.coerceIn(1, 16))
        return when (val result = executor.execute(session, OracleRequest(OracleHttpMethod.POST, "/v1/discovery/city-pulse", body))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parseCityPulse(result.value.body, location.copy(matchTerms = terms), result.session)
                401 -> expired(result.session)
                else -> MotionResult.Failure("تعذر تحميل نبض مدينتك (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل نبض مدينتك الآن.")
        }
    }

    private suspend fun <T> readItems(
        session: AuthSession,
        path: String,
        message: String,
        parser: (JSONObject) -> T?,
    ): MotionResult<List<T>> {
        return when (val result = executor.execute(session, OracleRequest(path = path))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val rows = result.value.body.optJSONArray("items")
                        ?: return MotionResult.Failure("استجابة النبض غير مكتملة.", result.session)
                    val values = buildList {
                        for (index in 0 until rows.length()) rows.optJSONObject(index)?.let(parser)?.let(::add)
                    }
                    MotionResult.Success(values, result.session)
                }
                401 -> expired(result.session)
                else -> MotionResult.Failure("$message (${result.value.status})", result.session)
            }
            else -> result.failure(message)
        }
    }

    private fun parseCityPulse(body: JSONObject, location: MotionCityLocation, session: AuthSession): MotionResult<MotionCityPulse> {
        val movingRows = body.optJSONArray("movingItems") ?: return incomplete(session)
        val storyRows = body.optJSONArray("storyItems") ?: return incomplete(session)
        val peopleRows = body.optJSONArray("people") ?: return incomplete(session)
        val authorRows = body.optJSONArray("activeStoryAuthors") ?: return incomplete(session)

        val moving = buildList {
            for (index in 0 until movingRows.length()) {
                val row = movingRows.optJSONObject(index) ?: continue
                val id = row.optString("id").trim()
                if (id.isBlank()) continue
                val place = listOfNotNull(nullable(row, "city"), nullable(row, "area")).joinToString(" • ").takeIf(String::isNotBlank)
                add(
                    MotionMovingItem(
                        id = id,
                        title = nullable(row, "title") ?: "عنصر بدون عنوان",
                        imageUrl = nullable(row, "imageUrl"),
                        category = nullable(row, "category"),
                        condition = nullable(row, "condition"),
                        location = place,
                        ownerDisplayName = nullable(row, "ownerDisplayName"),
                        openInterestCount = row.optInt("openInterestCount", 0).coerceAtLeast(0),
                        latestInterestAt = nullable(row, "latestInterestAt"),
                        hasVideoTeaser = false,
                    ),
                )
            }
        }
        val stories = buildList {
            for (index in 0 until storyRows.length()) storyRows.optJSONObject(index)?.let { parseStoryItem(it, false) }?.let(::add)
        }
        val people = buildList {
            for (index in 0 until peopleRows.length()) {
                val row = peopleRows.optJSONObject(index) ?: continue
                val id = row.optString("id").trim()
                val displayName = row.optString("displayName").trim()
                val username = row.optString("username").trim()
                if (id.isBlank() || displayName.isBlank() || username.isBlank()) continue
                add(
                    MotionPulsePerson(
                        id = id,
                        displayName = displayName,
                        username = username,
                        avatarUrl = nullable(row, "avatarUrl"),
                        city = nullable(row, "city"),
                        area = nullable(row, "area"),
                        profileTagline = nullable(row, "profileTagline"),
                        activeItemsCount = row.optInt("activeItemsCount", 0).coerceAtLeast(0),
                    ),
                )
            }
        }
        val authors = buildList {
            for (index in 0 until authorRows.length()) {
                val row = authorRows.optJSONObject(index) ?: continue
                val author = row.optJSONObject("author") ?: continue
                val id = author.optString("id").trim()
                val latest = row.optString("latestCreatedAt").trim()
                if (id.isBlank() || latest.isBlank()) continue
                add(
                    MotionPulseStoryAuthor(
                        id = id,
                        displayName = nullable(author, "displayName"),
                        username = nullable(author, "username"),
                        avatarUrl = nullable(author, "avatarUrl"),
                        storiesCount = row.optInt("storiesCount", 0).coerceAtLeast(0),
                        latestCreatedAt = latest,
                    ),
                )
            }
        }
        return MotionResult.Success(MotionCityPulse(location, moving, stories, people, authors), session)
    }

    private fun parseStoryItem(row: JSONObject, hasVideo: Boolean): MotionStoryItem? {
        val id = row.optString("id").trim().takeIf(String::isNotEmpty) ?: return null
        return MotionStoryItem(
            id = id,
            title = nullable(row, "title") ?: "عنصر بدون عنوان",
            imageUrl = nullable(row, "imageUrl"),
            category = nullable(row, "category"),
            city = nullable(row, "city"),
            area = nullable(row, "area"),
            ownerId = nullable(row, "ownerId"),
            ownerDisplayName = nullable(row, "ownerDisplayName"),
            storyLabel = nullable(row, "storyLabel") ?: "حكاية العنصر",
            storySnippet = nullable(row, "storySnippet") ?: "",
            createdAt = nullable(row, "createdAt"),
            hasVideoTeaser = hasVideo,
        )
    }

    private fun normalizeTerms(values: List<String>): List<String> {
        val seen = linkedSetOf<String>()
        values.forEach { raw ->
            val value = raw.trim().lowercase()
            if (value.isNotEmpty() && seen.size < 6) seen += value
        }
        return seen.toList()
    }

    private fun incomplete(session: AuthSession): MotionResult.Failure = MotionResult.Failure("استجابة نبض المدينة غير مكتملة.", session)

    private fun AuthenticatedOracleResult.failure(message: String): MotionResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> MotionResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> MotionResult.Failure("الخادم أعاد استجابة غير صالحة للنبض.", session)
        is AuthenticatedOracleResult.SessionFailure -> MotionResult.Failure(
            failure.message,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
            network = failure.reason == AuthResult.Reason.NETWORK,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses must be handled by caller")
    }

    private fun expired(session: AuthSession) = MotionResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private fun nullable(body: JSONObject, key: String): String? =
        if (!body.has(key) || body.isNull(key)) null else body.optString(key).trim().takeIf(String::isNotEmpty)
}
