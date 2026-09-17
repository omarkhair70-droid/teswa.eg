package com.teswa.mobile.feature.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.settings.SettingsRepository
import com.teswa.mobile.feature.settings.SettingsScreen
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEvidenceLine
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaObjectIdentity
import com.teswa.mobile.ui.system.TeswaObjectRow
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill
import com.teswa.mobile.ui.system.TeswaTextField
import com.teswa.mobile.ui.system.TeswaTraceNote
import kotlinx.coroutines.launch

@Composable
fun ProfileScreen(
    initialSession: AuthSession,
    repository: ProfileRepository,
    imageRepository: ProfileImageRepository,
    settingsRepository: SettingsRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onAddItem: () -> Unit,
    onSignOut: suspend () -> Unit,
    modifier: Modifier = Modifier,
    onFocusedStateChanged: (Boolean) -> Unit = {},
) {
    val holder = remember(initialSession.user.id, repository, imageRepository) {
        ProfileStateHolder(initialSession, repository, imageRepository)
    }
    val scope = rememberCoroutineScope()
    var listingConfirmation by remember { mutableStateOf<Pair<MyListing, ListingAction>?>(null) }
    var showingSettings by remember { mutableStateOf(false) }
    val focused = showingSettings || holder.editDraft != null

    LaunchedEffect(focused) {
        onFocusedStateChanged(focused)
    }

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    if (showingSettings) {
        SettingsScreen(
            initialSession = holder.session,
            repository = settingsRepository,
            onSessionUpdated = holder::updateSession,
            onSessionExpired = onSessionExpired,
            onBack = { showingSettings = false },
            onSignOut = onSignOut,
            modifier = modifier,
        )
        return
    }

    holder.editDraft?.let { draft ->
        ProfileEditContent(holder, draft, modifier)
        return
    }

    when (val state = holder.state) {
        ProfileUiState.Loading -> ProfileCenter(
            message = "بنحمّل هويتك ودليل التبديلات…",
            modifier = modifier,
            loading = true,
        )

        is ProfileUiState.Error -> ProfileCenter(
            message = state.message,
            modifier = modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            secondary = "تسجيل الخروج" to { scope.launch { onSignOut() } },
            error = true,
        )

        is ProfileUiState.Ready -> LazyColumn(
            modifier = modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                horizontal = TeswaLayout.ScreenHorizontal,
                vertical = TeswaLayout.ScreenVertical,
            ),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xl),
        ) {
            item {
                ProfileMasthead(onSettings = { showingSettings = true })
            }

            item {
                ProfileIdentityArchive(state.overview.profile)
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                ) {
                    TeswaSecondaryAction(
                        text = "تعديل هويتي",
                        icon = TeswaIcons.Edit,
                        onClick = holder::beginEdit,
                        modifier = Modifier.weight(1f),
                    )
                    TeswaSecondaryAction(
                        text = "الإعدادات",
                        icon = TeswaIcons.Settings,
                        onClick = { showingSettings = true },
                        modifier = Modifier.weight(1f),
                    )
                }
            }

            holder.message?.let { message ->
                item {
                    ProfileMessage(message, holder.messageIsError)
                }
            }

            state.overview.profile.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
                        TeswaSectionHeader("أثر صغير عنّي")
                        TeswaTraceNote(bio)
                    }
                }
            }

            item {
                TeswaSectionHeader(
                    title = "الحاجات اللي خرجت للّعب",
                    actionLabel = "حط حاجة",
                    onAction = onAddItem,
                )
            }

            if (state.overview.listings.isEmpty()) {
                item {
                    TeswaInlineMessage(
                        title = "لسه مفيش حاجة منشورة",
                        body = "الحاجة تبدأ في دولابك، ولما تختار تفتحها لاحتمال جديد هتسيب أثرها هنا.",
                        icon = TeswaIcons.Mine,
                        actionLabel = "ابدأ من دولابي",
                        onAction = onAddItem,
                    )
                }
            } else {
                items(state.overview.listings, key = { it.id }) { listing ->
                    MyListingRow(
                        listing = listing,
                        working = holder.actingListingId == listing.id,
                        onAction = { action -> listingConfirmation = listing to action },
                    )
                }
            }

            item {
                TeswaSecondaryAction(
                    text = "حدّث الأثر",
                    icon = TeswaIcons.Refresh,
                    onClick = { scope.launch { holder.load(silent = true) } },
                )
            }

            item {
                TextButton(
                    onClick = { scope.launch { onSignOut() } },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("تسجيل الخروج")
                }
            }
        }
    }

    listingConfirmation?.let { (listing, action) ->
        AlertDialog(
            onDismissRequest = { listingConfirmation = null },
            title = { Text(actionTitle(action)) },
            text = { Text(actionDescription(action, listing.title)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        listingConfirmation = null
                        scope.launch { holder.actOnListing(listing, action) }
                    },
                ) {
                    Text(
                        text = actionButton(action),
                        color = if (action == ListingAction.DELETE_ARCHIVED) {
                            MaterialTheme.colorScheme.error
                        } else {
                            MaterialTheme.colorScheme.primary
                        },
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { listingConfirmation = null }) {
                    Text("رجوع")
                }
            },
        )
    }
}

@Composable
private fun ProfileMasthead(onSettings: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TeswaMarkIcon(
            mark = TeswaMark.Me,
            color = MaterialTheme.colorScheme.primary,
            size = 28.dp,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text("أنا", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text(
                "هويتك زي ما بناها اللي حصل فعلًا",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        com.teswa.mobile.ui.system.TeswaIconAction(
            icon = TeswaIcons.Settings,
            contentDescription = "الإعدادات",
            onClick = onSettings,
        )
    }
}

@Composable
private fun ProfileIdentityArchive(profile: MyProfile) {
    val location = listOfNotNull(profile.area, profile.city)
        .filter { it.isNotBlank() }
        .joinToString("، ")

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(228.dp),
        ) {
            if (profile.coverUrl != null) {
                NetworkImage(
                    url = profile.coverUrl,
                    contentDescription = "غلاف ${profile.displayName}",
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(166.dp)
                        .clip(RoundedCornerShape(TeswaLayout.ProfileCoverRadius)),
                )
            } else {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(166.dp)
                        .clip(RoundedCornerShape(TeswaLayout.ProfileCoverRadius))
                        .background(
                            Brush.linearGradient(
                                listOf(
                                    MaterialTheme.colorScheme.primaryContainer,
                                    MaterialTheme.colorScheme.surfaceVariant,
                                    MaterialTheme.colorScheme.secondaryContainer,
                                ),
                            ),
                        ),
                ) {
                    TeswaMarkIcon(
                        mark = TeswaMark.Me,
                        color = MaterialTheme.colorScheme.primary.copy(alpha = .55f),
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(TeswaSpacing.lg),
                        size = 42.dp,
                    )
                    TeswaArchiveLabel(
                        text = "IDENTITY / TESWA",
                        modifier = Modifier
                            .align(Alignment.BottomEnd)
                            .padding(TeswaSpacing.md),
                        tone = MaterialTheme.colorScheme.surface.copy(alpha = .88f),
                    )
                }
            }

            Surface(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(horizontal = TeswaSpacing.md),
                shape = MaterialTheme.shapes.extraLarge,
                color = MaterialTheme.colorScheme.surface.copy(alpha = .96f),
                tonalElevation = 0.dp,
            ) {
                Row(
                    modifier = Modifier.padding(TeswaSpacing.md),
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    NetworkImage(
                        url = profile.avatarUrl,
                        contentDescription = profile.displayName,
                        modifier = Modifier
                            .size(TeswaLayout.ProfileAvatarLarge)
                            .clip(CircleShape),
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
                    ) {
                        Text(
                            text = profile.displayName,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = "@${profile.username}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        if (location.isNotBlank()) {
                            Text(
                                text = location,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        profile.profileTagline?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }

        EvidenceArchive(profile)
    }
}

@Composable
private fun EvidenceArchive(profile: MyProfile) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .26f),
        shape = MaterialTheme.shapes.large,
        tonalElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(TeswaSpacing.lg),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TeswaMarkIcon(
                    mark = TeswaMark.Me,
                    color = MaterialTheme.colorScheme.secondary,
                    size = 24.dp,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text("الأثر", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "دليل ناتج عن علاقات حصلت، مش عدادات اجتماعية.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            TeswaEvidenceLine(
                icon = TeswaIcons.Accepted,
                text = "${profile.successfulSwapsCount} تبديلات مكتملة",
                supporting = "كل واحدة منها وصلت من اتفاق رقمي لحاجة حصلت في الواقع.",
            )
            TeswaEvidenceLine(
                icon = TeswaIcons.Conversation,
                text = profile.responseRate?.let { "معدل الرد $it%" } ?: "معدل الرد لسه مش متاح",
                supporting = "إشارة مساعدة وقت ما حد يفكر يبدأ علاقة جديدة معاك.",
            )
        }
    }
}

@Composable
private fun MyListingRow(
    listing: MyListing,
    working: Boolean,
    onAction: (ListingAction) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        TeswaObjectRow(
            item = TeswaObjectIdentity(
                title = listing.title,
                imageUrl = listing.imageUrl,
                meta = listOfNotNull(listing.category, listing.city)
                    .filter { it.isNotBlank() }
                    .joinToString(" • ")
                    .takeIf { it.isNotBlank() },
                owner = listing.openIncomingOffersCount.takeIf { it > 0 }?.let { "$it عروض مفتوحة" },
            ),
            state = listingStatus(listing.status),
            stateEmphasis = listingEmphasis(listing.status),
        )

        if (working) {
            TeswaInlineLoading("بنحدّث حالة الحاجة…")
        } else {
            when (listing.status) {
                "active" -> TeswaSecondaryAction(
                    text = "أرشفة",
                    icon = TeswaIcons.Archive,
                    onClick = { onAction(ListingAction.ARCHIVE) },
                )

                "archived" -> Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                ) {
                    TeswaSecondaryAction(
                        text = "إعادة نشر",
                        icon = TeswaIcons.Refresh,
                        onClick = { onAction(ListingAction.REACTIVATE) },
                        modifier = Modifier.weight(1f),
                    )
                    TeswaSecondaryAction(
                        text = "حذف",
                        icon = TeswaIcons.Delete,
                        onClick = { onAction(ListingAction.DELETE_ARCHIVED) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileEditContent(
    holder: ProfileStateHolder,
    draft: ProfileEditDraft,
    modifier: Modifier,
) {
    val scope = rememberCoroutineScope()

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = TeswaSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
    ) {
        item {
            TeswaFocusedHeader(
                title = "تعديل الملف",
                onBack = holder::cancelEdit,
            )
        }
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
            ) {
                ProfileImageEditor(holder)
                EditField("الاسم", draft.displayName, 80) {
                    holder.updateDraft(draft.copy(displayName = it))
                }
                EditField("اسم المستخدم", draft.username, 30) {
                    holder.updateDraft(draft.copy(username = it.lowercase()))
                }
                EditField("جملة تعريفية", draft.profileTagline, 160) {
                    holder.updateDraft(draft.copy(profileTagline = it))
                }
                EditField("نبذة", draft.bio, 1_000, minLines = 4) {
                    holder.updateDraft(draft.copy(bio = it))
                }
                EditField("المدينة", draft.city, 120) {
                    holder.updateDraft(draft.copy(city = it))
                }
                EditField("المنطقة", draft.area, 120) {
                    holder.updateDraft(draft.copy(area = it))
                }
                holder.message?.let {
                    ProfileMessage(it, holder.messageIsError)
                }
                TeswaPrimaryAction(
                    text = "حفظ التغييرات",
                    loading = holder.savingProfile,
                    enabled = !holder.savingProfile,
                    onClick = { scope.launch { holder.saveProfile() } },
                )
            }
        }
    }
}

@Composable
private fun EditField(
    label: String,
    value: String,
    max: Int,
    minLines: Int = 1,
    onValue: (String) -> Unit,
) {
    TeswaTextField(
        value = value,
        onValueChange = { onValue(it.take(max)) },
        label = label,
        supportingText = "${value.length} / $max",
        singleLine = minLines == 1,
        minLines = minLines,
        maxLines = maxOf(minLines, 5),
    )
}

@Composable
private fun ProfileMessage(
    message: String,
    isError: Boolean,
) {
    TeswaInlineMessage(
        title = if (isError) "التحديث مكملش" else "اتحدث",
        body = message,
        emphasis = if (isError) TeswaEmphasis.Strong else TeswaEmphasis.Normal,
    )
}

@Composable
private fun ProfileCenter(
    message: String,
    modifier: Modifier,
    loading: Boolean = false,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null,
    error: Boolean = false,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(TeswaLayout.RootContentPadding),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (loading) {
            TeswaInlineLoading(message)
        } else {
            TeswaInlineMessage(
                title = if (error) "ملفك ما ظهرش" else "مفيش بيانات لسه",
                body = message,
                emphasis = if (error) TeswaEmphasis.Strong else TeswaEmphasis.Quiet,
                actionLabel = primary?.first,
                onAction = primary?.second,
            )
            secondary?.let {
                Spacer(Modifier.height(TeswaSpacing.sm))
                TeswaSecondaryAction(
                    text = it.first,
                    onClick = it.second,
                )
            }
        }
    }
}

private fun listingStatus(value: String) = when (value) {
    "active" -> "في اللعب"
    "reserved" -> "مرتبط بتبديل"
    "swapped" -> "اتبدّل"
    "archived" -> "مؤرشف"
    else -> value
}

private fun listingEmphasis(value: String): TeswaEmphasis = when (value) {
    "active" -> TeswaEmphasis.Strong
    "reserved" -> TeswaEmphasis.Normal
    "swapped" -> TeswaEmphasis.Commitment
    else -> TeswaEmphasis.Quiet
}

private fun actionTitle(action: ListingAction) = when (action) {
    ListingAction.ARCHIVE -> "أرشفة العنصر؟"
    ListingAction.REACTIVATE -> "إعادة نشر العنصر؟"
    ListingAction.DELETE_ARCHIVED -> "حذف العنصر نهائيًا؟"
}

private fun actionButton(action: ListingAction) = when (action) {
    ListingAction.ARCHIVE -> "أرشفة"
    ListingAction.REACTIVATE -> "إعادة نشر"
    ListingAction.DELETE_ARCHIVED -> "حذف نهائي"
}

private fun actionDescription(action: ListingAction, title: String) = when (action) {
    ListingAction.ARCHIVE -> "هيختفي «$title» من المساحة العامة، وتقدر ترجعه لاحقًا لو مفيش عروض مفتوحة."
    ListingAction.REACTIVATE -> "«$title» هيرجع ظاهر للناس ويستقبل عروض جديدة."
    ListingAction.DELETE_ARCHIVED -> "الحذف النهائي ما ينفعش يتراجع، وOracle هيرفضه لو للعنصر تاريخ تبديل."
}
