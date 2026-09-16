package com.teswa.mobile.shell

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.additem.AddItemRepository
import com.teswa.mobile.feature.additem.AddItemScreen
import com.teswa.mobile.feature.messages.MessagingRepository
import com.teswa.mobile.feature.messages.MessagingScreen
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.feature.profile.ProfileRepository
import com.teswa.mobile.feature.profile.PublicProfileRepository
import com.teswa.mobile.feature.profile.ProfileScreen
import com.teswa.mobile.feature.settings.SettingsRepository
import com.teswa.mobile.feature.notifications.NotificationDestination
import com.teswa.mobile.feature.notifications.NotificationsRepository
import com.teswa.mobile.feature.notifications.NotificationsScreen
import com.teswa.mobile.feature.direct.DirectRepository
import com.teswa.mobile.feature.direct.DirectComposeTarget
import com.teswa.mobile.feature.contextual.ContextualRepository
import com.teswa.mobile.feature.stories.StoryRepository
import com.teswa.mobile.home.HomeScreen
import com.teswa.mobile.home.OracleHomeClient
import com.teswa.mobile.feature.voice.VoiceMediaRepository

private enum class AppTab(
    val label: String,
) {
    HOME("الرئيسية"),
    ADD("إضافة"),
    MESSAGES("الرسائل"),
    NOTIFICATIONS("تنبيهات"),
    PROFILE("حسابي"),
}

@Composable
fun AppShell(
    initialSession: AuthSession,
    homeClient: OracleHomeClient,
    addItemRepository: AddItemRepository,
    messagingRepository: MessagingRepository,
    offersRepository: OffersRepository,
    profileRepository: ProfileRepository,
    publicProfileRepository: PublicProfileRepository,
    settingsRepository: SettingsRepository,
    notificationsRepository: NotificationsRepository,
    directRepository: DirectRepository,
    contextualRepository: ContextualRepository,
    storyRepository: StoryRepository,
    voiceMediaRepository: VoiceMediaRepository,
    onSignOut: suspend () -> Unit,
) {
    var session by remember(initialSession.user.id) { mutableStateOf(initialSession) }
    var selectedTab by remember { mutableStateOf(AppTab.HOME) }
    var externalItemId by remember { mutableStateOf<String?>(null) }
    var externalDealId by remember { mutableStateOf<String?>(null) }
    var openOffers by remember { mutableStateOf(false) }
    var externalProfileId by remember { mutableStateOf<String?>(null) }
    var externalDirectId by remember { mutableStateOf<String?>(null) }
    var externalDirectTarget by remember { mutableStateOf<DirectComposeTarget?>(null) }
    var externalContextualId by remember { mutableStateOf<String?>(null) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                AppTab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = { Text(tabGlyph(tab)) },
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
                offersRepository = offersRepository,
                publicProfileRepository = publicProfileRepository,
                storyRepository = storyRepository,
                onSessionUpdated = { session = it },
                onSignOut = onSignOut,
                modifier = Modifier.padding(padding),
                onOfferCreated = { selectedTab = AppTab.MESSAGES },
                onAddItem = { selectedTab = AppTab.ADD },
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
            )

            AppTab.ADD -> AddItemScreen(
                initialSession = session,
                repository = addItemRepository,
                onSessionUpdated = { session = it },
                onSessionExpired = onSignOut,
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
                voiceMediaRepository = voiceMediaRepository,
                onSessionUpdated = { session = it },
                onSessionExpired = onSignOut,
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
            )

            AppTab.NOTIFICATIONS -> NotificationsScreen(
                modifier = Modifier.padding(padding),
                initialSession = session,
                repository = notificationsRepository,
                onSessionUpdated = { session = it },
                onSessionExpired = onSignOut,
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

            AppTab.PROFILE -> ProfileScreen(
                modifier = Modifier.padding(padding),
                initialSession = session,
                repository = profileRepository,
                settingsRepository = settingsRepository,
                onSessionUpdated = { session = it },
                onSessionExpired = onSignOut,
                onAddItem = { selectedTab = AppTab.ADD },
                onSignOut = onSignOut,
            )
        }
    }
}

private fun tabGlyph(tab: AppTab): String = when (tab) {
    AppTab.HOME -> "⌂"
    AppTab.ADD -> "+"
    AppTab.MESSAGES -> "✉"
    AppTab.NOTIFICATIONS -> "◉"
    AppTab.PROFILE -> "●"
}
