package com.teswa.mobile.feature.stories

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.media.BinaryUploadRequest
import com.teswa.mobile.core.media.BinaryUploadResult
import com.teswa.mobile.core.media.BinaryUploader
import com.teswa.mobile.core.media.StreamingBinaryUploader
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import org.json.JSONObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import com.teswa.mobile.feature.voice.VoiceDraft
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult

interface StoryRepository {
    suspend fun loadHome(session: AuthSession): StoryResult<List<StoryGroup>>
    suspend fun prepareViewer(session: AuthSession, group: StoryGroup): StoryResult<StoryViewer>
    suspend fun markViewed(session: AuthSession, storyId: String): StoryResult<Unit>
    suspend fun setLiked(session: AuthSession, storyId: String, liked: Boolean): StoryResult<Boolean>
    suspend fun reply(session: AuthSession, storyId: String, body: String): StoryResult<StoryReplyReceipt>
    suspend fun replyVoice(session: AuthSession, storyId: String, draft: VoiceDraft, onProgress: (Int) -> Unit = {}): StoryResult<StoryReplyReceipt> =
        StoryResult.Failure("الرد الصوتي غير متاح الآن.", session)
    suspend fun publish(
        session: AuthSession,
        draft: StoryDraft,
        onProgress: (StoryPublishProgress) -> Unit,
    ): StoryResult<String>
    suspend fun loadOwned(session: AuthSession): StoryResult<List<ManagedStory>>
    suspend fun deleteOwned(
        session: AuthSession,
        story: StoryRecord,
    ): StoryResult<StoryDeleteOutcome>
    suspend fun loadViewers(
        session: AuthSession,
        storyId: String,
    ): StoryResult<StoryViewersContext?>
}

class OracleStoryRepository(
    authenticator: SessionAuthenticator,
    transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val contentSource: StoryContentSource = StoryContentSource { error("Story content source is unavailable.") },
    private val binaryUploader: BinaryUploader = StreamingBinaryUploader(),
    private val voiceMediaRepository: VoiceMediaRepository? = null,
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

    override suspend fun replyVoice(
        session: AuthSession,
        storyId: String,
        draft: VoiceDraft,
        onProgress: (Int) -> Unit,
    ): StoryResult<StoryReplyReceipt> {
        val id = storyId.validId() ?: return StoryResult.Failure("معرّف القصة غير صالح.", session)
        val media = voiceMediaRepository ?: return StoryResult.Failure("الرد الصوتي غير متاح الآن.", session)
        val ensured = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/contextual/stories/$id/ensure", JSONObject()),
        )
        if (ensured !is AuthenticatedOracleResult.Response) return ensured.failure("تعذر تجهيز رد القصة الآن.")
        if (ensured.value.status == 401) return expired(ensured.session)
        val conversationId = ensured.value.body.optString("conversationId").validId()
            ?: return StoryResult.Failure("تعذر تجهيز محادثة القصة.", ensured.session)
        val uploaded = media.upload(
            ensured.session,
            "contextual_voice",
            "contextual/$conversationId/${session.user.id}",
            draft,
            onProgress,
        )
        if (uploaded is VoiceMediaResult.Failure) {
            return StoryResult.Failure(uploaded.message, uploaded.session, uploaded.unauthorized, uploaded.network)
        }
        uploaded as VoiceMediaResult.Success
        val voice = uploaded.value
        val body = JSONObject()
            .put("senderId", session.user.id)
            .put("mediaStoragePath", voice.objectKey)
            .put("mediaDurationMs", voice.durationMs)
        val sent = executor.execute(
            uploaded.session,
            OracleRequest(OracleHttpMethod.POST, "/v1/contextual/conversations/$conversationId/voice", body),
        )
        if (sent !is AuthenticatedOracleResult.Response) {
            val failure = sent.failure("تعذر إرسال الرد الصوتي الآن.")
            val cleaned = media.discard(failure.session ?: uploaded.session, "contextual_voice", voice)
            return failure.copy(session = cleaned)
        }
        val messageId = sent.value.body.optString("id").validId()
        if (sent.value.status != 201 || messageId == null) {
            val cleaned = media.discard(sent.session, "contextual_voice", voice)
            return if (sent.value.status == 401) expired(cleaned)
            else StoryResult.Failure("تعذر إرسال الرد الصوتي (${sent.value.status}).", cleaned)
        }
        val notify = executor.execute(
            sent.session,
            OracleRequest(
                OracleHttpMethod.POST,
                "/v1/contextual/notifications",
                JSONObject().put("conversationId", conversationId).put("messageId", messageId).put("kind", "story_reply_initial"),
            ),
        )
        val updated = when (notify) {
            is AuthenticatedOracleResult.Response -> notify.session
            is AuthenticatedOracleResult.NetworkFailure -> notify.session ?: sent.session
            is AuthenticatedOracleResult.InvalidResponse -> notify.session ?: sent.session
            is AuthenticatedOracleResult.SessionFailure -> sent.session
        }
        return StoryResult.Success(StoryReplyReceipt(conversationId, messageId), updated)
    }

    override suspend fun publish(
        session: AuthSession,
        draft: StoryDraft,
        onProgress: (StoryPublishProgress) -> Unit,
    ): StoryResult<String> {
        draft.validate()?.let { return StoryResult.Failure(it, session) }
        val media = requireNotNull(draft.media)
        val objectKey = "${session.user.id}/${java.util.UUID.randomUUID()}.${extension(media)}"
        val objectBody = mediaObject(objectKey, media.contentType, media.sizeBytes)
        var activeSession = session
        var granted = false
        try {
            val grant = executor.execute(
                activeSession,
                OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads", objectBody),
            )
            val uploadUrl = when (grant) {
                is AuthenticatedOracleResult.Response -> {
                    activeSession = grant.session
                    if (grant.value.status == 401) return expired(grant.session)
                    if (grant.value.status != 201) {
                        return StoryResult.Failure("تعذر تجهيز رفع القصة (${grant.value.status}).", grant.session)
                    }
                    grant.value.body.optString("uploadUrl").takeIf { it.startsWith("https://") }
                        ?: return StoryResult.Failure("الخادم أعاد تصريح رفع غير صالح.", grant.session)
                }
                else -> return grant.failure("تعذر تجهيز رفع القصة الآن.")
            }
            granted = true
            val upload = binaryUploader.upload(
                BinaryUploadRequest(
                    uploadUrl = uploadUrl,
                    contentType = media.contentType,
                    sizeBytes = media.sizeBytes,
                    openStream = { contentSource.open(media) },
                    onProgress = { sent, total ->
                        val percent = if (total <= 0L) 0 else ((sent * 100L) / total).toInt().coerceIn(0, 100)
                        onProgress(StoryPublishProgress.Uploading(percent))
                    },
                ),
            )
            if (upload is BinaryUploadResult.Failure) {
                onProgress(StoryPublishProgress.CleaningUp)
                val cleaned = cleanup(activeSession, objectBody)
                return StoryResult.Failure(
                    if (cleaned.second) "تعذر رفع وسائط القصة. حاول تاني."
                    else "تعذر رفع القصة وتنظيف الملف المؤقت بأمان.",
                    cleaned.first,
                    network = upload.retryable,
                )
            }
            when (
                val complete = executor.execute(
                    activeSession,
                    OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads/complete", objectBody),
                )
            ) {
                is AuthenticatedOracleResult.Response -> {
                    activeSession = complete.session
                    if (complete.value.status == 401) {
                        cleanup(activeSession, objectBody)
                        return expired(activeSession)
                    }
                    if (complete.value.status != 200 || complete.value.body.optString("objectKey") != objectKey) {
                        cleanup(activeSession, objectBody)
                        return StoryResult.Failure("تعذر تثبيت وسائط القصة.", activeSession)
                    }
                }
                else -> {
                    val failure = complete.failure("تعذر تثبيت وسائط القصة الآن.")
                    val cleaned = cleanup(failure.session ?: activeSession, objectBody)
                    return failure.copy(session = cleaned.first)
                }
            }
            onProgress(StoryPublishProgress.Saving)
            val createBody = JSONObject()
                .put("userId", activeSession.user.id)
                .put("mediaType", media.mediaType)
                .put("mediaStoragePath", objectKey)
                .put("mediaThumbnailStoragePath", JSONObject.NULL)
                .putNullable("caption", draft.caption.trim().takeIf(String::isNotEmpty))
                .putNullable("durationMs", if (media.mediaType == "video") media.durationMs else null)
                .putNullable("width", media.width)
                .putNullable("height", media.height)
            return when (
                val create = executor.execute(
                    activeSession,
                    OracleRequest(OracleHttpMethod.POST, "/v1/stories", createBody),
                )
            ) {
                is AuthenticatedOracleResult.Response -> {
                    activeSession = create.session
                    val storyId = create.value.body.optString("storyId").validId()
                    if (create.value.status == 201 && storyId != null) {
                        StoryResult.Success(storyId, activeSession)
                    } else {
                        onProgress(StoryPublishProgress.CleaningUp)
                        val cleaned = cleanup(activeSession, objectBody)
                        StoryResult.Failure("تم رفع الوسائط لكن تعذر نشر القصة.", cleaned.first)
                    }
                }
                else -> {
                    val failure = create.failure("تعذر نشر القصة الآن.")
                    onProgress(StoryPublishProgress.CleaningUp)
                    val cleaned = cleanup(failure.session ?: activeSession, objectBody)
                    failure.copy(session = cleaned.first)
                }
            }
        } catch (cancelled: CancellationException) {
            if (granted) withContext(NonCancellable) { cleanup(activeSession, objectBody) }
            throw cancelled
        }
    }

    override suspend fun loadOwned(session: AuthSession): StoryResult<List<ManagedStory>> {
        var activeSession = session
        val stories: List<StoryRecord> = when (
            val result = executor.execute(
                activeSession,
                OracleRequest(path = "/v1/stories/users/${session.user.id}/active"),
            )
        ) {
            is AuthenticatedOracleResult.Response -> {
                activeSession = result.session
                if (result.value.status == 401) return expired(result.session)
                val raw = result.value.body.optJSONArray("items")
                    ?: return StoryResult.Failure("استجابة قصصك غير مكتملة.", result.session)
                buildList<StoryRecord> {
                    for (index in 0 until raw.length()) {
                        val parsed = raw.optJSONObject(index)?.let(::story)
                        if (parsed != null) add(parsed)
                    }
                }
            }
            else -> return result.failure("تعذر تحميل قصصك الآن.")
        }
        if (stories.isEmpty()) return StoryResult.Success(emptyList(), activeSession)
        val ids = stories.joinToString(",") { it.id }
        var viewCounts: Map<String, Int>? = null
        var likeCounts: Map<String, Int>? = null
        when (
            val result = executor.execute(
                activeSession,
                OracleRequest(path = "/v1/stories/views/counts?ids=$ids"),
            )
        ) {
            is AuthenticatedOracleResult.Response -> {
                activeSession = result.session
                if (result.value.status == 401) return expired(result.session)
                if (result.value.status == 200) viewCounts = result.value.body.optJSONObject("values")?.let(::intMap)
            }
            is AuthenticatedOracleResult.SessionFailure ->
                return StoryResult.Failure(
                    result.failure.message,
                    unauthorized = result.failure.reason == AuthResult.Reason.SESSION_EXPIRED,
                )
            else -> Unit
        }
        when (
            val result = executor.execute(
                activeSession,
                OracleRequest(path = "/v1/stories/likes/counts?ids=$ids"),
            )
        ) {
            is AuthenticatedOracleResult.Response -> {
                activeSession = result.session
                if (result.value.status == 401) return expired(result.session)
                if (result.value.status == 200) likeCounts = result.value.body.optJSONObject("values")?.let(::intMap)
            }
            is AuthenticatedOracleResult.SessionFailure ->
                return StoryResult.Failure(
                    result.failure.message,
                    unauthorized = result.failure.reason == AuthResult.Reason.SESSION_EXPIRED,
                )
            else -> Unit
        }
        val managed = mutableListOf<ManagedStory>()
        for (story in stories) {
                val signBody = JSONObject()
                    .put("purpose", "story_media")
                    .put("objectKey", story.mediaStoragePath)
                    .put("contentType", JSONObject.NULL)
                    .put("sizeBytes", 1)
                    .put("expiresInSeconds", 3_600)
                val signedUrl = when (
                    val result = executor.execute(
                        activeSession,
                        OracleRequest(OracleHttpMethod.POST, "/v1/media/signed-url", signBody),
                    )
                ) {
                    is AuthenticatedOracleResult.Response -> {
                        activeSession = result.session
                        if (result.value.status == 401) return expired(result.session)
                        result.value.body.optString("signedUrl").takeIf {
                            result.value.status == 200 && it.startsWith("https://")
                        }
                    }
                    is AuthenticatedOracleResult.SessionFailure ->
                        return StoryResult.Failure(
                            result.failure.message,
                            unauthorized = result.failure.reason == AuthResult.Reason.SESSION_EXPIRED,
                        )
                    else -> null
                }
            managed += ManagedStory(story, signedUrl, viewCounts?.get(story.id), likeCounts?.get(story.id))
        }
        return StoryResult.Success(managed, activeSession)
    }

    override suspend fun deleteOwned(
        session: AuthSession,
        story: StoryRecord,
    ): StoryResult<StoryDeleteOutcome> {
        val id = story.id.validId() ?: return StoryResult.Failure("معرّف القصة غير صالح.", session)
        return when (
            val result = executor.execute(
                session,
                OracleRequest(
                    OracleHttpMethod.POST,
                    "/v1/stories/$id/delete",
                    JSONObject().put("userId", session.user.id),
                ),
            )
        ) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("storagePaths")
                        ?: return StoryResult.Failure("استجابة حذف القصة غير مكتملة.", result.session)
                    val paths = buildList {
                        for (index in 0 until raw.length()) {
                            raw.optString(index).trim().takeIf(String::isNotEmpty)?.let(::add)
                        }
                    }
                    if (paths.isEmpty()) {
                        StoryResult.Success(StoryDeleteOutcome(true), result.session)
                    } else {
                        val objects = org.json.JSONArray()
                        paths.forEach { path ->
                            objects.put(
                                JSONObject()
                                    .put("purpose", "story_media")
                                    .put("objectKey", path)
                                    .put("contentType", JSONObject.NULL)
                                    .put("sizeBytes", JSONObject.NULL),
                            )
                        }
                        when (
                            val cleanup = executor.execute(
                                result.session,
                                OracleRequest(
                                    OracleHttpMethod.DELETE,
                                    "/v1/media/objects",
                                    JSONObject().put("objects", objects),
                                ),
                            )
                        ) {
                            is AuthenticatedOracleResult.Response ->
                                StoryResult.Success(
                                    StoryDeleteOutcome(
                                        cleanup.value.status == 200 &&
                                            cleanup.value.body.optInt("deleted") == paths.size,
                                    ),
                                    cleanup.session,
                                )
                            is AuthenticatedOracleResult.NetworkFailure ->
                                StoryResult.Success(StoryDeleteOutcome(false), cleanup.session ?: result.session)
                            is AuthenticatedOracleResult.InvalidResponse ->
                                StoryResult.Success(StoryDeleteOutcome(false), cleanup.session ?: result.session)
                            is AuthenticatedOracleResult.SessionFailure ->
                                StoryResult.Success(StoryDeleteOutcome(false), result.session)
                        }
                    }
                }
                401 -> expired(result.session)
                404 -> StoryResult.Failure("القصة لم تعد موجودة.", result.session)
                else -> StoryResult.Failure("تعذر حذف القصة (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر حذف القصة الآن.")
        }
    }

    override suspend fun loadViewers(
        session: AuthSession,
        storyId: String,
    ): StoryResult<StoryViewersContext?> {
        val id = storyId.validId() ?: return StoryResult.Failure("معرّف القصة غير صالح.", session)
        val path = "/v1/stories/$id/viewers?ownerId=${session.user.id}"
        return when (val result = executor.execute(session, OracleRequest(path = path))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    if (!result.value.body.has("item") || result.value.body.isNull("item")) {
                        StoryResult.Success(null, result.session)
                    } else {
                        val item = result.value.body.optJSONObject("item")
                        val context = item?.let(::viewersContext)
                            ?: return StoryResult.Failure("استجابة مشاهدي القصة غير مكتملة.", result.session)
                        StoryResult.Success(context, result.session)
                    }
                }
                401 -> expired(result.session)
                403 -> StoryResult.Failure("قائمة المشاهدين متاحة لصاحب القصة فقط.", result.session)
                else -> StoryResult.Failure("تعذر تحميل المشاهدين (${result.value.status}).", result.session)
            }
            else -> result.failure("تعذر تحميل المشاهدين الآن.")
        }
    }

    private suspend fun cleanup(session: AuthSession, objectBody: JSONObject): Pair<AuthSession, Boolean> {
        val body = JSONObject().put("objects", org.json.JSONArray().put(objectBody))
        return when (
            val result = executor.execute(
                session,
                OracleRequest(OracleHttpMethod.DELETE, "/v1/media/objects", body),
            )
        ) {
            is AuthenticatedOracleResult.Response ->
                result.session to (result.value.status == 200 && result.value.body.optInt("deleted") == 1)
            is AuthenticatedOracleResult.NetworkFailure -> (result.session ?: session) to false
            is AuthenticatedOracleResult.InvalidResponse -> (result.session ?: session) to false
            is AuthenticatedOracleResult.SessionFailure -> session to false
        }
    }

    private fun mediaObject(objectKey: String, contentType: String, sizeBytes: Long) =
        JSONObject()
            .put("purpose", "story_media")
            .put("objectKey", objectKey)
            .put("contentType", contentType)
            .put("sizeBytes", sizeBytes)

    private fun extension(media: StoryMediaSelection): String {
        val fromName = media.displayName.substringAfterLast('.', "").lowercase().takeIf { it.matches(EXTENSION) }
        return fromName ?: when (media.contentType) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            "video/quicktime" -> "mov"
            "video/mp4" -> "mp4"
            else -> "jpg"
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

    private fun viewersContext(row: JSONObject): StoryViewersContext? {
        val storyId = row.optString("storyId").validId() ?: return null
        val createdAt = row.optString("storyCreatedAt").trim().takeIf(String::isNotEmpty) ?: return null
        val raw = row.optJSONArray("viewers") ?: return null
        val viewers = buildList {
            for (index in 0 until raw.length()) {
                val viewer = raw.optJSONObject(index) ?: continue
                val userId = viewer.optString("viewerId").validId() ?: continue
                val viewedAt = viewer.optString("viewedAt").trim().takeIf(String::isNotEmpty) ?: continue
                add(
                    StoryViewerPerson(
                        userId,
                        nullable(viewer, "displayName"),
                        nullable(viewer, "username"),
                        nullable(viewer, "avatarUrl"),
                        viewedAt,
                    ),
                )
            }
        }
        return StoryViewersContext(storyId, createdAt, nullable(row, "storyCaption"), viewers)
    }

    private fun booleanMap(row: JSONObject): Map<String, Boolean> = buildMap {
        row.keys().forEach { key -> if (key.validId() != null && row.opt(key) is Boolean) put(key, row.optBoolean(key)) }
    }

    private fun intMap(row: JSONObject): Map<String, Int> = buildMap {
        row.keys().forEach { key ->
            if (key.validId() != null && row.opt(key) is Number) put(key, row.optInt(key).coerceAtLeast(0))
        }
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

    private fun JSONObject.putNullable(key: String, value: Any?) = put(key, value ?: JSONObject.NULL)

    private companion object {
        val UUID = Regex("^[0-9a-fA-F-]{36}$")
        val EXTENSION = Regex("^[a-z0-9]{1,8}$")
    }
}
