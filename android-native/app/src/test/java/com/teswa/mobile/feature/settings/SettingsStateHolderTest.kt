package com.teswa.mobile.feature.settings

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SettingsStateHolderTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val blockedId = "22222222-2222-2222-2222-222222222222"
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser(userId, null, null, null, null),
    )
    private val preferences = NotificationPreferences(true, true, true, true, true, false, false, "23:00", "08:00", null)

    @Test
    fun successfulChangesUpdateOnlyTheRelevantSettingsState() = runBlocking {
        val repository = FakeSettingsRepository(
            SettingsOverview(
                DirectMessagePrivacy.EVERYONE,
                preferences,
                listOf(BlockedUser(blockedId, "مستخدم", "user_2", null, null)),
            ),
        )
        val holder = SettingsStateHolder(session, repository)
        holder.load()

        holder.setPrivacy(DirectMessagePrivacy.NO_ONE)
        holder.setNotification(NotificationToggle.MARKETING, true)
        holder.unblock((holder.state as SettingsUiState.Ready).overview.blockedUsers.single())

        val ready = holder.state as SettingsUiState.Ready
        assertEquals(DirectMessagePrivacy.NO_ONE, ready.overview.privacy)
        assertTrue(ready.overview.notifications.marketingEnabled)
        assertTrue(ready.overview.blockedUsers.isEmpty())
    }
}

private class FakeSettingsRepository(initial: SettingsOverview) : SettingsRepository {
    private var overview = initial

    override suspend fun load(session: AuthSession) = SettingsResult.Success(overview, session)

    override suspend fun updatePrivacy(session: AuthSession, value: DirectMessagePrivacy): SettingsResult<DirectMessagePrivacy> {
        overview = overview.copy(privacy = value)
        return SettingsResult.Success(value, session)
    }

    override suspend fun updateNotification(
        session: AuthSession,
        toggle: NotificationToggle,
        enabled: Boolean,
    ): SettingsResult<NotificationPreferences> {
        val current = overview.notifications
        val next = when (toggle) {
            NotificationToggle.OFFERS -> current.copy(offersEnabled = enabled)
            NotificationToggle.DEALS -> current.copy(dealsEnabled = enabled)
            NotificationToggle.MESSAGES -> current.copy(messagesEnabled = enabled)
            NotificationToggle.SOCIAL -> current.copy(socialEnabled = enabled)
            NotificationToggle.SMART_REMINDERS -> current.copy(smartRemindersEnabled = enabled)
            NotificationToggle.MARKETING -> current.copy(marketingEnabled = enabled)
            NotificationToggle.QUIET_HOURS -> current.copy(quietHoursEnabled = enabled)
        }
        overview = overview.copy(notifications = next)
        return SettingsResult.Success(next, session)
    }

    override suspend fun unblock(session: AuthSession, targetUserId: String): SettingsResult<Unit> {
        overview = overview.copy(blockedUsers = overview.blockedUsers.filterNot { it.id == targetUserId })
        return SettingsResult.Success(Unit, session)
    }

    override suspend fun deleteAccount(session: AuthSession): SettingsResult<Unit> = SettingsResult.Success(Unit, session)
}
