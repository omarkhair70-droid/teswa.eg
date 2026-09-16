package com.teswa.mobile

import android.os.Bundle
import android.content.Intent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.teswa.mobile.account.AccountGateRepository
import com.teswa.mobile.account.AccountGateScreen
import com.teswa.mobile.app.AppContainer
import com.teswa.mobile.auth.AuthRepository
import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthUiState
import com.teswa.mobile.feature.additem.AddItemRepository
import com.teswa.mobile.feature.messages.MessagingRepository
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.feature.profile.ProfileRepository
import com.teswa.mobile.feature.profile.PublicProfileRepository
import com.teswa.mobile.feature.profile.ProfileImageRepository
import com.teswa.mobile.feature.settings.SettingsRepository
import com.teswa.mobile.feature.notifications.NotificationsRepository
import com.teswa.mobile.feature.notifications.NativePushManager
import com.teswa.mobile.feature.direct.DirectRepository
import com.teswa.mobile.feature.contextual.ContextualRepository
import com.teswa.mobile.feature.stories.StoryRepository
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.home.OracleHomeClient
import com.teswa.mobile.home.CurrentLocationProvider
import com.teswa.mobile.shell.AppShell
import com.teswa.mobile.shell.NativeRouteParser
import com.teswa.mobile.ui.theme.TeswaTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private var pendingRoute by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        pendingRoute = NativeRouteParser.fromIntent(intent)
        val container = AppContainer(applicationContext)

        setContent {
            TeswaTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    TeswaAuthScreen(
                        repository = container.authRepository,
                        accountGateRepository = container.accountGateRepository,
                        homeClient = container.homeClient,
                        locationProvider = container.locationProvider,
                        addItemRepository = container.addItemRepository,
                        messagingRepository = container.messagingRepository,
                        offersRepository = container.offersRepository,
                        profileRepository = container.profileRepository,
                        profileImageRepository = container.profileImageRepository,
                        publicProfileRepository = container.publicProfileRepository,
                        settingsRepository = container.settingsRepository,
                        notificationsRepository = container.notificationsRepository,
                        nativePushManager = container.nativePushManager,
                        directRepository = container.directRepository,
                        contextualRepository = container.contextualRepository,
                        storyRepository = container.storyRepository,
                        voiceMediaRepository = container.voiceMediaRepository,
                        launchRoute = pendingRoute,
                        onLaunchRouteConsumed = { pendingRoute = null },
                        activity = this@MainActivity,
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingRoute = NativeRouteParser.fromIntent(intent)
    }
}

@Composable
private fun TeswaAuthScreen(
    repository: AuthRepository,
    accountGateRepository: AccountGateRepository,
    homeClient: OracleHomeClient,
    locationProvider: CurrentLocationProvider,
    addItemRepository: AddItemRepository,
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
    launchRoute: String?,
    onLaunchRouteConsumed: () -> Unit,
    activity: ComponentActivity,
) {
    var state by remember { mutableStateOf<AuthUiState>(AuthUiState.Restoring) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        state = when (val restored = repository.restore()) {
            is AuthResult.Success -> restored.value?.let(AuthUiState::SignedIn) ?: AuthUiState.SignedOut
            is AuthResult.Failure -> AuthUiState.Error(restored.message)
        }
    }

    when (val current = state) {
        is AuthUiState.SignedIn -> {
            AccountGateScreen(
                session = current.session,
                repository = accountGateRepository,
                modifier = Modifier.fillMaxSize(),
                onSignOut = {
                    nativePushManager.disable(current.session)
                    repository.signOut()
                    state = AuthUiState.SignedOut
                },
                readyContent = { readySession, _ ->
                    AppShell(
                        initialSession = readySession,
                        homeClient = homeClient,
                        locationProvider = locationProvider,
                        addItemRepository = addItemRepository,
                        messagingRepository = messagingRepository,
                        offersRepository = offersRepository,
                        profileRepository = profileRepository,
                        profileImageRepository = profileImageRepository,
                        publicProfileRepository = publicProfileRepository,
                        settingsRepository = settingsRepository,
                        notificationsRepository = notificationsRepository,
                        nativePushManager = nativePushManager,
                        directRepository = directRepository,
                        contextualRepository = contextualRepository,
                        storyRepository = storyRepository,
                        voiceMediaRepository = voiceMediaRepository,
                        launchRoute = launchRoute,
                        onLaunchRouteConsumed = onLaunchRouteConsumed,
                        onSignOut = {
                            repository.signOut()
                            state = AuthUiState.SignedOut
                        },
                    )
                },
            )
        }

        else -> {
            AuthEntryContent(
                state = current,
                onGoogleSignIn = {
                    state = AuthUiState.Working("جاري تسجيل الدخول…")
                    scope.launch {
                        state = when (val result = repository.signInWithGoogle(activity)) {
                            is AuthResult.Success -> AuthUiState.SignedIn(result.value)
                            is AuthResult.Failure -> {
                                if (result.reason == AuthResult.Reason.CANCELLED) AuthUiState.SignedOut
                                else AuthUiState.Error(result.message)
                            }
                        }
                    }
                },
                onRetry = { state = AuthUiState.SignedOut },
            )
        }
    }
}

@Composable
private fun AuthEntryContent(
    state: AuthUiState,
    onGoogleSignIn: () -> Unit,
    onRetry: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 28.dp, vertical = 36.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "تِسوى",
            style = MaterialTheme.typography.displaySmall,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(12.dp))

        when (state) {
            AuthUiState.Restoring -> {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text("جاري استعادة جلستك…")
            }

            AuthUiState.SignedOut -> {
                Text(
                    text = "سجّل دخولك بحساب Google",
                    style = MaterialTheme.typography.titleMedium,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(20.dp))
                Button(onClick = onGoogleSignIn) {
                    Text("المتابعة باستخدام Google")
                }
            }

            is AuthUiState.Working -> {
                CircularProgressIndicator()
                Spacer(Modifier.height(16.dp))
                Text(state.message)
            }

            is AuthUiState.Error -> {
                Text(
                    text = state.message,
                    color = MaterialTheme.colorScheme.error,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(16.dp))
                Button(onClick = onRetry) {
                    Text("حاول مرة تانية")
                }
            }

            is AuthUiState.SignedIn -> Unit
        }
    }
}
