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
import com.teswa.mobile.feature.profile.ProfileScreen
import com.teswa.mobile.home.HomeScreen
import com.teswa.mobile.home.OracleHomeClient

private enum class AppTab(
    val label: String,
) {
    HOME("الرئيسية"),
    ADD("إضافة"),
    MESSAGES("الرسائل"),
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
    onSignOut: suspend () -> Unit,
) {
    var session by remember(initialSession.user.id) { mutableStateOf(initialSession) }
    var selectedTab by remember { mutableStateOf(AppTab.HOME) }

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
                onSessionUpdated = { session = it },
                onSignOut = onSignOut,
                modifier = Modifier.padding(padding),
                onOfferCreated = { selectedTab = AppTab.MESSAGES },
                onAddItem = { selectedTab = AppTab.ADD },
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
                onSessionUpdated = { session = it },
                onSessionExpired = onSignOut,
            )

            AppTab.PROFILE -> ProfileScreen(
                modifier = Modifier.padding(padding),
                initialSession = session,
                repository = profileRepository,
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
    AppTab.PROFILE -> "●"
}
