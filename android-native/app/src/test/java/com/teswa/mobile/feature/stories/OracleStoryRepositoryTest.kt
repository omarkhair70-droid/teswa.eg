package com.teswa.mobile.feature.stories

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleResponse
import com.teswa.mobile.core.network.OracleTransport
import com.teswa.mobile.core.network.OracleTransportResult
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

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

private class StoryQueue(vararg values: OracleTransportResult) : OracleTransport {
    private val queue = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return queue.removeFirst()
    }
}
