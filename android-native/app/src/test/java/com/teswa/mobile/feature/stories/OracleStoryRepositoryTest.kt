package com.teswa.mobile.feature.stories

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleResponse
import com.teswa.mobile.core.network.OracleTransport
import com.teswa.mobile.core.network.OracleTransportResult
import com.teswa.mobile.core.media.BinaryUploadResult
import com.teswa.mobile.core.media.BinaryUploader
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import com.teswa.mobile.feature.voice.UploadedVoice
import com.teswa.mobile.feature.voice.VoiceDraft
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult

class OracleStoryRepositoryTest {
    private val me = "11111111-1111-1111-1111-111111111111"
    private val authorId = "22222222-2222-2222-2222-222222222222"
    private val storyId = "33333333-3333-3333-3333-333333333333"
    private val conversationId = "44444444-4444-4444-4444-444444444444"
    private val messageId = "55555555-5555-5555-5555-555555555555"
    private val session = AuthSession("token", "refresh", 9_999_999_999L, AuthUser(me, null, null, null, null))
    private val auth = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun parsesHomeGroupsAndStories() = runBlocking {
        val transport = StoryQueue(response(200, homePayload()))

        val result = OracleStoryRepository(auth, transport).loadHome(session) as StoryResult.Success

        assertEquals("سلمى", result.value.single().author.displayName)
        assertEquals(storyId, result.value.single().stories.single().id)
        assertEquals("/v1/stories/home", transport.requests.single().path)
    }

    @Test
    fun preparesViewerWithExactLikeAndSignedUrlContracts() = runBlocking {
        val group = group()
        val transport = StoryQueue(
            response(200, JSONObject().put("values", JSONObject().put(storyId, true))),
            response(200, JSONObject().put("signedUrl", "https://object.example/story")),
        )

        val result = OracleStoryRepository(auth, transport).prepareViewer(session, group) as StoryResult.Success

        assertTrue(result.value.slides.single().liked)
        assertEquals("https://object.example/story", result.value.slides.single().signedUrl)
        assertEquals("/v1/stories/likes?viewerId=$me&ids=$storyId", transport.requests[0].path)
        val signed = requireNotNull(transport.requests[1].body)
        assertEquals(
            setOf("purpose", "objectKey", "contentType", "sizeBytes", "expiresInSeconds"),
            signed.keys().asSequence().toSet(),
        )
        assertEquals("story_media", signed.getString("purpose"))
        assertEquals("$authorId/story.jpg", signed.getString("objectKey"))
    }

    @Test
    fun replyCreatesContextualThreadThenDispatchesInitialNotification() = runBlocking {
        val transport = StoryQueue(
            response(
                200,
                JSONObject().put("conversationId", conversationId).put("messageId", messageId),
            ),
            response(200, JSONObject().put("ok", true)),
        )

        val result = OracleStoryRepository(auth, transport).reply(session, storyId, "  حلوة جدًا  ")

        assertTrue(result is StoryResult.Success)
        assertEquals("/v1/contextual/stories/$storyId/reply", transport.requests[0].path)
        assertEquals("حلوة جدًا", transport.requests[0].body?.getString("body"))
        assertEquals("/v1/contextual/notifications", transport.requests[1].path)
        val notice = requireNotNull(transport.requests[1].body)
        assertEquals(
            setOf("conversationId", "messageId", "kind"),
            notice.keys().asSequence().toSet(),
        )
        assertEquals("story_reply_initial", notice.getString("kind"))
    }

    @Test
    fun voiceReplyEnsuresThreadThenSendsAndNotifies() = runBlocking {
        val key = "contextual/$conversationId/$me/voice.m4a"
        val sent = JSONObject("""{
          "id":"$messageId","conversationId":"$conversationId","senderId":"$me","body":"رسالة صوتية",
          "messageKind":"voice","mediaStoragePath":"$key","mediaDurationMs":1900,"createdAt":"2026-09-15T12:00:00Z"
        }""")
        val transport = StoryQueue(
            response(200, JSONObject().put("conversationId", conversationId)),
            response(201, sent),
            response(200, JSONObject().put("ok", true)),
        )
        val media = StoryVoiceMedia(UploadedVoice(key, 1900, "audio/m4a", 4))
        val repository = OracleStoryRepository(auth, transport, voiceMediaRepository = media)
        val file = File.createTempFile("voice", ".m4a").apply { writeBytes(byteArrayOf(1, 2, 3, 4)) }

        val result = repository.replyVoice(session, storyId, VoiceDraft(file, 1900))

        assertTrue(result is StoryResult.Success)
        assertEquals("contextual_voice", media.purpose)
        assertEquals("contextual/$conversationId/$me", media.prefix)
        assertEquals(
            listOf(
                "/v1/contextual/stories/$storyId/ensure",
                "/v1/contextual/conversations/$conversationId/voice",
                "/v1/contextual/notifications",
            ),
            transport.requests.map { it.path },
        )
        assertEquals("story_reply_initial", transport.requests.last().body?.getString("kind"))
        file.delete()
        Unit
    }

    @Test
    fun publishesStreamingMediaThenCreatesExactStoryEnvelope() = runBlocking {
        val transport = PublishingStoryTransport(storyId)
        val uploaded = mutableListOf<ByteArray>()
        val uploader = BinaryUploader { request ->
            uploaded += request.openStream().readBytes()
            request.onProgress(request.sizeBytes, request.sizeBytes)
            BinaryUploadResult.Success
        }
        val repository = OracleStoryRepository(
            authenticator = auth,
            transport = transport,
            contentSource = StoryContentSource { ByteArrayInputStream(byteArrayOf(1, 2, 3)) },
            binaryUploader = uploader,
        )
        val draft = StoryDraft(
            StoryMediaSelection(
                uri = "content://story",
                displayName = "moment.jpg",
                contentType = "image/jpeg",
                sizeBytes = 3,
                width = 1080,
                height = 1920,
                durationMs = null,
            ),
            caption = "  لحظة جميلة  ",
        )

        val result = repository.publish(session, draft) {} as StoryResult.Success

        assertEquals(storyId, result.value)
        assertEquals(1, uploaded.size)
        assertEquals(
            listOf("/v1/media/uploads", "/v1/media/uploads/complete", "/v1/stories"),
            transport.requests.map { it.path },
        )
        val create = requireNotNull(transport.requests.last().body)
        assertEquals(
            setOf(
                "userId",
                "mediaType",
                "mediaStoragePath",
                "mediaThumbnailStoragePath",
                "caption",
                "durationMs",
                "width",
                "height",
            ),
            create.keys().asSequence().toSet(),
        )
        assertEquals(me, create.getString("userId"))
        assertEquals("لحظة جميلة", create.getString("caption"))
        assertTrue(create.getString("mediaStoragePath").startsWith("$me/"))
    }

    @Test
    fun loadsOwnedStoriesWithMetricsAndSignedPreview() = runBlocking {
        val active = JSONObject(homePayload().getJSONArray("items").getJSONObject(0).toString())
            .let { JSONObject().put("items", it.getJSONArray("stories")) }
        val transport = StoryQueue(
            response(200, active),
            response(200, JSONObject().put("values", JSONObject().put(storyId, 7))),
            response(200, JSONObject().put("values", JSONObject().put(storyId, 3))),
            response(200, JSONObject().put("signedUrl", "https://object.example/preview")),
        )

        val result = OracleStoryRepository(auth, transport).loadOwned(session) as StoryResult.Success

        assertEquals(7, result.value.single().viewCount)
        assertEquals(3, result.value.single().likeCount)
        assertEquals("https://object.example/preview", result.value.single().signedUrl)
    }

    @Test
    fun deletesOwnedStoryThenCleansReturnedStoragePaths() = runBlocking {
        val transport = StoryQueue(
            response(
                200,
                JSONObject().put("found", true).put("storagePaths", org.json.JSONArray().put("$authorId/story.jpg")),
            ),
            response(200, JSONObject().put("deleted", 1)),
        )

        val result = OracleStoryRepository(auth, transport).deleteOwned(session, group().stories.single())

        assertTrue(result is StoryResult.Success && result.value.storageCleanupComplete)
        assertEquals("/v1/stories/$storyId/delete", transport.requests[0].path)
        assertEquals(setOf("userId"), transport.requests[0].body?.keys()?.asSequence()?.toSet())
        assertEquals("/v1/media/objects", transport.requests[1].path)
        val objectBody = transport.requests[1].body
            ?.getJSONArray("objects")
            ?.getJSONObject(0)
        assertEquals("story_media", objectBody?.getString("purpose"))
        assertEquals("$authorId/story.jpg", objectBody?.getString("objectKey"))
    }

    @Test
    fun loadsOwnerViewerListFromExactRoute() = runBlocking {
        val viewerId = "66666666-6666-6666-6666-666666666666"
        val payload = JSONObject(
            """{"item":{"storyId":"$storyId","storyCreatedAt":"2026-09-15T12:00:00Z","storyCaption":"حكاية","viewers":[{"viewerId":"$viewerId","displayName":"علي","username":"ali","avatarUrl":null,"viewedAt":"2026-09-15T13:00:00Z"}]}}""",
        )
        val transport = StoryQueue(response(200, payload))

        val result = OracleStoryRepository(auth, transport).loadViewers(session, storyId) as StoryResult.Success

        assertEquals(viewerId, result.value?.viewers?.single()?.userId)
        assertEquals("/v1/stories/$storyId/viewers?ownerId=$me", transport.requests.single().path)
    }

    private fun group() = StoryGroup(
        author = StoryAuthor(authorId, "سلمى", "salma", null),
        stories = listOf(
            StoryRecord(
                storyId,
                authorId,
                "image",
                "$authorId/story.jpg",
                "حكاية",
                null,
                1080,
                1920,
                "2026-09-15T12:00:00Z",
                "2026-09-16T12:00:00Z",
            ),
        ),
        latestCreatedAt = "2026-09-15T12:00:00Z",
    )

    private fun homePayload() = JSONObject(
        """{"items":[{"author":{"id":"$authorId","displayName":"سلمى","username":"salma","avatarUrl":null},"stories":[{"id":"$storyId","userId":"$authorId","mediaType":"image","mediaStoragePath":"$authorId/story.jpg","mediaThumbnailStoragePath":null,"caption":"حكاية","durationMs":null,"width":1080,"height":1920,"createdAt":"2026-09-15T12:00:00Z","expiresAt":"2026-09-16T12:00:00Z"}],"latestCreatedAt":"2026-09-15T12:00:00Z"}]}""",
    )

    private fun response(status: Int, body: JSONObject) =
        OracleTransportResult.Response(OracleResponse(status, body))
}

private class StoryVoiceMedia(private val value: UploadedVoice) : VoiceMediaRepository {
    var purpose: String? = null
    var prefix: String? = null
    override suspend fun upload(session: AuthSession, purpose: String, objectPrefix: String, draft: VoiceDraft, onProgress: (Int) -> Unit): VoiceMediaResult<UploadedVoice> {
        this.purpose = purpose
        prefix = objectPrefix
        return VoiceMediaResult.Success(value, session)
    }
    override suspend fun discard(session: AuthSession, purpose: String, voice: UploadedVoice) = session
}

private class PublishingStoryTransport(
    private val storyId: String,
) : OracleTransport {
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return when (request.path) {
            "/v1/media/uploads" ->
                OracleTransportResult.Response(
                    OracleResponse(201, JSONObject().put("uploadUrl", "https://upload.example/story")),
                )
            "/v1/media/uploads/complete" ->
                OracleTransportResult.Response(
                    OracleResponse(
                        200,
                        JSONObject().put("objectKey", requireNotNull(request.body).getString("objectKey")),
                    ),
                )
            "/v1/stories" ->
                OracleTransportResult.Response(OracleResponse(201, JSONObject().put("storyId", storyId)))
            else -> error("Unexpected request ${request.path}")
        }
    }
}

private class StoryQueue(vararg values: OracleTransportResult) : OracleTransport {
    private val queue = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return queue.removeFirst()
    }
}
