package com.teswa.mobile.feature.settings

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

@Composable
fun SettingsScreen(
    initialSession: AuthSession,
    repository: SettingsRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onBack: () -> Unit,
    onSignOut: suspend () -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(initialSession.user.id, repository) { SettingsStateHolder(initialSession, repository) }
    val scope = rememberCoroutineScope()
    var blockedConfirmation by remember { mutableStateOf<BlockedUser?>(null) }
    var deleteConfirmation by remember { mutableStateOf(false) }

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    when (val state = holder.state) {
        SettingsUiState.Loading -> SettingsCenter("بنحمّل اختيارات حسابك…", modifier, loading = true)
        is SettingsUiState.Error -> SettingsCenter(
            state.message,
            modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            secondary = "رجوع" to onBack,
        )
        is SettingsUiState.Ready -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            item {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = onBack) { Text("رجوع") }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("مركز التحكم", style = MaterialTheme.typography.bodySmall)
                        Text("الإعدادات", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    }
                }
            }
            holder.message?.let { message -> item { SettingsMessage(message) } }
            item {
                SettingsSection(
                    title = "خصوصية الرسائل",
                    description = "مين يقدر يبدأ طلب مراسلة جديد. المحادثات الموجودة مش بتتغير.",
                ) {
                    DirectMessagePrivacy.entries.forEach { option ->
                        val selected = state.overview.privacy == option
                        PrivacyRow(
                            option = option,
                            selected = selected,
                            enabled = holder.savingPrivacy == null,
                            saving = holder.savingPrivacy == option,
                            onSelect = { scope.launch { holder.setPrivacy(option) } },
                        )
                    }
                }
            }
            item {
                SettingsSection(
                    title = "الإشعارات",
                    description = if (state.overview.notifications.quietHoursEnabled) {
                        "وضع الهدوء من ${state.overview.notifications.quietHoursStart} إلى ${state.overview.notifications.quietHoursEnd}."
                    } else "اختار التنبيهات المهمة واقفل الضوضاء غير الضرورية.",
                ) {
                    NotificationToggle.entries.forEach { toggle ->
                        NotificationRow(
                            toggle = toggle,
                            checked = state.overview.notifications.value(toggle),
                            enabled = holder.savingNotification == null,
                            saving = holder.savingNotification == toggle,
                            onChange = { scope.launch { holder.setNotification(toggle, it) } },
                        )
                    }
                }
            }
            item {
                Text("قائمة الحظر", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("إلغاء الحظر يسمح بالتفاعل من جديد حسب خصوصيتك الحالية.", style = MaterialTheme.typography.bodySmall)
            }
            if (state.overview.blockedUsers.isEmpty()) {
                item {
                    Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .45f)) {
                        Text("قائمة الحظر فاضية.", Modifier.fillMaxWidth().padding(18.dp), textAlign = TextAlign.Center)
                    }
                }
            } else {
                items(state.overview.blockedUsers, key = { it.id }) { user ->
                    BlockedUserRow(
                        user = user,
                        working = holder.unblockingUserId == user.id,
                        enabled = holder.unblockingUserId == null,
                        onUnblock = { blockedConfirmation = user },
                    )
                }
            }
            item {
                SettingsSection(
                    title = "الحساب والأمان",
                    description = "شكل التطبيق بيتبع جهازك تلقائيًا. اختيارات الحساب الحساسة هنا فقط.",
                ) {
                    OutlinedButton(
                        onClick = { scope.launch { onSignOut() } },
                        modifier = Modifier.fillMaxWidth(),
                    ) { Text("تسجيل الخروج من الجهاز") }
                    Spacer(Modifier.height(8.dp))
                    TextButton(
                        onClick = { deleteConfirmation = true },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !holder.deletingAccount,
                    ) { Text("حذف حساب تِسوى نهائيًا", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }

    blockedConfirmation?.let { user ->
        AlertDialog(
            onDismissRequest = { blockedConfirmation = null },
            title = { Text("إلغاء الحظر؟") },
            text = { Text("${user.displayName ?: user.username ?: "الحساب"} هيقدر يتفاعل معاك من جديد حسب إعداد خصوصية الرسائل.") },
            confirmButton = {
                Button(onClick = {
                    blockedConfirmation = null
                    scope.launch { holder.unblock(user) }
                }) { Text("إلغاء الحظر") }
            },
            dismissButton = { TextButton(onClick = { blockedConfirmation = null }) { Text("رجوع") } },
        )
    }

    if (deleteConfirmation) {
        AlertDialog(
            onDismissRequest = { if (!holder.deletingAccount) deleteConfirmation = false },
            title = { Text("حذف الحساب نهائيًا؟") },
            text = { Text("هيتم حذف الحساب وبياناته ووسائطه المرتبطة. الخطوة دي لا يمكن التراجع عنها، ولو تنظيف الوسائط فشل Oracle هيحتفظ بالهوية بدل حذف جزئي.") },
            confirmButton = {
                Button(
                    onClick = {
                        scope.launch {
                            if (holder.deleteAccount()) {
                                deleteConfirmation = false
                                onSignOut()
                            }
                        }
                    },
                    enabled = !holder.deletingAccount,
                ) { Text(if (holder.deletingAccount) "جاري الحذف…" else "احذف حسابي") }
            },
            dismissButton = {
                TextButton(onClick = { deleteConfirmation = false }, enabled = !holder.deletingAccount) { Text("إلغاء") }
            },
        )
    }
}

@Composable
private fun SettingsSection(title: String, description: String, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Column(Modifier.fillMaxWidth().padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(description, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun PrivacyRow(
    option: DirectMessagePrivacy,
    selected: Boolean,
    enabled: Boolean,
    saving: Boolean,
    onSelect: () -> Unit,
) {
    Card(
        onClick = onSelect,
        enabled = enabled,
        colors = CardDefaults.cardColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = .65f)
            else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .35f),
        ),
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
    ) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = selected, onClick = null, enabled = enabled)
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Text(privacyTitle(option), style = MaterialTheme.typography.titleMedium)
                Text(privacyDescription(option), style = MaterialTheme.typography.bodySmall)
            }
            if (saving) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        }
    }
}

@Composable
private fun NotificationRow(
    toggle: NotificationToggle,
    checked: Boolean,
    enabled: Boolean,
    saving: Boolean,
    onChange: (Boolean) -> Unit,
) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(notificationTitle(toggle), style = MaterialTheme.typography.titleMedium)
            Text(notificationDescription(toggle), style = MaterialTheme.typography.bodySmall)
        }
        if (saving) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
        else Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
    if (toggle != NotificationToggle.QUIET_HOURS) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .45f))
}

@Composable
private fun BlockedUserRow(user: BlockedUser, working: Boolean, enabled: Boolean, onUnblock: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            NetworkImage(
                user.avatarUrl,
                user.displayName ?: user.username ?: "مستخدم",
                Modifier.size(52.dp).clip(CircleShape),
            )
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(user.displayName ?: "مستخدم تِسوى", style = MaterialTheme.typography.titleMedium)
                user.username?.let { Text("@$it", style = MaterialTheme.typography.bodySmall) }
            }
            if (working) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
            else OutlinedButton(onClick = onUnblock, enabled = enabled) { Text("إلغاء الحظر") }
        }
    }
}

@Composable
private fun SettingsMessage(message: String) {
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .45f)) {
        Text(message, Modifier.fillMaxWidth().padding(13.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
    }
}

@Composable
private fun SettingsCenter(
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
        if (loading) { CircularProgressIndicator(); Spacer(Modifier.height(12.dp)) }
        Text(message, textAlign = TextAlign.Center)
        primary?.let { Spacer(Modifier.height(16.dp)); Button(onClick = it.second) { Text(it.first) } }
        secondary?.let { Spacer(Modifier.height(8.dp)); OutlinedButton(onClick = it.second) { Text(it.first) } }
    }
}

private fun privacyTitle(value: DirectMessagePrivacy) = when (value) {
    DirectMessagePrivacy.EVERYONE -> "أي حد"
    DirectMessagePrivacy.FOLLOWERS_ONLY -> "المتابعين فقط"
    DirectMessagePrivacy.NO_ONE -> "لا أحد"
}

private fun privacyDescription(value: DirectMessagePrivacy) = when (value) {
    DirectMessagePrivacy.EVERYONE -> "متاح لاكتشاف فرص تبديل جديدة."
    DirectMessagePrivacy.FOLLOWERS_ONLY -> "طلبات جديدة من الناس اللي بينهم وبينك متابعة."
    DirectMessagePrivacy.NO_ONE -> "إيقاف طلبات المراسلة الجديدة مؤقتًا."
}

private fun notificationTitle(value: NotificationToggle) = when (value) {
    NotificationToggle.OFFERS -> "العروض"
    NotificationToggle.DEALS -> "تحديثات الصفقات"
    NotificationToggle.MESSAGES -> "الرسائل"
    NotificationToggle.SOCIAL -> "المتابعات والتفاعل"
    NotificationToggle.SMART_REMINDERS -> "تذكيرات مفيدة"
    NotificationToggle.MARKETING -> "أخبار تِسوى"
    NotificationToggle.QUIET_HOURS -> "وضع الهدوء"
}

private fun notificationDescription(value: NotificationToggle) = when (value) {
    NotificationToggle.OFFERS -> "عرض جديد أو تغيير حالته."
    NotificationToggle.DEALS -> "إنشاء الصفقة وخطوات إتمامها."
    NotificationToggle.MESSAGES -> "رسائل التنسيق الجديدة."
    NotificationToggle.SOCIAL -> "نشاط المجتمع المرتبط بحسابك."
    NotificationToggle.SMART_REMINDERS -> "تذكير في الوقت المناسب من غير إزعاج."
    NotificationToggle.MARKETING -> "ميزات وحملات اختيارية."
    NotificationToggle.QUIET_HOURS -> "تأجيل التنبيهات غير العاجلة خلال وقت الراحة."
}
