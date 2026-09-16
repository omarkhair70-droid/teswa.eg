package com.teswa.mobile.feature.stories

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StoryStateHolderTest {
    private val me = "11111111-1111-1111-1111-111111111111"
    private val authorId = "22222222-2222-2222-2222-222222222222"
    private val storyId = "33333333-3333-3333-3333-333333333333"
    private val session = AuthSession("token", "refresh", 9_999_999_999L, AuthUser(me, null, null, null, null))
    private val group = StoryGroup(
        StoryAuthor(authorId, "سلمى", "salma", null),
        listOf(StoryRecord(storyId, authorId, "image", "$authorId/story.jpg", null, null, null, null, "now", "later")),
        "now",
    )

    @Test
    fun openingStoryMarksItViewedOnlyOnce() = runBlocking {
        val repository = FakeStoryRepository(session, group)
        val holder = StoryStateHolder(session, repository)

        holder.open(group)
        holder.close()
        holder.open(group)

        assertEquals(1, repository.viewCalls)
    }

    @Test
    fun replyTrimsBodyAndReturnsConversationRoute() = runBlocking {
        val repository = FakeStoryRepository(session, group)
        val holder = StoryStateHolder(session, repository)
        holder.open(group)
        holder.composeReply("  جميلة  ")

        val conversationId = holder.sendReply()

        assertEquals("44444444-4444-4444-4444-444444444444", conversationId)
        assertEquals("جميلة", repository.replyBody)
        assertTrue(holder.replyComposer.isEmpty())
    }
}

private class FakeStoryRepository(
    private val currentSession: AuthSession,
    private val group: StoryGroup,
) : StoryRepository {
    var viewCalls = 0
    var replyBody: String? = null

    override suspend fun loadHome(session: AuthSession) = StoryResult.Success(listOf(group), currentSession)

    override suspend fun prepareViewer(session: AuthSession, group: StoryGroup) =
        StoryResult.Success(
            StoryViewer(group, group.stories.map { StorySlide(it, "https://object.example/story", false) }),
            currentSession,
        )

    override suspend fun markViewed(session: AuthSession, storyId: String): StoryResult<Unit> {
        viewCalls += 1
        return StoryResult.Success(Unit, currentSession)
    }

    override suspend fun setLiked(session: AuthSession, storyId: String, liked: Boolean) =
        StoryResult.Success(liked, currentSession)

    override suspend fun reply(session: AuthSession, storyId: String, body: String): StoryResult<StoryReplyReceipt> {
        replyBody = body
        return StoryResult.Success(
            StoryReplyReceipt(
                "44444444-4444-4444-4444-444444444444",
                "55555555-5555-5555-5555-555555555555",
            ),
            currentSession,
        )
    }
}
