package com.teswa.mobile.feature.settings

import com.teswa.mobile.auth.AuthSession

enum class DirectMessagePrivacy(val wireValue: String) {
    EVERYONE("everyone"),
    FOLLOWERS_ONLY("followers_only"),
    NO_ONE("no_one");

    companion object {
        fun fromWire(value: String): DirectMessagePrivacy? = entries.firstOrNull { it.wireValue == value }
    }
}

enum class NotificationToggle(val wireKey: String) {
    OFFERS("offersEnabled"),
    DEALS("dealsEnabled"),
    MESSAGES("messagesEnabled"),
    SOCIAL("socialEnabled"),
    SMART_REMINDERS("smartRemindersEnabled"),
    MARKETING("marketingEnabled"),
    QUIET_HOURS("quietHoursEnabled"),
}

data class NotificationPreferences(
    val offersEnabled: Boolean,
    val dealsEnabled: Boolean,
    val messagesEnabled: Boolean,
    val socialEnabled: Boolean,
    val smartRemindersEnabled: Boolean,
    val marketingEnabled: Boolean,
    val quietHoursEnabled: Boolean,
    val quietHoursStart: String,
    val quietHoursEnd: String,
    val updatedAt: String?,
) {
    fun value(toggle: NotificationToggle): Boolean = when (toggle) {
        NotificationToggle.OFFERS -> offersEnabled
        NotificationToggle.DEALS -> dealsEnabled
        NotificationToggle.MESSAGES -> messagesEnabled
        NotificationToggle.SOCIAL -> socialEnabled
        NotificationToggle.SMART_REMINDERS -> smartRemindersEnabled
        NotificationToggle.MARKETING -> marketingEnabled
        NotificationToggle.QUIET_HOURS -> quietHoursEnabled
    }
}

data class BlockedUser(
    val id: String,
    val displayName: String?,
    val username: String?,
    val avatarUrl: String?,
    val blockedAt: String?,
)

data class SettingsOverview(
    val privacy: DirectMessagePrivacy,
    val notifications: NotificationPreferences,
    val blockedUsers: List<BlockedUser>,
)

sealed interface SettingsResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : SettingsResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
    ) : SettingsResult<Nothing>
}
