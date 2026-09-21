package com.teswa.mobile.shell

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.additem.AddItemRepository
import com.teswa.mobile.feature.additem.AddItemScreen
import com.teswa.mobile.feature.additem.EditListingRepository
import com.teswa.mobile.feature.contextual.ContextualRepository
import com.teswa.mobile.feature.direct.DirectComposeTarget
import com.teswa.mobile.feature.direct.DirectRepository
import com.teswa.mobile.feature.discover.DiscoverRepository
import com.teswa.mobile.feature.discover.DiscoverScreen
import com.teswa.mobile.feature.dolab.AndroidDolabAddItemHandoff
import com.teswa.mobile.feature.dolab.DolabAddItemHandoffResult
import com.teswa.mobile.feature.dolab.DolabRepository
import com.teswa.mobile.feature.dolab.DolabScreen
import com.teswa.mobile.feature.messages.MessagingRepository
import com.teswa.mobile.feature.messages.MessagingScreen
import com.teswa.mobile.feature.motion.MotionLocationResolver
import com.teswa.mobile.feature.motion.MotionRepository
import com.teswa.mobile.feature.notifications.NativePushManager
import com.teswa.mobile.feature.notifications.NotificationDestination
import com.teswa.mobile.feature.notifications.NotificationsRepository
import com.teswa.mobile.feature.notifications.NotificationsScreen
import com.teswa.mobile.feature.notifications.PushRegistrationResult
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.feature.people.PeopleRepository
import com.teswa.mobile.feature.profile.ProfileImageRepository
import com.teswa.mobile.feature.profile.ProfileRepository
import com.teswa.mobile.feature.profile.ProfileScreen
import com.teswa.mobile.feature.profile.PublicProfileRepository
import com.teswa.mobile.feature.reviews.ReviewRepository
import com.teswa.mobile.feature.safety.ReportTarget
import com.teswa.mobile.feature.safety.ReportingDialog
import com.teswa.mobile.feature.safety.ReportingRepository
import com.teswa.mobile.feature.settings.SettingsRepository
import com.teswa.mobile.feature.stories.StoryRepository
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.home.CurrentLocationProvider
import com.teswa.mobile.home.HomeScreen
import com.teswa.mobile.home.OracleHomeClient
import com.teswa.mobile.ui.system.TeswaRootDestination
import com.teswa.mobile.ui.system.TeswaRootNavigationBar
import kotlinx.coroutines.launch

private enum class ShellOverlay {
    ADD_ITEM,
    NOTIFICATIONS,
}

private enum class PossibleMode {
    FEED,
    SEARCH,
}

@Composable
fun AppShell(
    initialSession: AuthSession,
    homeClient: OracleHomeClient,
    discoverRepository: DiscoverRepository,
    peopleRepository: PeopleRepository,
    dolabRepository: DolabRepository,
    dolabAddItemHandoff: AndroidDolabAddItemHandoff,
    motionRepository: MotionRepository,
    motionLocationResolver: MotionLocationResolver,
    locationProvider: CurrentLocationProvider,
    addItemRepository: AddItemRepository,
    editListingRepository: EditListingRepository,
    messagingRepository: MessagingRepository,
    offersRepository: OffersRepository,
    profileRepository: ProfileRepository,
    profileImageRepository: ProfileImageRepository,
    publicProfileRepository: PublicProfileRepository,
    settingsRepository: SettingsRepository,
    notificationsRepository: NotificationsRepository,
    nativePushManager: NativePushManager,
    directRepository: DirectRepository,
    contextualRepository: ContextualRepository,
    storyRepository: StoryRepository,
    voiceMediaRepository: VoiceMediaRepository,
    reviewRepository: ReviewRepository,
    reportingRepository: ReportingRepository,
    launchRoute: String? = null,
    onLaunchRouteConsumed: () -> Unit = {},
    onSignOut: suspend () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var session by remember(initialSession.user.id) { mutableStateOf(initialSession) }
    var selectedRoot by remember { mutableStateOf(TeswaRootDestination.POSSIBLE) }
    var possibleMode by remember { mutableStateOf(PossibleMode.FEED) }
    var overlay by remember { mutableStateOf<ShellOverlay?>(null) }
    var suppressRootChrome by remember { mutableStateOf(false) }
    var externalItemId by remember { mutableStateOf<String?>(null) }
    var externalDealId by remember { mutableStateOf<String?>(null) }
    var openOffers by remember { mutableStateOf(false) }
    var externalProfileId by remember { mutableStateOf<String?>(null) }
    var externalDirectId by remember { mutableStateOf<String?>(null) }
    var externalDirectTarget by remember { mutableStateOf<DirectComposeTarget?>(null) }
    var externalContextualId by remember { mutableStateOf<String?>(null) }
    var reportTarget by remember { mutableStateOf<ReportTarget?>(null) }
    var returnDolabItemId by remember { mutableStateOf<String?>(null) }
    var notificationPermissionRequested by remember { mutableStateOf(false) }

    fun syncPush() {
        scope.launch {
            when (val result = nativePushManager.sync(session)) {
                is PushRegistrationResult.Success -> session = result.session
                is PushRegistrationResult.Failure -> result.session?.let { session = it }
            }
        }
    }

    fun selectRoot(destination: TeswaRootDestination) {
        overlay = null
        suppressRootChrome = false
        selectedRoot = destination
        if (destination == TeswaRootDestination.POSSIBLE) possibleMode = PossibleMode.FEED
    }

    fun goToMine() {
        overlay = null
        suppressRootChrome = false
        selectedRoot = TeswaRootDestination.MINE
    }

    fun openAddItem() {
        // Publication is intentionally entered only after a Dolab item crosses the
        // private -> public boundary through AndroidDolabAddItemHandoff.
        overlay = ShellOverlay.ADD_ITEM
    }

    fun openNotifications() {
        overlay = ShellOverlay.NOTIFICATIONS
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        notificationPermissionRequested = true
        if (granted) syncPush()
    }

    LaunchedEffect(initialSession.user.id) {
        if (
            Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        ) {
            syncPush()
        }
    }

    LaunchedEffect(overlay) {
        if (
            overlay == ShellOverlay.NOTIFICATIONS &&
            Build.VERSION.SDK_INT >= 33 &&
            !notificationPermissionRequested &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    val signOutAndDisable: suspend () -> Unit = {
        nativePushManager.disable(session)
        onSignOut()
    }

    BackHandler(
        enabled = overlay != null ||
            (selectedRoot == TeswaRootDestination.POSSIBLE && possibleMode == PossibleMode.SEARCH),
    ) {
        when {
            overlay != null -> overlay = null
            selectedRoot == TeswaRootDestination.POSSIBLE && possibleMode == PossibleMode.SEARCH -> {
                possibleMode = PossibleMode.FEED
                suppressRootChrome = false
            }
        }
    }

    LaunchedEffect(launchRoute) {
        when (val route = NativeRouteParser.parse(launchRoute)) {
            is NativeRoute.Item -> {
                overlay = null
                suppressRootChrome = false
                selectedRoot = TeswaRootDestination.POSSIBLE
                possibleMode = PossibleMode.FEED
                externalItemId = route.id
            }
            is NativeRoute.Deal -> {
                overlay = null
                suppressRootChrome = false
                selectedRoot = TeswaRootDestination.BETWEEN_US
                externalDealId = route.id
            }
            is NativeRoute.Offer -> {
                overlay = null
                suppressRootChrome = false
                selectedRoot = TeswaRootDestination.BETWEEN_US
                openOffers = true
            }
            is NativeRoute.Profile -> {
                overlay = null
                suppressRootChrome = false
                selectedRoot = TeswaRootDestination.POSSIBLE
                possibleMode = PossibleMode.FEED
                externalProfileId = route.id
            }
            is NativeRoute.Direct -> {
                overlay = null
                suppressRootChrome = false
                selectedRoot = TeswaRootDestination.BETWEEN_US
                externalDirectId = route.id
            }
            is NativeRoute.Contextual -> {
                overlay = null
                suppressRootChrome = false
                selectedRoot = TeswaRootDestination.BETWEEN_US
                externalContextualId = route.id
            }
            NativeRoute.Notifications -> openNotifications()
            null -> Unit
        }
        if (launchRoute != null) onLaunchRouteConsumed()
    }

    val searchFocused = selectedRoot == TeswaRootDestination.POSSIBLE && possibleMode == PossibleMode.SEARCH

    Scaffold(
        bottomBar = {
            if (overlay == null && !suppressRootChrome && !searchFocused) {
                TeswaRootNavigationBar(
                    selected = selectedRoot,
                    onSelect = ::selectRoot,
                )
            }
        },
    ) { padding ->
        val contentModifier = Modifier.padding(padding)
        when (overlay) {
            ShellOverlay.ADD_ITEM -> AddItemScreen(
                initialSession = session,
                repository = addItemRepository,
                locationProvider = locationProvider,
                onSessionUpdated = { session = it },
                onSessionExpired = signOutAndDisable,
                onPublished = {
                    overlay = null
                    suppressRootChrome = false
                    selectedRoot = TeswaRootDestination.MINE
                },
                modifier = contentModifier,
            )

            ShellOverlay.NOTIFICATIONS -> NotificationsScreen(
                modifier = contentModifier,
                initialSession = session,
                repository = notificationsRepository,
                onSessionUpdated = { session = it },
                onSessionExpired = signOutAndDisable,
                onBack = { overlay = null },
                onDestination = { destination ->
                    overlay = null
                    suppressRootChrome = false
                    when (destination) {
                        is NotificationDestination.Item -> {
                            selectedRoot = TeswaRootDestination.POSSIBLE
                            possibleMode = PossibleMode.FEED
                            externalItemId = destination.id
                        }
                        is NotificationDestination.Deal -> {
                            selectedRoot = TeswaRootDestination.BETWEEN_US
                            externalDealId = destination.id
                        }
                        is NotificationDestination.Offer -> {
                            selectedRoot = TeswaRootDestination.BETWEEN_US
                            openOffers = true
                        }
                        is NotificationDestination.Profile -> {
                            selectedRoot = TeswaRootDestination.POSSIBLE
                            possibleMode = PossibleMode.FEED
                            externalProfileId = destination.id
                        }
                        is NotificationDestination.Direct -> {
                            selectedRoot = TeswaRootDestination.BETWEEN_US
                            externalDirectId = destination.route.substringAfterLast('/').takeIf { it.length == 36 }
                        }
                        is NotificationDestination.Contextual -> {
                            selectedRoot = TeswaRootDestination.BETWEEN_US
                            externalContextualId = destination.id
                        }
                    }
                },
            )

            null -> when (selectedRoot) {
                TeswaRootDestination.POSSIBLE -> when (possibleMode) {
                    PossibleMode.FEED -> HomeScreen(
                        initialSession = session,
                        client = homeClient,
                        editListingRepository = editListingRepository,
                        locationProvider = locationProvider,
                        offersRepository = offersRepository,
                        publicProfileRepository = publicProfileRepository,
                        storyRepository = storyRepository,
                        onSessionUpdated = { session = it },
                        onSignOut = signOutAndDisable,
                        modifier = contentModifier,
                        onOfferCreated = {
                            suppressRootChrome = false
                            selectedRoot = TeswaRootDestination.BETWEEN_US
                        },
                        onAddItem = ::goToMine,
                        onSearch = {
                            suppressRootChrome = false
                            possibleMode = PossibleMode.SEARCH
                        },
                        onNotifications = ::openNotifications,
                        onFocusedStateChanged = { suppressRootChrome = it },
                        externalItemId = externalItemId,
                        onExternalItemConsumed = { externalItemId = null },
                        externalProfileId = externalProfileId,
                        onExternalProfileConsumed = { externalProfileId = null },
                        onStartDirect = { target ->
                            suppressRootChrome = false
                            externalDirectTarget = target
                            selectedRoot = TeswaRootDestination.BETWEEN_US
                        },
                        onStoryReplyOpened = { conversationId ->
                            suppressRootChrome = false
                            externalContextualId = conversationId
                            selectedRoot = TeswaRootDestination.BETWEEN_US
                        },
                        onReport = { reportTarget = it },
                    )

                    PossibleMode.SEARCH -> DiscoverScreen(
                        initialSession = session,
                        repository = discoverRepository,
                        peopleRepository = peopleRepository,
                        locationProvider = locationProvider,
                        onSessionUpdated = { session = it },
                        onSessionExpired = signOutAndDisable,
                        onOpenItem = { itemId ->
                            suppressRootChrome = false
                            externalItemId = itemId
                            possibleMode = PossibleMode.FEED
                        },
                        onOpenProfile = { profileId ->
                            suppressRootChrome = false
                            externalProfileId = profileId
                            possibleMode = PossibleMode.FEED
                        },
                        modifier = contentModifier,
                    )
                }

                TeswaRootDestination.MINE -> DolabScreen(
                    initialSession = session,
                    repository = dolabRepository,
                    onSessionUpdated = { session = it },
                    onSessionExpired = signOutAndDisable,
                    onBack = { selectedRoot = TeswaRootDestination.POSSIBLE },
                    modifier = contentModifier,
                    initialItemId = returnDolabItemId,
                    onInitialItemConsumed = { returnDolabItemId = null },
                    onFocusedStateChanged = { suppressRootChrome = it },
                    onOpenPublishedItem = { itemId ->
                        suppressRootChrome = false
                        selectedRoot = TeswaRootDestination.POSSIBLE
                        possibleMode = PossibleMode.FEED
                        externalItemId = itemId
                    },
                    onContinueAsListing = { item ->
                        when (val result = dolabAddItemHandoff.prepareAndPersist(session, item)) {
                            is DolabAddItemHandoffResult.Success -> {
                                session = result.session
                                returnDolabItemId = item.id
                                openAddItem()
                                null
                            }
                            is DolabAddItemHandoffResult.Failure -> {
                                result.session?.let { session = it }
                                result.message
                            }
                        }
                    },
                )

                TeswaRootDestination.BETWEEN_US -> MessagingScreen(
                    modifier = contentModifier,
                    initialSession = session,
                    repository = messagingRepository,
                    offersRepository = offersRepository,
                    directRepository = directRepository,
                    contextualRepository = contextualRepository,
                    dolabRepository = dolabRepository,
                    voiceMediaRepository = voiceMediaRepository,
                    reviewRepository = reviewRepository,
                    onSessionUpdated = { session = it },
                    onSessionExpired = signOutAndDisable,
                    initialDealId = externalDealId,
                    initialOffers = openOffers,
                    initialDirectId = externalDirectId,
                    initialDirectTarget = externalDirectTarget,
                    initialContextualId = externalContextualId,
                    onExternalTargetConsumed = {
                        externalDealId = null
                        openOffers = false
                        externalDirectId = null
                        externalDirectTarget = null
                        externalContextualId = null
                    },
                    onReport = { reportTarget = it },
                    onFocusedStateChanged = { suppressRootChrome = it },
                )

                TeswaRootDestination.ME -> ProfileScreen(
                    initialSession = session,
                    repository = profileRepository,
                    imageRepository = profileImageRepository,
                    settingsRepository = settingsRepository,
                    onSessionUpdated = { session = it },
                    onSessionExpired = signOutAndDisable,
                    onAddItem = ::goToMine,
                    onSignOut = signOutAndDisable,
                    modifier = contentModifier,
                    onFocusedStateChanged = { suppressRootChrome = it },
                )
            }
        }
    }

    reportTarget?.let { target ->
        ReportingDialog(
            target = target,
            initialSession = session,
            repository = reportingRepository,
            onSessionUpdated = { session = it },
            onSessionExpired = signOutAndDisable,
            onDismiss = { reportTarget = null },
        )
    }
}
