package com.teswa.mobile.feature.notifications

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaScreenHeading
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSize
import com.teswa.mobile.ui.system.TeswaSpacing
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun NotificationsScreen(
    initialSession: AuthSession,
    repository: NotificationsRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onDestination: (NotificationDestination) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(initialSession.user.id, repository) { NotificationsStateHolder(initialSession, repository) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }
    LaunchedEffect(Unit) {
        while (isActive) {
            delay(45_000)
            holder.load(silent = true)
        }
    }

    when (val state = holder.state) {
        NotificationsUiState.Loading -> NotificationCenter(
            message = "بنراجع التغييرات المهمة…",
            modifier = modifier,
            loading = true,
            onBack = onBack,
        )

        NotificationsUiState.Empty -> NotificationCenter(
            message = "لما عرض يتغير، رسالة توصل، أو يبقى فيه خطوة محتاجة منك قرار هتظهر هنا.",
            modifier = modifier,
            primary = "حدّث" to { scope.launch { holder.load() } },
            onBack = onBack,
        )

        is NotificationsUiState.Error -> NotificationCenter(
            message = state.message,
            modifier = modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            onBack = onBack,
            error = true,
        )

        is NotificationsUiState.Content -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = TeswaSpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
        ) {
            item {
                TeswaFocusedHeader(
                    title = "التنبيهات",
                    onBack = onBack,
                    actionIcon = TeswaIcons.Refresh,
                    actionDescription = "تحديث التنبيهات",
                    onAction = { scope.launch { holder.load(silent = true) } },
                )
            }
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = TeswaLayout.ScreenHorizontal),
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                ) {
                    TeswaScreenHeading(
                        title = if (holder.unreadCount == 0) "مفيش حاجة مستنياك" else "${holder.unreadCount} محتاجين نظرة",
                        eyebrow = "الحركة المهمة فقط",
                        supporting = "كل تنبيه هنا لازم يرجعك للحاجة أو الشخص أو الحالة اللي اتغيرت.",
                    )
                    if (holder.unreadCount > 0) {
                        TextButton(
                            onClick = { scope.launch { holder.markAllRead() } },
                            enabled = !holder.working,
                        ) {
                            Text(if (holder.working) "بنعلمهم…" else "علّم الكل كمقروء")
                        }
                    }
                    holder.message?.let {
                        TeswaInlineMessage(
                            title = "التحديث مكملش",
                            body = it,
                            emphasis = TeswaEmphasis.Strong,
                        )
                    }
                }
            }
            items(state.items, key = { it.id }) { notification ->
                NotificationRow(
                    notification = notification,
                    onOpen = {
                        scope.launch { holder.open(notification)?.let(onDestination) }
                    },
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
        }
    }
}

@Composable
private fun NotificationRow(
    notification: AppNotification,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val icon = notificationIcon(notification.type)
    val container = if (notification.isRead) {
        MaterialTheme.colorScheme.surface
    } else {
        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.52f)
    }
    val iconContainer = if (notification.isRead) {
        MaterialTheme.colorScheme.surfaceVariant
    } else {
        MaterialTheme.colorScheme.primary
    }
    val iconContent = if (notification.isRead) {
        MaterialTheme.colorScheme.onSurfaceVariant
    } else {
        MaterialTheme.colorScheme.onPrimary
    }

    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        color = container,
        shape = MaterialTheme.shapes.large,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(TeswaSpacing.md),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            verticalAlignment = Alignment.Top,
        ) {
            Surface(
                modifier = Modifier.size(TeswaSize.minTouch),
                shape = CircleShape,
                color = iconContainer,
                contentColor = iconContent,
            ) {
                Row(
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        modifier = Modifier.size(TeswaSize.icon),
                    )
                }
            }
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                ) {
                    Text(
                        text = notificationLabel(notification.type),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    if (!notification.isRead) {
                        Surface(
                            modifier = Modifier.size(TeswaSpacing.xs),
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primary,
                        ) {}
                    }
                }
                Text(
                    text = notification.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                notification.body?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Text(
                    text = notification.createdAt,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun NotificationCenter(
    message: String,
    modifier: Modifier,
    loading: Boolean = false,
    primary: Pair<String, () -> Unit>? = null,
    onBack: () -> Unit,
    error: Boolean = false,
) {
    Column(modifier.fillMaxSize()) {
        TeswaFocusedHeader(
            title = "التنبيهات",
            onBack = onBack,
        )
        Column(
            modifier = Modifier
                .weight(1f)
                .padding(TeswaLayout.RootContentPadding),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            if (loading) {
                TeswaInlineLoading(message)
            } else {
                TeswaInlineMessage(
                    title = if (error) "التنبيهات ما ظهرتش" else "كله هادي هنا",
                    body = message,
                    emphasis = if (error) TeswaEmphasis.Strong else TeswaEmphasis.Quiet,
                    actionLabel = primary?.first,
                    onAction = primary?.second,
                )
                Spacer(Modifier.size(TeswaSpacing.sm))
                TeswaSecondaryAction(
                    text = "ارجع",
                    onClick = onBack,
                )
            }
        }
    }
}

private fun notificationIcon(type: String): ImageVector = when {
    type.startsWith("offer_") -> TeswaIcons.Exchange
    type.startsWith("deal_") -> TeswaIcons.Accepted
    type.contains("message") -> TeswaIcons.Conversation
    type == "user_followed_you" -> TeswaIcons.Me
    type == "report_update" -> TeswaIcons.Report
    else -> TeswaIcons.Notifications
}

private fun notificationLabel(type: String) = when (type) {
    "offer_received" -> "عرض جديد"
    "offer_thinking" -> "العرض قيد التفكير"
    "offer_accepted" -> "عرض مقبول"
    "offer_soft_rejected" -> "العرض ما ظبطش"
    "deal_created" -> "تبديل بدأ"
    "deal_message_received", "deal_voice_message_received" -> "رسالة في التبديل"
    "deal_completion_confirmation_needed" -> "محتاج تأكيدك"
    "deal_completed" -> "تبديل اكتمل"
    "user_followed_you" -> "متابعة جديدة"
    "direct_message_received" -> "رسالة مباشرة"
    "story_reply_received", "contextual_message_received" -> "رد على سياق"
    "report_update" -> "تحديث بلاغ"
    else -> "من تِسوى"
}
