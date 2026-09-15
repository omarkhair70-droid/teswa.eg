package com.teswa.mobile.feature.messages

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MessagingStateHolderTest {
    private val session = AuthSession(
        "access", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )
    private val conversation = DealConversation(
        dealId = "22222222-2222-2222-2222-222222222222",
        status = "coordinating",
        requestedItemTitle = "كاميرا",
        offeredItemTitle = "كتاب",
        otherParticipantId = "33333333-3333-3333-3333-333333333333",
        otherDisplayName = "سلمى",
        otherAvatarUrl = null,
        latestMessage = null,
        unreadCount = 1,
        lastActivityAt = "2026-09-15T12:00:00Z",
    )

    @Test
    fun openingThreadLoadsMessagesAndClearsUnread() = runBlocking {
        val repository = FakeMessagingRepository(session, listOf(conversation))
        val holder = MessagingStateHolder(session, repository)
        holder.load()

        holder.open(conversation)

        assertTrue(holder.threadState is ThreadUiState.Content)
        assertEquals(0, (holder.inboxState as InboxUiState.Content).items.single().unreadCount)
        assertEquals(1, repository.markReadCalls)
    }

    @Test
    fun silentThreadRefreshPreservesComposerOnNetworkFailure() = runBlocking {
        val repository = FakeMessagingRepository(session, listOf(conversation))
        val holder = MessagingStateHolder(session, repository)
        holder.load()
        holder.open(conversation)
        holder.updateComposer("لسه بكتب")
        repository.messagesResult = MessagingResult.Failure("الاتصال ضعيف", session, network = true)

        holder.reloadThread()

        assertEquals("لسه بكتب", holder.composer)
        assertTrue(holder.threadState is ThreadUiState.Content)
        assertEquals("الاتصال ضعيف", holder.banner)
    }
}

private class FakeMessagingRepository(
    private val session: AuthSession,
    private val conversations: List<DealConversation>,
) : MessagingRepository {
    var messagesResult: MessagingResult<List<DealMessage>> = MessagingResult.Success(emptyList(), session)
    var markReadCalls = 0

    override suspend fun loadInbox(session: AuthSession, offset: Int, limit: Int) =
        MessagingResult.Success(DealInboxPage(conversations, false), this.session)

    override suspend fun loadMessages(session: AuthSession, dealId: String) = messagesResult

    override suspend fun sendText(session: AuthSession, dealId: String, recipientUserId: String, body: String): MessagingResult<DealMessage> =
        error("Not used")

    override suspend fun markRead(session: AuthSession, dealId: String): MessagingResult<Unit> {
        markReadCalls += 1
        return MessagingResult.Success(Unit, this.session)
    }
}
