package com.teswa.mobile.feature.notifications

import com.teswa.mobile.auth.AuthSession

data class AppNotification(
    val id: String,
    val type: String,
    val title: String,
    val body: String?,
    val route: String?,
    val actorUserId: String?,
    val itemId: String?,
    val offerId: String?,
    val dealId: String?,
    val conversationId: String?,
    val readAt: String?,
    val createdAt: String,
) {
    val isRead: Boolean get() = readAt != null
}

sealed interface NotificationDestination {
    data class Item(val id: String) : NotificationDestination
    data class Deal(val id: String) : NotificationDestination
    data class Offer(val id: String) : NotificationDestination
    data class Profile(val id: String) : NotificationDestination
    data class Direct(val route: String) : NotificationDestination
    data class Contextual(val id: String) : NotificationDestination
}

fun AppNotification.destination(): NotificationDestination? = when {
    route?.startsWith("/direct/") == true -> NotificationDestination.Direct(route)
    type == "user_followed_you" && actorUserId != null -> NotificationDestination.Profile(actorUserId)
    conversationId != null -> NotificationDestination.Contextual(conversationId)
    dealId != null -> NotificationDestination.Deal(dealId)
    offerId != null -> NotificationDestination.Offer(offerId)
    itemId != null -> NotificationDestination.Item(itemId)
    else -> null
}

sealed interface NotificationsResult<out T> {
    data class Success<T>(val value: T, val session: AuthSession) : NotificationsResult<T>
    data class Failure(
        val message: String,
        val session: AuthSession? = null,
        val network: Boolean = false,
        val unauthorized: Boolean = false,
    ) : NotificationsResult<Nothing>
}
