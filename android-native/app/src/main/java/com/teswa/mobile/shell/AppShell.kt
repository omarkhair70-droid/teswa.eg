package com.teswa.mobile.shell

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
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
import com.teswa.mobile.feature.dolab.ProfileDolabHost
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
import com.teswa.mobile.ui.system.TeswaIcons
import kotlinx.coroutines.launch

private enum class AppTab(
    val label: String,
    val icon: ImageVector,
    val showInBottomBar: Boolean = true,
) {
    HOME("الرئيسية", TeswaIcons.Explore),
    DISCOVER("اكتشف", TeswaIcons.Search),
    ADD("حط حاجة", TeswaIcons.PutIntoPlay),
    MESSAGES("بيننا", TeswaIcons.BetweenUs),
    NOTIFICATIONS("تنبيهات", TeswaIcons.Notifications, showInBottomBar = false),
    PROFILE("أنا", TeswaIcons.Me),
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
    var selectedTab by remember { mutableStateOf(AppTab.HOME) }
    var externalItemId by remember { mutableStateOf<String?>(null) }
    var externalDealId by remember { mutableStateOf<String?>(null) }
    var openOffers by remember { mutableStateOf(false) }
    var externalProfileId by remember { mutableStateOf<String?>(null) }
    var externalDirectId by remember { mutableStateOf<String?>(null) }
    var externalDirectTarget by remember { mutableStateOf<DirectComposeTarget?>(null) }
    var externalContextualId by remember { mutableStateOf<String?>(null) }
    var reportTarget by remember { mutableStateOf<ReportTarget?>(null) }
    var notificationPermissionRequested by remember { mutableStateOf(false) }

    fun syncPush() {
        scope.launch {
            when (val result = nativePushManager.sync(session)) {
                is PushRegistrationResult.Success -> session = result.session
                is PushRegistrationResult.Failure -> result.session?.let { session = it }
            }
        }
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

    LaunchedEffect(selectedTab) {
        if (
            selectedTab == AppTab.NOTIFICATIONS &&
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

    LaunchedEffect(launchRoute) {
        when (val route = NativeRouteParser.parse(launchRoute)) {
            is NativeRoute.Item -> { externalItemId = route.id; selectedTab = AppTab.HOME }
            is NativeRoute.Deal -> { externalDealId = route.id; selectedTab = AppTab.MESSAGES }
            is NativeRoute.Offer -> { openOffers = true; selectedTab = AppTab.MESSAGES }
            is NativeRoute.Profile -> { externalProfileId = route.id; selectedTab = AppTab.HOME }
            is NativeRoute.Direct -> { externalDirectId = route.id; selectedTab = AppTab.MESSAGES }
            is NativeRoute.Contextual -> { externalContextualId = route.id; selectedTab = AppTab.MESSAGES }
            NativeRoute.Notifications -> selectedTab = AppTab.NOTIFICATIONS
            null -> Unit
        }
        if (launchRoute != null) onLaunchRouteConsumed()
    }

    Scaffold(
        bottomBar = {
            NavigationBar {
                AppTab.entries.filter { it.showInBottomBar }.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = {
                            Icon(
                                imageVector = tab.icon,
                                contentDescription = tab.label,
                            )
                        },
                        label = { Text(tab.label) },
                    )
                }
            }
        },
    ) { padding ->
        when (selectedTab) {
            AppTab.HOME -> HomeScreen(
                initialSession = session,
                client = homeClient,
                editListingRepository = editListingRepository,
                locationProvider = locationProvider,
                offersRepository = offersRepository,
                publicProfileRepository = publicProfileRepository,
                storyRepository = storyRepository,
                onSessionUpdated = { session = it },
                onSignOut = signOutAndDisable,
                modifier = Modifier.padding(padding),
                onOfferCreated = { selectedTab = AppTab.MESSAGES },
                onAddItem = { selectedTab = AppTab.ADD },
                onNotifications = { selectedTab = AppTab.NOTIFICATIONS },
                externalItemId = externalItemId,
                onExternalItemConsumed = { externalItemId = null },
                externalProfileId = externalProfileId,
                onExternalProfileConsumed = { externalProfileId = null },
                onStartDirect = { target ->
                    externalDirectTarget = target
                    selectedTab = AppTab.MESSAGES
                },
                onStoryReplyOpened = { conversationId ->
                    externalContextualId = conversationId
                    selectedTab = AppTab.MESSAGES
                },
                onReport = { reportTarget = it },
            )

            AppTab.DISCOVER -> DiscoverScreen(
                initialSession = session,
                repository = discoverRepository,
                peopleRepository = peopleRepository,
                motionRepository = motionRepository,
                motionLocationResolver = motionLocationResolver,
                locationProvider = locationProvider,
                onSessionUpdated = { session = it },
                onSessionExpired = signOutAndDisable,
                onOpenItem = { itemId ->
                    externalItemId = itemId
                    selectedTab = AppTab.HOME
                },
                onOpenProfile = { profileId ->
                    externalProfileId = profileId
                    selectedTab = AppTab.HOME
                },
                onOpenStories = { selectedTab = AppTab.HOME },
                modifier = Modifier.padding(padding),
            )

            AppTab.ADD -> AddItemScreen(
                initialSession = session,
                repository = addItemRepository,
                locationProvider = locationProvider,
                onSessionUpdated = { session = it },
                onSessionExpired = signOutAndDisable,
                onPublished = { selectedTab = AppTab.HOME },
                modifier = Modifier.padding(padding),
            )

            AppTab.MESSAGES -> MessagingScreen(
                modifier = Modifier.padding(padding),
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
            )

            AppTab.NOTIFICATIONS -> NotificationsScreen(
                modifier = Modifier.padding(padding),
                initialSession = session,
                repository = notificationsRepository,
                onSessionUpdated = { session = it },
                onSessionExpired = signOutAndDisable,
                onBack = { selectedTab = AppTab.HOME },
                onDestination = { destination ->
                    when (destination) {
                        is NotificationDestination.Item -> {
                            externalItemId = destination.id
                            selectedTab = AppTab.HOME
                        }
                        is NotificationDestination.Deal -> {
                            externalDealId = destination.id
                            selectedTab = AppTab.MESSAGES
                        }
                        is NotificationDestination.Offer -> {
                            openOffers = true
                            selectedTab = AppTab.MESSAGES
                        }
                        is NotificationDestination.Profile -> {
                            externalProfileId = destination.id
                            selectedTab = AppTab.HOME
                        }
                        is NotificationDestination.Direct -> {
                            externalDirectId = destination.route.substringAfterLast('/').takeIf { it.length == 36 }
                            selectedTab = AppTab.MESSAGES
                        }
                        is NotificationDestination.Contextual -> {
                            externalContextualId = destination.id
                            selectedTab = AppTab.MESSAGES
                        }
                    }
                },
            )

            AppTab.PROFILE -> ProfileDolabHost(
                modifier = Modifier.padding(padding),
                initialSession = session,
                profileRepository = profileRepository,
                profileImageRepository = profileImageRepository,
                settingsRepository = settingsRepository,
                dolabRepository = dolabRepository,
                onSessionUpdated = { session = it },
                onSessionExpired = signOutAndDisable,
                onAddItem = { selectedTab = AppTab.ADD },
                onContinueAsListing = { item ->
                    when (val result = dolabAddItemHandoff.prepareAndPersist(session, item)) {
                        is DolabAddItemHandoffResult.Success -> {
                            session = result.session
                            selectedTab = AppTab.ADD
                            null
                        }
                        is DolabAddItemHandoffResult.Failure -> {
                            result.session?.let { session = it }
                            result.message
                        }
                    }
                },
                onSignOut = signOutAndDisable,
            )
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
