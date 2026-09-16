package com.teswa.mobile.feature.direct

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DirectStateHolderTest {
    private val me = "11111111-1111-1111-1111-111111111111"
    private val other = "22222222-2222-2222-2222-222222222222"
    private val conversationId = "33333333-3333-3333-3333-333333333333"
    private val session = AuthSession(
        accessToken = "token",
        refreshToken = "refresh",
        expiresAtEpochSeconds = 9_999_999_999L,
        user = AuthUser(me, null, null, null, null),
    )
    private val conversation = DirectConversation(
        id = conversationId,
        status = "accepted",
        requestedBy = me,
        otherUserId = other,
        otherDisplayName = "سلمى",
        otherUsername = "salma",
        otherAvatarUrl = null,
        lastMessageBody = null,
        lastMessageAt = null,
        unreadCount = 0,
        requiresAction = false,
    )

    @Test
    fun openByIdLoadsInboxThenOpensRequestedConversation() = runBlocking {
        val repository = FakeDirectRepository(session, conversation)
        val holder = DirectStateHolder(session, repository)

        val opened = holder.openById(conversationId)

        assertTrue(opened)
        assertEquals(conversationId, holder.selected?.id)
        assertEquals(1, repository.readCalls)
    }
}

private class FakeDirectRepository(
    private val currentSession: AuthSession,
    private val conversation: DirectConversation,
) : DirectRepository {
    var readCalls = 0

    override suspend fun loadInbox(session: AuthSession) =
        DirectResult.Success(listOf(conversation), currentSession)

    override suspend fun loadMessages(session: AuthSession, conversationId: String): DirectResult<List<DirectMessage>> =
        DirectResult.Success(emptyList(), currentSession)

    override suspend fun send(
        session: AuthSession,
        conversation: DirectConversation,
        body: String,
    ): DirectResult<Unit> = error("Not used")

    override suspend fun act(
        session: AuthSession,
        conversationId: String,
        accept: Boolean,
    ): DirectResult<Unit> = error("Not used")

    override suspend fun markRead(session: AuthSession, conversationId: String): DirectResult<Unit> {
        readCalls += 1
        return DirectResult.Success(Unit, currentSession)
    }
}
