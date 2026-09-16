package com.teswa.mobile.feature.contextual

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ContextualStateHolderTest {
    private val me = "11111111-1111-1111-1111-111111111111"
    private val other = "22222222-2222-2222-2222-222222222222"
    private val conversationId = "33333333-3333-3333-3333-333333333333"
    private val story = "44444444-4444-4444-4444-444444444444"
    private val session = AuthSession("token", "refresh", 9_999_999_999L, AuthUser(me, null, null, null, null))
    private val conversation = ContextualConversation(conversationId, story, ContextualParticipant(other, "سلمى", null, null), null, null, 0, "now")

    @Test
    fun silentThreadReloadPreservesComposer() = runBlocking {
        val repository = FakeContextualRepository(session, conversation)
        val holder = ContextualStateHolder(session, repository)
        holder.load()
        holder.open(conversation)
        holder.compose("لسه بكتب")

        holder.reloadThread()

        assertEquals("لسه بكتب", holder.composer)
    }

    @Test
    fun openByIdLoadsInboxThenOpensRequestedThread() = runBlocking {
        val repository = FakeContextualRepository(session, conversation)
        val holder = ContextualStateHolder(session, repository)

        val opened = holder.openById(conversationId)

        assertTrue(opened)
        assertEquals(conversationId, holder.thread?.conversation?.id)
    }
}

private class FakeContextualRepository(private val session: AuthSession, private val conversation: ContextualConversation) : ContextualRepository {
    override suspend fun loadInbox(session: AuthSession) = ContextualResult.Success(listOf(conversation), this.session)
    override suspend fun loadThread(session: AuthSession, conversationId: String) = ContextualResult.Success(ContextualThread(conversation, this.session.user.id, conversation.other.id, emptyList()), this.session)
    override suspend fun sendText(session: AuthSession, conversationId: String, body: String): ContextualResult<ContextualMessage> = error("Not used")
    override suspend fun markRead(session: AuthSession, conversationId: String) = ContextualResult.Success(Unit, this.session)
}
