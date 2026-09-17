package com.teswa.mobile

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.teswa.mobile.account.AccountGateRepository
import com.teswa.mobile.account.AccountGateScreen
import com.teswa.mobile.app.AppContainer
import com.teswa.mobile.auth.AuthEntryScreen
import com.teswa.mobile.auth.AuthRepository
import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthUiState
import com.teswa.mobile.feature.additem.AddItemRepository
import com.teswa.mobile.feature.additem.EditListingRepository
import com.teswa.mobile.feature.contextual.ContextualRepository
import com.teswa.mobile.feature.direct.DirectRepository
import com.teswa.mobile.feature.discover.DiscoverRepository
import com.teswa.mobile.feature.dolab.AndroidDolabAddItemHandoff
import com.teswa.mobile.feature.dolab.DolabRepository
import com.teswa.mobile.feature.messages.MessagingRepository
import com.teswa.mobile.feature.motion.MotionLocationResolver
import com.teswa.mobile.feature.motion.MotionRepository
import com.teswa.mobile.feature.notifications.NativePushManager
import com.teswa.mobile.feature.notifications.NotificationsRepository
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.feature.people.PeopleRepository
import com.teswa.mobile.feature.profile.ProfileImageRepository
import com.teswa.mobile.feature.profile.ProfileRepository
import com.teswa.mobile.feature.profile.PublicProfileRepository
import com.teswa.mobile.feature.reviews.ReviewRepository
import com.teswa.mobile.feature.safety.ReportingRepository
import com.teswa.mobile.feature.settings.SettingsRepository
import com.teswa.mobile.feature.stories.StoryRepository
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.home.CurrentLocationProvider
import com.teswa.mobile.home.OracleHomeClient
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
                        discoverRepository = container.discoverRepository,
                        peopleRepository = container.peopleRepository,
                        dolabRepository = container.dolabRepository,
                        dolabAddItemHandoff = container.dolabAddItemHandoff,
                        motionRepository = container.motionRepository,
                        motionLocationResolver = container.motionLocationResolver,
                        locationProvider = container.locationProvider,
                        addItemRepository = container.addItemRepository,
                        editListingRepository = container.editListingRepository,
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
                        reviewRepository = container.reviewRepository,
                        reportingRepository = container.reportingRepository,
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
                        discoverRepository = discoverRepository,
                        peopleRepository = peopleRepository,
                        dolabRepository = dolabRepository,
                        dolabAddItemHandoff = dolabAddItemHandoff,
                        motionRepository = motionRepository,
                        motionLocationResolver = motionLocationResolver,
                        locationProvider = locationProvider,
                        addItemRepository = addItemRepository,
                        editListingRepository = editListingRepository,
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
                        reviewRepository = reviewRepository,
                        reportingRepository = reportingRepository,
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
            AuthEntryScreen(
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
