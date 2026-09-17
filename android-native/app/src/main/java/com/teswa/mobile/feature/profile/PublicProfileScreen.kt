package com.teswa.mobile.feature.profile

import androidx.activity.compose.BackHandler
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.direct.DirectComposeTarget
import com.teswa.mobile.feature.safety.ReportTarget
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaActionSheet
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaEvidenceLine
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaObjectMoment
import com.teswa.mobile.ui.system.TeswaObjectMomentVariant
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTraceNote
import kotlinx.coroutines.launch

@Composable
fun PublicProfileScreen(
    profileId: String,
    initialSession: AuthSession,
    repository: PublicProfileRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onBack: () -> Unit,
    onOpenItem: (String) -> Unit,
    onMessage: (DirectComposeTarget) -> Unit,
    onReport: (ReportTarget) -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(profileId, repository) { PublicProfileStateHolder(initialSession, profileId, repository) }
    val scope = rememberCoroutineScope()
    var confirmBlock by remember { mutableStateOf<Boolean?>(null) }
    var connectionsMode by remember(profileId) { mutableStateOf<ProfileConnectionsMode?>(null) }
    var nestedProfileId by remember(profileId) { mutableStateOf<String?>(null) }

    BackHandler {
        when {
            nestedProfileId != null -> nestedProfileId = null
            connectionsMode != null -> connectionsMode = null
            else -> onBack()
        }
    }
    LaunchedEffect(initialSession.accessToken) { holder.updateSession(initialSession); holder.load() }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    nestedProfileId?.let { nestedId ->
        PublicProfileScreen(
            profileId = nestedId,
            initialSession = holder.session,
            repository = repository,
            onSessionUpdated = holder::updateSession,
            onSessionExpired = onSessionExpired,
            onBack = { nestedProfileId = null },
            onOpenItem = onOpenItem,
            onMessage = onMessage,
            onReport = onReport,
            modifier = modifier,
        )
        return
    }

    connectionsMode?.let { mode ->
        ProfileConnectionsScreen(
            profileId = profileId,
            mode = mode,
            initialSession = holder.session,
            repository = repository,
            onSessionUpdated = holder::updateSession,
            onSessionExpired = onSessionExpired,
            onBack = { connectionsMode = null },
            onOpenProfile = { targetId ->
                connectionsMode = null
                nestedProfileId = targetId
            },
            modifier = modifier,
        )
        return
    }

    when (val state = holder.state) {
        PublicProfileUiState.Loading -> PublicCenter("بنحضّر الملف…", modifier, true)
        is PublicProfileUiState.Error -> PublicCenter(
            state.message,
            modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            secondary = "رجوع" to onBack,
        )
        is PublicProfileUiState.Ready -> {
            val profile = state.overview.profile
            val location = listOfNotNull(profile.area, profile.city)
                .filter { it.isNotBlank() }
                .joinToString("، ")
            Column(modifier.fillMaxSize()) {
                TeswaFocusedHeader(
                    title = "شخص على تِسوى",
                    onBack = onBack,
                    actionIcon = if (profile.id != holder.session.user.id) TeswaIcons.Report else null,
                    actionDescription = if (profile.id != holder.session.user.id) "الإبلاغ عن المستخدم" else null,
                    onAction = if (profile.id != holder.session.user.id) {
                        ({ onReport(ReportTarget.User(profile.id, profile.displayName)) })
                    } else null,
                )
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = TeswaLayout.FocusedContentPadding,
                    verticalArrangement = Arrangement.spacedBy(TeswaLayout.SectionGap),
                ) {
                    item {
                        PublicIdentityArchive(
                            displayName = profile.displayName,
                            username = profile.username,
                            avatarUrl = profile.avatarUrl,
                            coverUrl = profile.coverUrl,
                            tagline = profile.profileTagline,
                            location = location,
                            completed = profile.successfulSwapsCount,
                        )
                    }

                    holder.message?.let { message ->
                        item {
                            TeswaInlineMessage(
                                title = "الحالة ما اتحدثتش",
                                body = message,
                                emphasis = TeswaEmphasis.Strong,
                            )
                        }
                    }

                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
                            Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                                TeswaPrimaryAction(
                                    text = "اطلب كلام",
                                    icon = TeswaIcons.Conversation,
                                    onClick = {
                                        onMessage(
                                            DirectComposeTarget(
                                                userId = profile.id,
                                                displayName = profile.displayName,
                                                username = profile.username,
                                                avatarUrl = profile.avatarUrl,
                                            ),
                                        )
                                    },
                                    modifier = Modifier.weight(1f),
                                    enabled = holder.workingAction == null && !state.overview.blockedByMe && !state.overview.blockedMe,
                                )
                                TeswaSecondaryAction(
                                    text = if (state.overview.follow.followingByMe) "إلغاء المتابعة" else "متابعة",
                                    onClick = { scope.launch { holder.toggleFollow() } },
                                    modifier = Modifier.weight(1f),
                                    enabled = holder.workingAction == null && !state.overview.blockedByMe && !state.overview.blockedMe,
                                )
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                            ) {
                                TextButton(
                                    onClick = { connectionsMode = ProfileConnectionsMode.FOLLOWERS },
                                    modifier = Modifier.weight(1f),
                                ) { Text("${state.overview.follow.followerCount} متابع") }
                                TextButton(
                                    onClick = { connectionsMode = ProfileConnectionsMode.FOLLOWING },
                                    modifier = Modifier.weight(1f),
                                ) { Text("يتابع ${state.overview.follow.followingCount}") }
                                TextButton(
                                    onClick = { confirmBlock = !state.overview.blockedByMe },
                                    enabled = holder.workingAction == null,
                                    modifier = Modifier.weight(1f),
                                ) { Text(if (state.overview.blockedByMe) "فك الحظر" else "حظر") }
                            }
                            if (state.overview.blockedMe) {
                                Text(
                                    "الحساب ده قافل التفاعل معاك.",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.error,
                                )
                            }
                        }
                    }

                    item {
                        TrustSummary(state.overview.trust, state.overview.badges)
                    }

                    profile.bio?.takeIf { it.isNotBlank() }?.let { bio ->
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
                                TeswaSectionHeader("أثر عن الشخص")
                                TeswaTraceNote(bio)
                            }
                        }
                    }

                    item { TeswaSectionHeader("حاجاته في اللعب") }
                    if (state.overview.listings.isEmpty()) {
                        item {
                            TeswaEmptyField(
                                title = "مفيش حاجات نشطة",
                                body = "لما يفتح حاجة لاحتمال جديد هتظهر هنا.",
                            )
                        }
                    } else {
                        items(state.overview.listings, key = { it.id }) { listing ->
                            TeswaObjectMoment(
                                title = listing.title,
                                imageUrl = listing.imageUrl,
                                meta = listing.category?.takeIf { it.isNotBlank() },
                                owner = listOfNotNull(
                                    "عند ${profile.displayName}",
                                    listing.city?.takeIf { it.isNotBlank() },
                                ).joinToString(" · "),
                                archiveLabel = listing.city?.takeIf { it.isNotBlank() } ?: "في اللعب",
                                variant = TeswaObjectMomentVariant.Full,
                                onClick = { onOpenItem(listing.id) },
                            )
                        }
                    }
                }
            }
        }
    }

    confirmBlock?.let { block ->
        TeswaActionSheet(
            title = if (block) "حظر المستخدم؟" else "إلغاء الحظر؟",
            supporting = if (block) {
                "هيتقفل التفاعل الجديد بين الحسابين وتختفي علاقات المتابعة."
            } else {
                "هيبقى التفاعل متاح من جديد حسب إعدادات الخصوصية."
            },
            onDismiss = { confirmBlock = null },
        ) {
            TeswaPrimaryAction(
                text = if (block) "حظر المستخدم" else "إلغاء الحظر",
                icon = if (block) TeswaIcons.Block else TeswaIcons.Trust,
                onClick = { confirmBlock = null; scope.launch { holder.toggleBlock() } },
            )
            TextButton(onClick = { confirmBlock = null }, modifier = Modifier.fillMaxWidth()) {
                Text("رجوع")
            }
        }
    }
}

@Composable
private fun PublicIdentityArchive(
    displayName: String,
    username: String,
    avatarUrl: String?,
    coverUrl: String?,
    tagline: String?,
    location: String,
    completed: Int,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(228.dp),
        ) {
            if (coverUrl != null) {
                NetworkImage(
                    url = coverUrl,
                    contentDescription = "غلاف $displayName",
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
                                    MaterialTheme.colorScheme.secondaryContainer,
                                    MaterialTheme.colorScheme.surfaceVariant,
                                    MaterialTheme.colorScheme.primaryContainer,
                                ),
                            ),
                        ),
                ) {
                    TeswaMarkIcon(
                        mark = TeswaMark.Me,
                        color = MaterialTheme.colorScheme.secondary.copy(alpha = .6f),
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(TeswaSpacing.lg),
                        size = 42.dp,
                    )
                    TeswaArchiveLabel(
                        text = "PERSON / TESWA",
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
                        url = avatarUrl,
                        contentDescription = displayName,
                        modifier = Modifier
                            .size(TeswaLayout.ProfileAvatarLarge)
                            .clip(CircleShape),
                    )
                    Column(
                        modifier = Modifier.weight(1f),
                        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
                    ) {
                        Text(
                            displayName,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text("@$username", color = MaterialTheme.colorScheme.primary)
                        if (location.isNotBlank()) {
                            Text(
                                location,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }

        tagline?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.titleMedium,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .24f),
            shape = MaterialTheme.shapes.large,
            tonalElevation = 0.dp,
        ) {
            Row(
                modifier = Modifier.padding(TeswaSpacing.lg),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TeswaMarkIcon(
                    mark = TeswaMark.Me,
                    color = MaterialTheme.colorScheme.secondary,
                    size = 26.dp,
                )
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        "$completed تبديل مكتمل",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "أثر اتبنى من تبديلات أكدها الطرفان، مش رقم اجتماعي.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}

@Composable
private fun TrustSummary(metrics: TrustMetrics?, badges: List<ProfileBadge>) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm)) {
        TeswaSectionHeader("أدلة من التعامل")
        if (metrics == null) {
            TeswaInlineMessage(
                title = "الأدلة لسه بتتكوّن",
                body = "هتظهر هنا بعد تبديلات مكتملة وتقييمات مرتبطة بيها.",
                icon = TeswaIcons.Trust,
            )
        } else {
            TeswaInlineMessage(
                title = trustLevelLabel(metrics.trustLevelKey),
                body = trustLevelDescription(metrics.trustLevelKey),
                icon = TeswaIcons.Trust,
                emphasis = TeswaEmphasis.Normal,
            )
            TeswaEvidenceLine(
                icon = TeswaIcons.Accepted,
                text = "${metrics.completedDealsCount} صفقة مكتملة",
                supporting = "${metrics.totalReviewsReceived} تقييم مرتبط بنتائج حقيقية",
            )
            metrics.averageRating?.let { rating ->
                TeswaEvidenceLine(
                    icon = TeswaIcons.Review,
                    text = "متوسط التقييم ${String.format(java.util.Locale.US, "%.1f", rating)} من 5",
                )
            }
            metrics.responseRate?.let { response ->
                TeswaEvidenceLine(
                    icon = TeswaIcons.Conversation,
                    text = "معدل الرد ${response.toInt()}%",
                )
            }
            val signals = buildList {
                if (metrics.clearDescriptionCount > 0) add("وصف واضح")
                if (metrics.goodCommunicationCount > 0) add("تواصل جيد")
                if (metrics.onTimeCount > 0) add("ملتزم بالميعاد")
                if (metrics.respectfulSwapperCount > 0) add("محترم في التبديل")
            }
            if (signals.isNotEmpty()) {
                TeswaEvidenceLine(
                    icon = TeswaIcons.Safety,
                    text = signals.joinToString(" · "),
                    supporting = "إشارات متكررة من تقييمات صفقات مكتملة",
                )
            }
        }
        badges.sortedBy(ProfileBadge::priority).take(4).forEach { badge ->
            TeswaEvidenceLine(
                icon = TeswaIcons.Trust,
                text = badge.labelAr,
                supporting = badge.descriptionAr,
            )
        }
    }
}

private fun trustLevelLabel(key: String) = when (key) {
    "new_swapper" -> "لسه بيبدأ"
    "rising_swapper" -> "بيثبت حضوره"
    "reliable_swapper" -> "موثوق في التبديل"
    "trusted_swapper" -> "موثوق جدًا"
    else -> "مؤشر الثقة"
}

private fun trustLevelDescription(key: String) = when (key) {
    "new_swapper" -> "المؤشر بيتكوّن مع أول التبديلات والتقييمات."
    "rising_swapper" -> "عنده إشارات إيجابية أولية في التبديل والتواصل."
    "reliable_swapper" -> "عنده تجارب مكتملة وإشارات ثقة قوية."
    "trusted_swapper" -> "سجل قوي في التبديل والتقييمات والتواصل."
    else -> "الثقة مبنية على نشاط حقيقي داخل تِسوى."
}

@Composable
private fun PublicCenter(
    message: String,
    modifier: Modifier,
    loading: Boolean = false,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null,
) {
    Column(
        modifier.fillMaxSize().padding(TeswaLayout.ScreenHorizontal),
        verticalArrangement = Arrangement.Center,
    ) {
        if (loading) {
            TeswaInlineLoading(message)
        } else {
            TeswaInlineMessage(
                title = "الملف مش متاح دلوقتي",
                body = message,
                icon = TeswaIcons.Refresh,
                actionLabel = primary?.first,
                onAction = primary?.second,
            )
            secondary?.let { (label, action) ->
                Spacer(Modifier.height(TeswaSpacing.xs))
                TeswaSecondaryAction(text = label, onClick = action)
            }
        }
    }
}
