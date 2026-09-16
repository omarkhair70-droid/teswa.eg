package com.teswa.mobile.feature.notifications

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
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
            "بنراجع الجديد…",
            modifier,
            loading = true,
            secondary = "رجوع للرئيسية" to onBack,
        )
        NotificationsUiState.Empty -> NotificationCenter(
            "كله هادي هنا. لما يحصل عرض أو رسالة أو خطوة مهمة هتلاقيها في المكان ده.",
            modifier,
            primary = "تحديث" to { scope.launch { holder.load() } },
            secondary = "رجوع للرئيسية" to onBack,
        )
        is NotificationsUiState.Error -> NotificationCenter(
            state.message,
            modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            secondary = "رجوع للرئيسية" to onBack,
        )
        is NotificationsUiState.Content -> LazyColumn(
            modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            item {
                OutlinedButton(onClick = onBack) { Text("رجوع للرئيسية") }
            }
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("الحركة المهمة فقط", style = MaterialTheme.typography.bodySmall)
                        Text("التنبيهات", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Text(if (holder.unreadCount == 0) "مفيش جديد مستنيك" else "${holder.unreadCount} لسه ما اتقراش")
                    }
                    OutlinedButton(onClick = { scope.launch { holder.load(silent = true) } }) { Text("تحديث") }
                }
            }
            if (holder.unreadCount > 0) {
                item {
                    TextButton(
                        onClick = { scope.launch { holder.markAllRead() } },
                        enabled = !holder.working,
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text(if (holder.working) "جاري التحديث…" else "علّم الكل كمقروء") }
                }
            }
            holder.message?.let { item { NotificationMessage(it) } }
            items(state.items, key = { it.id }) { notification ->
                NotificationCard(notification) {
                    scope.launch { holder.open(notification)?.let(onDestination) }
                }
            }
        }
    }
}

@Composable
private fun NotificationCard(notification: AppNotification, onOpen: () -> Unit) {
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (notification.isRead) MaterialTheme.colorScheme.surface
            else MaterialTheme.colorScheme.primaryContainer.copy(alpha = .55f),
        ),
    ) {
        Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.Top) {
            Surface(
                modifier = Modifier.size(42.dp),
                shape = CircleShape,
                color = if (notification.isRead) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primary,
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Text(notificationGlyph(notification.type), color = if (notification.isRead) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onPrimary)
                }
            }
            Spacer(Modifier.size(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(notificationLabel(notification.type), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                    if (!notification.isRead) {
                        Spacer(Modifier.size(7.dp))
                        Surface(Modifier.size(7.dp), CircleShape, MaterialTheme.colorScheme.primary) {}
                    }
                }
                Text(notification.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                notification.body?.let {
                    Spacer(Modifier.height(4.dp))
                    Text(it, style = MaterialTheme.typography.bodyMedium, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
                Spacer(Modifier.height(5.dp))
                Text(notification.createdAt, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun NotificationMessage(message: String) {
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.error.copy(alpha = .1f)) {
        Text(message, Modifier.fillMaxWidth().padding(12.dp), color = MaterialTheme.colorScheme.error)
    }
}

@Composable
private fun NotificationCenter(
    message: String,
    modifier: Modifier,
    loading: Boolean = false,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null,
) {
    Column(
        modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (loading) { CircularProgressIndicator(); Spacer(Modifier.height(14.dp)) }
        Text(message, textAlign = TextAlign.Center)
        primary?.let { Spacer(Modifier.height(16.dp)); Button(onClick = it.second) { Text(it.first) } }
        secondary?.let { Spacer(Modifier.height(8.dp)); OutlinedButton(onClick = it.second) { Text(it.first) } }
    }
}

private fun notificationGlyph(type: String) = when {
    type.startsWith("offer_") -> "⇄"
    type.startsWith("deal_") -> "✓"
    type.contains("message") -> "✉"
    type == "user_followed_you" -> "+"
    else -> "•"
}

private fun notificationLabel(type: String) = when (type) {
    "offer_received" -> "عرض جديد"
    "offer_thinking" -> "العرض قيد التفكير"
    "offer_accepted" -> "عرض مقبول"
    "offer_soft_rejected" -> "العرض ما ظبطش"
    "deal_created" -> "صفقة جديدة"
    "deal_message_received", "deal_voice_message_received" -> "رسالة صفقة"
    "deal_completion_confirmation_needed" -> "تأكيد الصفقة"
    "deal_completed" -> "تبديل تم"
    "user_followed_you" -> "متابعة جديدة"
    "direct_message_received" -> "رسالة مباشرة"
    "story_reply_received", "contextual_message_received" -> "رد على قصة"
    "report_update" -> "تحديث بلاغ"
    else -> "من تِسوى"
}
