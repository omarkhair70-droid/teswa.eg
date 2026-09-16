package com.teswa.mobile.feature.stories

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

interface StoryRepository {
    suspend fun loadHome(session: AuthSession): StoryResult<List<StoryGroup>>
    suspend fun prepareViewer(session: AuthSession, group: StoryGroup): StoryResult<StoryViewer>
    suspend fun markViewed(session: AuthSession, storyId: String): StoryResult<Unit>
    suspend fun setLiked(session: AuthSession, storyId: String, liked: Boolean): StoryResult<Boolean>
    suspend fun reply(session: AuthSession, storyId: String, body: String): StoryResult<StoryReplyReceipt>
}

class OracleStoryRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
) : StoryRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun loadHome(session: AuthSession): StoryResult<List<StoryGroup>> =
        when (val result = executor.execute(session, OracleRequest(path = "/v1/stories/home"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return StoryResult.Failure("استجابة القصص غير مكتملة.", result.session)
                    val groups = buildList {
                        for (index in 0 until raw.length()) raw.optJSONObject(index)?.let(::group)?.let(::add)
                    }
                    StoryResult.Success(groups, result.session)
                }
                401 -> expired(result.session)
                else -> StoryResult.Failure("تعذر تحميل القصص (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل القصص الآن.")
        }

    override suspend fun prepareViewer(session: AuthSession, group: StoryGroup): StoryResult<StoryViewer> {
        if (group.stories.isEmpty()) return StoryResult.Failure("القصة لم تعد متاحة.", session)
        var currentSession = session
        val ids = group.stories.joinToString(",") { it.id }
        val likePath = "/v1/stories/likes?viewerId=${session.user.id}&ids=$ids"
        val liked = when (val result = executor.execute(currentSession, OracleRequest(path = likePath))) {
            is AuthenticatedOracleResult.Response -> {
                currentSession = result.session
                if (result.value.status == 401) return expired(result.session)
                result.value.body.optJSONObject("values")?.let(::booleanMap).orEmpty()
            }
            is AuthenticatedOracleResult.SessionFailure ->
                return StoryResult.Failure(
                    result.failure.message,
                    unauthorized = result.failure.reason == AuthResult.Reason.SESSION_EXPIRED,
                )
            else -> emptyMap()
        }
        val slides = buildList {
            for (story in group.stories) {
                val body = JSONObject()
                    .put("purpose", "story_media")
                    .put("objectKey", story.mediaStoragePath)
                    .put("contentType", JSONObject.NULL)
                    .put("sizeBytes", 1)
                    .put("expiresInSeconds", 3_600)
                val signedUrl = when (
                    val result = executor.execute(
                        currentSession,
                        OracleRequest(OracleHttpMethod.POST, "/v1/media/signed-url", body),
                    )
                ) {
                    is AuthenticatedOracleResult.Response -> {
                        currentSession = result.session
                        if (result.value.status == 401) return expired(result.session)
                        result.value.body.optString("signedUrl").takeIf { result.value.status == 200 && it.startsWith("https://") }
                    }
                    is AuthenticatedOracleResult.SessionFailure ->
                        return StoryResult.Failure(
                            result.failure.message,
                            unauthorized = result.failure.reason == AuthResult.Reason.SESSION_EXPIRED,
                        )
                    else -> null
                }
                add(StorySlide(story, signedUrl, liked[story.id] == true))
            }
        }
        return StoryResult.Success(StoryViewer(group, slides), currentSession)
    }

    override suspend fun markViewed(session: AuthSession, storyId: String): StoryResult<Unit> =
        booleanWrite(
            session = session,
            storyId = storyId,
            action = "view",
            body = JSONObject().put("viewerId", session.user.id),
            expectedKey = "ok",
            expectedValue = true,
            failureMessage = "تعذر تسجيل مشاهدة القصة.",
        ).unit()

    override suspend fun setLiked(session: AuthSession, storyId: String, liked: Boolean): StoryResult<Boolean> =
        booleanWrite(
            session = session,
            storyId = storyId,
            action = "like",
            body = JSONObject().put("likerId", session.user.id).put("liked", liked),
            expectedKey = "liked",
            expectedValue = liked,
            failureMessage = "تعذر تحديث الإعجاب.",
        )

    override suspend fun reply(session: AuthSession, storyId: String, body: String): StoryResult<StoryReplyReceipt> {
        val id = storyId.validId() ?: return StoryResult.Failure("معرّف القصة غير صالح.", session)
        val clean = body.trim()
        if (clean.isEmpty() || clean.length > 800) {
            return StoryResult.Failure("الرد لازم يكون من 1 إلى 800 حرف.", session)
        }
        val request = OracleRequest(
            OracleHttpMethod.POST,
            "/v1/contextual/stories/$id/reply",
            JSONObject().put("body", clean),
        )
        return when (val result = executor.execute(session, request)) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val conversationId = result.value.body.optString("conversationId").validId()
                    val messageId = result.value.body.optString("messageId").validId()
                    if (conversationId == null || messageId == null) {
                        StoryResult.Failure("استجابة رد القصة غير مكتملة.", result.session)
                    } else {
                        val receipt = StoryReplyReceipt(conversationId, messageId)
                        val notify = executor.execute(
                            result.session,
                            OracleRequest(
                                OracleHttpMethod.POST,
                                "/v1/contextual/notifications",
                                JSONObject()
                                    .put("conversationId", conversationId)
                                    .put("messageId", messageId)
                                    .put("kind", "story_reply_initial"),
                            ),
                        )
                        val updated = when (notify) {
                            is AuthenticatedOracleResult.Response -> notify.session
                            is AuthenticatedOracleResult.NetworkFailure -> notify.session ?: result.session
                            is AuthenticatedOracleResult.InvalidResponse -> notify.session ?: result.session
                            is AuthenticatedOracleResult.SessionFailure -> result.session
                        }
                        StoryResult.Success(receipt, updated)
                    }
                }
                401 -> expired(result.session)
                403 -> StoryResult.Failure("الرد على القصة غير متاح.", result.session)
                404 -> StoryResult.Failure("القصة لم تعد متاحة.", result.session)
                else -> StoryResult.Failure("تعذر إرسال رد القصة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر إرسال رد القصة الآن.")
        }
    }

    private suspend fun booleanWrite(
        session: AuthSession,
        storyId: String,
        action: String,
        body: JSONObject,
        expectedKey: String,
        expectedValue: Boolean,
        failureMessage: String,
    ): StoryResult<Boolean> {
        val id = storyId.validId() ?: return StoryResult.Failure("معرّف القصة غير صالح.", session)
        return when (
            val result = executor.execute(
                session,
                OracleRequest(OracleHttpMethod.POST, "/v1/stories/$id/$action", body),
            )
        ) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 200 && result.value.body.has(expectedKey) &&
                    result.value.body.optBoolean(expectedKey) == expectedValue ->
                    StoryResult.Success(expectedValue, result.session)
                result.value.status == 401 -> expired(result.session)
                else -> StoryResult.Failure(failureMessage, result.session)
            }
            else -> result.failure(failureMessage)
        }
    }

    private fun group(row: JSONObject): StoryGroup? {
        val author = row.optJSONObject("author")?.let(::author) ?: return null
        val rawStories = row.optJSONArray("stories") ?: return null
        val stories = buildList {
            for (index in 0 until rawStories.length()) rawStories.optJSONObject(index)?.let(::story)?.let(::add)
        }
        if (stories.isEmpty()) return null
        val latest = row.optString("latestCreatedAt").trim().takeIf(String::isNotEmpty) ?: return null
        return StoryGroup(author, stories, latest)
    }

    private fun author(row: JSONObject): StoryAuthor? {
        val id = row.optString("id").validId() ?: return null
        return StoryAuthor(id, nullable(row, "displayName"), nullable(row, "username"), nullable(row, "avatarUrl"))
    }

    private fun story(row: JSONObject): StoryRecord? {
        val id = row.optString("id").validId() ?: return null
        val userId = row.optString("userId").validId() ?: return null
        val mediaType = row.optString("mediaType").takeIf { it == "image" || it == "video" } ?: return null
        val path = row.optString("mediaStoragePath").trim().takeIf(String::isNotEmpty) ?: return null
        val createdAt = row.optString("createdAt").trim().takeIf(String::isNotEmpty) ?: return null
        val expiresAt = row.optString("expiresAt").trim().takeIf(String::isNotEmpty) ?: return null
        return StoryRecord(
            id,
            userId,
            mediaType,
            path,
            nullable(row, "caption"),
            row.optIntOrNull("durationMs"),
            row.optIntOrNull("width"),
            row.optIntOrNull("height"),
            createdAt,
            expiresAt,
        )
    }

    private fun booleanMap(row: JSONObject): Map<String, Boolean> = buildMap {
        row.keys().forEach { key -> if (key.validId() != null && row.opt(key) is Boolean) put(key, row.optBoolean(key)) }
    }

    private fun StoryResult<Boolean>.unit(): StoryResult<Unit> = when (this) {
        is StoryResult.Success -> StoryResult.Success(Unit, session)
        is StoryResult.Failure -> this
    }

    private fun AuthenticatedOracleResult.failure(message: String): StoryResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> StoryResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> StoryResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure ->
            StoryResult.Failure(failure.message, unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED)
        is AuthenticatedOracleResult.Response -> error("handled")
    }

    private fun expired(session: AuthSession) =
        StoryResult.Failure("انتهت جلسة تِسوى.", session, unauthorized = true)

    private fun nullable(row: JSONObject, key: String) =
        if (!row.has(key) || row.isNull(key)) null else row.optString(key).trim().takeIf(String::isNotEmpty)

    private fun JSONObject.optIntOrNull(key: String): Int? =
        if (!has(key) || isNull(key) || opt(key) !is Number) null else optInt(key).takeIf { it > 0 }

    private fun String.validId() = trim().takeIf(UUID::matches)

    private companion object {
        val UUID = Regex("^[0-9a-fA-F-]{36}$")
    }
}
