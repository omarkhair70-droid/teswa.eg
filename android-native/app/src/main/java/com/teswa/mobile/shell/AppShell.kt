package com.teswa.mobile.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.additem.AddItemRepository
import com.teswa.mobile.feature.additem.AddItemScreen
import com.teswa.mobile.feature.messages.MessagingRepository
import com.teswa.mobile.feature.messages.MessagingScreen
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.home.HomeScreen
import com.teswa.mobile.home.OracleHomeClient
import kotlinx.coroutines.launch

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
                onSessionUpdated = { session = it },
                onSignOut = onSignOut,
                modifier = Modifier.padding(padding),
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

            AppTab.PROFILE -> ProfilePlaceholder(
                modifier = Modifier.padding(padding),
                session = session,
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

@Composable
private fun PendingNativeScreen(
    modifier: Modifier,
    title: String,
    description: String,
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            text = description,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ProfilePlaceholder(
    modifier: Modifier,
    session: AuthSession,
    onSignOut: suspend () -> Unit,
) {
    val scope = rememberCoroutineScope()
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = session.user.displayName ?: session.user.email ?: "حساب تِسوى",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
        )
        session.user.email?.let { email ->
            Spacer(Modifier.height(8.dp))
            Text(email, style = MaterialTheme.typography.bodyMedium)
        }
        Spacer(Modifier.height(18.dp))
        Text(
            text = "هنا هتلاقي عناصرِك وبيانات حسابك وإعدادات الخصوصية.",
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        Button(onClick = { scope.launch { onSignOut() } }) {
            Text("تسجيل الخروج")
        }
    }
}
