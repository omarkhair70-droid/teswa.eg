package com.teswa.mobile.home

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.scaleIn
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
import androidx.compose.material3.Icon
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
import androidx.compose.ui.text.font.FontWeight
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
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaIconAction
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaMotion
import com.teswa.mobile.ui.system.TeswaObjectMoment
import com.teswa.mobile.ui.system.TeswaObjectMomentVariant
import com.teswa.mobile.ui.system.TeswaPrimaryAction
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
    onFocusedStateChanged: (Boolean) -> Unit = {},
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
    val focusedState = creatingStory ||
        managingStories ||
        storyHolder.viewer != null ||
        selectedProfileId != null ||
        holder.selectedItemId != null

    LaunchedEffect(focusedState) {
        onFocusedStateChanged(focusedState)
    }

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

    fun toggleNearby() {
        if (holder.nearbyLocation == null) requestNearby()
        else scope.launch { holder.disableNearby() }
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
            AnimatedVisibility(
                visible = true,
                enter = fadeIn(TeswaMotion.emphasized()) + scaleIn(
                    animationSpec = TeswaMotion.emphasized(),
                    initialScale = .985f,
                ),
            ) {
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
                item(key = "discover-masthead") {
                    DiscoverMasthead(
                        locationWorking = holder.locationWorking,
                        nearbyActive = holder.nearbyLocation != null,
                        onLocation = ::toggleNearby,
                        onSearch = onSearch,
                        onNotifications = onNotifications,
                    )
                    holder.notice?.let {
                        Spacer(Modifier.height(TeswaSpacing.xs))
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                current.items.firstOrNull()?.let { item ->
                    item(key = "hero:${item.id}") {
                        HomeFeedObject(
                            item = item,
                            variant = TeswaObjectMomentVariant.Hero,
                            onOpen = { holder.openItem(item.id) },
                        )
                    }
                }

                item(key = "stories-rail") {
                    StoriesRail(
                        storyHolder,
                        onCreate = { creatingStory = true },
                        onManage = { managingStories = true },
                    )
                }

                if (holder.nearbyLocation != null) {
                    item(key = "nearby-lens") {
                        NearbyLens(onShowAll = ::toggleNearby)
                    }
                }

                current.items.drop(1).chunked(3).forEachIndexed { clusterIndex, cluster ->
                    item(key = "object-cluster:$clusterIndex:${cluster.joinToString { it.id }}") {
                        HomeObjectCluster(
                            items = cluster,
                            onOpen = holder::openItem,
                        )
                    }
                }

                if (current.items.isEmpty()) {
                    item {
                        TeswaInlineMessage(
                            title = "مفيش حاجات قريبة في النطاق ده",
                            body = "اقفل القريب وارجع لكل الاحتمالات المتاحة.",
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
private fun DiscoverMasthead(
    locationWorking: Boolean,
    nearbyActive: Boolean,
    onLocation: () -> Unit,
    onSearch: () -> Unit,
    onNotifications: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TeswaMarkIcon(
                mark = TeswaMark.Possible,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = "اكتشف",
                modifier = Modifier.weight(1f),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
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
        Row(
            modifier = Modifier
                .clickable(onClick = onLocation)
                .padding(vertical = TeswaSpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = TeswaIcons.Location,
                contentDescription = null,
                tint = if (nearbyActive) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                text = when {
                    locationWorking -> "بنحدد القريب…"
                    nearbyActive -> "قريب منك"
                    else -> "شوف الحاجات الأقرب ليك"
                },
                style = MaterialTheme.typography.bodyMedium,
                color = if (nearbyActive) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun NearbyLens(onShowAll: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onShowAll)
            .padding(vertical = TeswaSpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = TeswaIcons.Nearby,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.secondary,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "قريب منك",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "الحاجات الظاهرة دلوقتي مترتبة حوالين إمكانية الوصول، مش حوالين ترند.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            text = "اعرض الكل",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun HomeObjectCluster(
    items: List<HomeFeedItem>,
    onOpen: (String) -> Unit,
) {
    if (items.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xl)) {
        if (items.size >= 2) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
                verticalAlignment = Alignment.Top,
            ) {
                HomeFeedObject(
                    item = items[0],
                    variant = TeswaObjectMomentVariant.CompactPortrait,
                    onOpen = { onOpen(items[0].id) },
                    modifier = Modifier.weight(1.18f),
                )
                HomeFeedObject(
                    item = items[1],
                    variant = TeswaObjectMomentVariant.CompactSquare,
                    onOpen = { onOpen(items[1].id) },
                    modifier = Modifier.weight(.82f),
                )
            }
        } else {
            HomeFeedObject(
                item = items[0],
                variant = TeswaObjectMomentVariant.Full,
                onOpen = { onOpen(items[0].id) },
            )
        }

        items.getOrNull(2)?.let { item ->
            HomeFeedObject(
                item = item,
                variant = TeswaObjectMomentVariant.Full,
                onOpen = { onOpen(item.id) },
            )
        }
    }
}

@Composable
private fun HomeFeedObject(
    item: HomeFeedItem,
    variant: TeswaObjectMomentVariant,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val meta = listOfNotNull(item.condition, item.category)
        .filter { it.isNotBlank() }
        .joinToString(" · ")
        .takeIf { it.isNotBlank() }
    val owner = item.ownerDisplayName
        ?.takeIf { it.isNotBlank() }
        ?.let { name -> listOfNotNull("عند $name", item.city?.takeIf { it.isNotBlank() }).joinToString(" · ") }
    val label = item.city?.takeIf { it.isNotBlank() } ?: item.condition?.takeIf { it.isNotBlank() }

    TeswaObjectMoment(
        title = item.title,
        imageUrl = item.coverImageUrl,
        meta = meta,
        owner = owner,
        trace = item.description?.takeIf { it.isNotBlank() },
        archiveLabel = label,
        variant = variant,
        onClick = onOpen,
        modifier = modifier,
    )
}
