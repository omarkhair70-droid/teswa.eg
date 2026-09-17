package com.teswa.mobile.feature.settings

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.text.font.FontWeight
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSpacing
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
        SettingsUiState.Loading -> SettingsCenter(
            message = "بنحمّل اختيارات حسابك…",
            modifier = modifier,
            loading = true,
            onBack = onBack,
        )

        is SettingsUiState.Error -> SettingsCenter(
            message = state.message,
            modifier = modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            onBack = onBack,
            error = true,
        )

        is SettingsUiState.Ready -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = TeswaSpacing.xxl),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xl),
        ) {
            item {
                TeswaFocusedHeader(
                    title = "الإعدادات",
                    onBack = onBack,
                )
            }

            holder.message?.let { message ->
                item {
                    TeswaInlineMessage(
                        title = "اتحدثت الإعدادات",
                        body = message,
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    )
                }
            }

            item {
                SettingsSection(
                    title = "خصوصية الرسائل",
                    description = "مين يقدر يبدأ طلب مراسلة جديد. المحادثات الموجودة مش بتتغير.",
                ) {
                    DirectMessagePrivacy.entries.forEach { option ->
                        PrivacyRow(
                            option = option,
                            selected = state.overview.privacy == option,
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
                    } else {
                        "اختار تغييرات الحالة اللي تستاهل تقاطعك، واقفل الضوضاء اللي ملهاش قرار."
                    },
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
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = TeswaLayout.ScreenHorizontal),
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                ) {
                    TeswaSectionHeader("قائمة الحظر")
                    Text(
                        text = "إلغاء الحظر يسمح بالتفاعل من جديد حسب خصوصيتك الحالية.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (state.overview.blockedUsers.isEmpty()) {
                item {
                    TeswaInlineMessage(
                        title = "قائمة الحظر فاضية",
                        body = "مفيش حسابات محظورة عندك دلوقتي.",
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    )
                }
            } else {
                items(state.overview.blockedUsers, key = { it.id }) { user ->
                    BlockedUserRow(
                        user = user,
                        working = holder.unblockingUserId == user.id,
                        enabled = holder.unblockingUserId == null,
                        onUnblock = { blockedConfirmation = user },
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    )
                }
            }

            item {
                SettingsSection(
                    title = "الحساب والأمان",
                    description = "شكل التطبيق بيتبع جهازك تلقائيًا. القرارات الحساسة المتعلقة بالحساب موجودة هنا فقط.",
                ) {
                    TeswaSecondaryAction(
                        text = "تسجيل الخروج من الجهاز",
                        onClick = { scope.launch { onSignOut() } },
                    )
                    TextButton(
                        onClick = { deleteConfirmation = true },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !holder.deletingAccount,
                    ) {
                        Text(
                            text = "حذف حساب تِسوى نهائيًا",
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                }
            }
        }
    }

    blockedConfirmation?.let { user ->
        AlertDialog(
            onDismissRequest = { blockedConfirmation = null },
            title = { Text("إلغاء الحظر؟") },
            text = {
                Text("${user.displayName ?: user.username ?: "الحساب"} هيقدر يتفاعل معاك من جديد حسب إعداد خصوصية الرسائل.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        blockedConfirmation = null
                        scope.launch { holder.unblock(user) }
                    },
                ) {
                    Text("إلغاء الحظر")
                }
            },
            dismissButton = {
                TextButton(onClick = { blockedConfirmation = null }) {
                    Text("رجوع")
                }
            },
        )
    }

    if (deleteConfirmation) {
        AlertDialog(
            onDismissRequest = {
                if (!holder.deletingAccount) deleteConfirmation = false
            },
            title = { Text("حذف الحساب نهائيًا؟") },
            text = {
                Text("هيتم حذف الحساب وبياناته ووسائطه المرتبطة. الخطوة دي لا يمكن التراجع عنها، ولو تنظيف الوسائط فشل Oracle هيحتفظ بالهوية بدل حذف جزئي.")
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        scope.launch {
                            if (holder.deleteAccount()) {
                                deleteConfirmation = false
                                onSignOut()
                            }
                        }
                    },
                    enabled = !holder.deletingAccount,
                ) {
                    Text(
                        text = if (holder.deletingAccount) "جاري الحذف…" else "احذف حسابي",
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { deleteConfirmation = false },
                    enabled = !holder.deletingAccount,
                ) {
                    Text("إلغاء")
                }
            },
        )
    }
}

@Composable
private fun SettingsSection(
    title: String,
    description: String,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = TeswaLayout.ScreenHorizontal),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        TeswaSectionHeader(title)
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        content()
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
    val container = if (selected) {
        MaterialTheme.colorScheme.primaryContainer.copy(alpha = .58f)
    } else {
        MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .32f)
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onSelect),
        color = container,
        shape = MaterialTheme.shapes.medium,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(TeswaSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
        ) {
            RadioButton(
                selected = selected,
                onClick = null,
                enabled = enabled,
            )
            Column(Modifier.weight(1f)) {
                Text(
                    text = privacyTitle(option),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = privacyDescription(option),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (saving) {
                TeswaInlineLoading("بنحفظ…", modifier = Modifier.weight(.45f))
            }
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
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = TeswaSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                text = notificationTitle(toggle),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = notificationDescription(toggle),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (saving) {
            Text(
                text = "بنحفظ…",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary,
            )
        } else {
            Switch(
                checked = checked,
                onCheckedChange = onChange,
                enabled = enabled,
            )
        }
    }
    if (toggle != NotificationToggle.QUIET_HOURS) {
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = .45f))
    }
}

@Composable
private fun BlockedUserRow(
    user: BlockedUser,
    working: Boolean,
    enabled: Boolean,
    onUnblock: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        TeswaPersonIdentity(
            name = user.displayName ?: "مستخدم تِسوى",
            avatarUrl = user.avatarUrl,
            supporting = user.username?.let { "@$it" },
        )
        TeswaSecondaryAction(
            text = if (working) "بنفك الحظر…" else "إلغاء الحظر",
            enabled = enabled && !working,
            onClick = onUnblock,
        )
    }
}

@Composable
private fun SettingsCenter(
    message: String,
    modifier: Modifier,
    loading: Boolean = false,
    primary: Pair<String, () -> Unit>? = null,
    onBack: () -> Unit,
    error: Boolean = false,
) {
    Column(modifier.fillMaxSize()) {
        TeswaFocusedHeader(
            title = "الإعدادات",
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
                    title = if (error) "الإعدادات ما ظهرتش" else "مفيش إعدادات لسه",
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
    NotificationToggle.DEALS -> "تحديثات التبديلات"
    NotificationToggle.MESSAGES -> "الرسائل"
    NotificationToggle.SOCIAL -> "المتابعات والتفاعل"
    NotificationToggle.SMART_REMINDERS -> "تذكيرات مفيدة"
    NotificationToggle.MARKETING -> "أخبار تِسوى"
    NotificationToggle.QUIET_HOURS -> "وضع الهدوء"
}

private fun notificationDescription(value: NotificationToggle) = when (value) {
    NotificationToggle.OFFERS -> "عرض جديد أو تغيير حالته."
    NotificationToggle.DEALS -> "بدء التبديل وخطوات إتمامه."
    NotificationToggle.MESSAGES -> "رسائل التنسيق الجديدة."
    NotificationToggle.SOCIAL -> "نشاط الناس المرتبط بحسابك."
    NotificationToggle.SMART_REMINDERS -> "تذكير في الوقت المناسب من غير إزعاج."
    NotificationToggle.MARKETING -> "ميزات وحملات اختيارية."
    NotificationToggle.QUIET_HOURS -> "تأجيل التنبيهات غير العاجلة خلال وقت الراحة."
}
