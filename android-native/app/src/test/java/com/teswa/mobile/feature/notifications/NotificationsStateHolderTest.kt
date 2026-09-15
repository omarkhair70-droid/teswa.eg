package com.teswa.mobile.feature.notifications

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationsStateHolderTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val notificationId = "22222222-2222-2222-2222-222222222222"
    private val itemId = "33333333-3333-3333-3333-333333333333"
    private val session = AuthSession("token", "refresh", 9_999_999_999L, AuthUser(userId, null, null, null, null))
    private val unread = AppNotification(
        notificationId, "offer_received", "عرض جديد", null, null, null,
        itemId, null, null, null, null, "2026-09-15T12:00:00Z",
    )

    @Test
    fun openingNotificationMarksOnlyItReadAndReturnsDestination() = runBlocking {
        val repository = FakeNotificationsRepository(listOf(unread))
        val holder = NotificationsStateHolder(session, repository)
        holder.load()

        val destination = holder.open(unread)

        assertEquals(NotificationDestination.Item(itemId), destination)
        assertEquals(0, holder.unreadCount)
        assertEquals(notificationId, repository.markedId)
    }

    @Test
    fun markAllUpdatesLocalUnreadCount() = runBlocking {
        val repository = FakeNotificationsRepository(listOf(unread, unread.copy(id = "44444444-4444-4444-4444-444444444444")))
        val holder = NotificationsStateHolder(session, repository)
        holder.load()

        holder.markAllRead()

        assertEquals(0, holder.unreadCount)
        assertTrue(repository.markedAll)
    }
}

private class FakeNotificationsRepository(private val items: List<AppNotification>) : NotificationsRepository {
    var markedId: String? = null
    var markedAll = false
    override suspend fun load(session: AuthSession, limit: Int) = NotificationsResult.Success(items, session)
    override suspend fun markRead(session: AuthSession, notificationId: String): NotificationsResult<Unit> {
        markedId = notificationId
        return NotificationsResult.Success(Unit, session)
    }
    override suspend fun markAllRead(session: AuthSession): NotificationsResult<Unit> {
        markedAll = true
        return NotificationsResult.Success(Unit, session)
    }
}
