package com.teswa.mobile.home

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.content.ContextCompat
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.additem.EditListingRepository
import com.teswa.mobile.feature.direct.DirectComposeTarget
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.feature.profile.PublicProfileRepository
import com.teswa.mobile.feature.profile.PublicProfileScreen
import com.teswa.mobile.feature.safety.ReportTarget
import com.teswa.mobile.feature.stories.StoriesRail
import com.teswa.mobile.feature.stories.StoryCreateScreen
import com.teswa.mobile.feature.stories.StoryManageScreen
import com.teswa.mobile.feature.stories.StoryRepository
import com.teswa.mobile.feature.stories.StoryStateHolder
import com.teswa.mobile.feature.stories.StoryViewerScreen
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaIconAction
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaObjectIdentity
import com.teswa.mobile.ui.system.TeswaObjectStage
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaScreenHeading
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(
    initialSession: AuthSession,
    client: OracleHomeClient,
    editListingRepository: EditListingRepository,
    locationProvider: CurrentLocationProvider,
    offersRepository: OffersRepository,
    publicProfileRepository: PublicProfileRepository,
    storyRepository: StoryRepository,
    onSignOut: suspend () -> Unit,
    modifier: Modifier = Modifier,
    onSessionUpdated: (AuthSession) -> Unit = {},
    onOfferCreated: () -> Unit = {},
    onAddItem: () -> Unit = {},
    onSearch: () -> Unit = {},
    onNotifications: () -> Unit = {},
    externalItemId: String? = null,
    onExternalItemConsumed: () -> Unit = {},
    externalProfileId: String? = null,
    onExternalProfileConsumed: () -> Unit = {},
    onStartDirect: (DirectComposeTarget) -> Unit = {},
    onStoryReplyOpened: (String) -> Unit = {},
    onReport: (ReportTarget) -> Unit = {},
) {
    val holder = remember(initialSession.user.id, client) { HomeStateHolder(initialSession, client) }
    val storyHolder = remember(initialSession.user.id, storyRepository) { StoryStateHolder(initialSession, storyRepository) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var selectedProfileId by remember { mutableStateOf<String?>(null) }
    var creatingStory by remember { mutableStateOf(false) }
    var managingStories by remember { mutableStateOf(false) }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) scope.launch { holder.enableNearby(locationProvider) }
        else holder.showNotice("إذن الموقع اترفض. تقدر تكمل استخدام تِسوى عادي.")
    }

    fun requestNearby() {
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (coarse || fine) scope.launch { holder.enableNearby(locationProvider) }
        else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
    }

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        storyHolder.updateSession(initialSession)
        holder.load()
        storyHolder.load()
    }

    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(storyHolder.session.accessToken) { onSessionUpdated(storyHolder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSignOut() }
    LaunchedEffect(storyHolder.sessionExpired) { if (storyHolder.sessionExpired) onSignOut() }

    LaunchedEffect(externalItemId) {
        externalItemId?.let {
            holder.openItem(it)
            onExternalItemConsumed()
        }
    }
    LaunchedEffect(externalProfileId) {
        externalProfileId?.let {
            selectedProfileId = it
            onExternalProfileConsumed()
        }
    }

    if (creatingStory) {
        StoryCreateScreen(
            initialSession = storyHolder.session,
            repository = storyRepository,
            onSessionUpdated = storyHolder::updateSession,
            onSessionExpired = onSignOut,
            onPublished = {
                creatingStory = false
                scope.launch { storyHolder.load() }
            },
            onBack = { creatingStory = false },
            modifier = modifier,
        )
        return
    }

    if (managingStories) {
        StoryManageScreen(
            initialSession = storyHolder.session,
            repository = storyRepository,
            onSessionUpdated = storyHolder::updateSession,
            onSessionExpired = onSignOut,
            onCreate = {
                managingStories = false
                creatingStory = true
            },
            onBack = {
                managingStories = false
                scope.launch { storyHolder.load(silent = true) }
            },
            modifier = modifier,
        )
        return
    }

    if (storyHolder.viewer != null) {
        StoryViewerScreen(
            holder = storyHolder,
            onReplyOpened = onStoryReplyOpened,
            onReport = onReport,
            modifier = modifier,
        )
        return
    }

    selectedProfileId?.let { profileId ->
        PublicProfileScreen(
            profileId = profileId,
            initialSession = holder.session,
            repository = publicProfileRepository,
            onSessionUpdated = holder::updateSession,
            onSessionExpired = onSignOut,
            onBack = { selectedProfileId = null },
            onOpenItem = { itemId -> selectedProfileId = null; holder.openItem(itemId) },
            onMessage = onStartDirect,
            onReport = onReport,
            modifier = modifier,
        )
        return
    }

    val selected = holder.selectedItemId
    if (selected != null) {
        Box(modifier = modifier.fillMaxSize()) {
            ItemDetailScreen(
                itemId = selected,
                initialSession = holder.session,
                client = client,
                editListingRepository = editListingRepository,
                offersRepository = offersRepository,
                onSessionUpdated = holder::updateSession,
                onSessionExpired = onSignOut,
                onBack = holder::closeItem,
                onOfferCreated = onOfferCreated,
                onAddItem = onAddItem,
                onOpenOwner = { selectedProfileId = it },
                onReport = onReport,
            )
        }
        return
    }

    when (val current = holder.state) {
        HomeUiState.Loading -> {
            Box(
                modifier = modifier.fillMaxSize(),
                contentAlignment = Alignment.Center,
            ) {
                TeswaInlineLoading("بنفتح الاحتمالات حواليك…")
            }
        }

        is HomeUiState.Empty -> {
            Column(
                modifier = modifier
                    .fillMaxSize()
                    .padding(TeswaLayout.RootContentPadding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                TeswaInlineMessage(
                    title = "مفيش حاجات ظاهرة دلوقتي",
                    body = current.message,
                    actionLabel = "حدّث",
                    onAction = { scope.launch { holder.load() } },
                )
                Spacer(Modifier.height(TeswaSpacing.sm))
                TeswaSecondaryAction(
                    text = "تسجيل الخروج",
                    onClick = { scope.launch { onSignOut() } },
                )
            }
        }

        is HomeUiState.Error -> {
            Column(
                modifier = modifier
                    .fillMaxSize()
                    .padding(TeswaLayout.RootContentPadding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                TeswaInlineMessage(
                    title = "الاحتمالات ما ظهرتش",
                    body = current.message,
                    emphasis = TeswaEmphasis.Strong,
                    actionLabel = "حاول تاني",
                    onAction = { scope.launch { holder.load() } },
                )
                Spacer(Modifier.height(TeswaSpacing.sm))
                TeswaSecondaryAction(
                    text = "تسجيل الخروج",
                    onClick = { scope.launch { onSignOut() } },
                )
            }
        }

        is HomeUiState.Content -> {
            LazyColumn(
                modifier = modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    horizontal = TeswaLayout.ScreenHorizontal,
                    vertical = TeswaLayout.ScreenVertical,
                ),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xl),
            ) {
                item {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                            verticalAlignment = Alignment.Top,
                        ) {
                            TeswaScreenHeading(
                                title = "اكتشف",
                                supporting = "حاجات أصحابها حطّوها في اللعب وفتحوها لاحتمال جديد.",
                                modifier = Modifier.weight(1f),
                            )
                            TeswaIconAction(
                                icon = TeswaIcons.Search,
                                contentDescription = "بحث",
                                onClick = onSearch,
                            )
                            TeswaIconAction(
                                icon = TeswaIcons.Notifications,
                                contentDescription = "التنبيهات",
                                onClick = onNotifications,
                            )
                        }

                        TeswaChoiceChip(
                            label = when {
                                holder.locationWorking -> "بنحدد القريب…"
                                holder.nearbyLocation != null -> "قريب مني"
                                else -> "الأقرب لي"
                            },
                            selected = holder.nearbyLocation != null,
                            onClick = {
                                if (holder.nearbyLocation == null) requestNearby()
                                else scope.launch { holder.disableNearby() }
                            },
                            leadingIcon = TeswaIcons.Location,
                        )

                        holder.notice?.let {
                            Text(
                                text = it,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                item {
                    StoriesRail(
                        storyHolder,
                        onCreate = { creatingStory = true },
                        onManage = { managingStories = true },
                    )
                }

                items(current.items, key = { it.id }) { item ->
                    HomeFeedObject(
                        item = item,
                        onOpen = { holder.openItem(item.id) },
                    )
                }

                if (current.items.isEmpty()) {
                    item {
                        TeswaInlineMessage(
                            title = "مفيش حاجات قريبة في النطاق ده",
                            body = "اقفل فلتر القريب وارجع لكل الاحتمالات المتاحة.",
                            actionLabel = "اعرض الكل",
                            onAction = { scope.launch { holder.disableNearby() } },
                        )
                    }
                }

                if (current.hasMore) {
                    item {
                        TeswaPrimaryAction(
                            text = "هات احتمالات أكتر",
                            loading = current.loadingMore,
                            onClick = { scope.launch { holder.loadMore() } },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeFeedObject(
    item: HomeFeedItem,
    onOpen: () -> Unit,
) {
    val meta = listOfNotNull(item.condition, item.city)
        .filter { it.isNotBlank() }
        .joinToString(" • ")
        .ifBlank { item.category.orEmpty() }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        TeswaObjectStage(
            item = TeswaObjectIdentity(
                title = item.title,
                imageUrl = item.coverImageUrl,
                meta = meta.takeIf { it.isNotBlank() },
                owner = item.ownerDisplayName?.takeIf { it.isNotBlank() }?.let { "عند $it" },
            ),
            eyebrow = item.category?.takeIf { it.isNotBlank() },
        )
        item.description?.takeIf { it.isNotBlank() }?.let { description ->
            Text(
                text = description,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}
