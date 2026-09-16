package com.teswa.mobile.feature.dolab

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.profile.ProfileImageRepository
import com.teswa.mobile.feature.profile.ProfileRepository
import com.teswa.mobile.feature.profile.ProfileScreen
import com.teswa.mobile.feature.settings.SettingsRepository

@Composable
fun ProfileDolabHost(
    initialSession: AuthSession,
    profileRepository: ProfileRepository,
    profileImageRepository: ProfileImageRepository,
    settingsRepository: SettingsRepository,
    dolabRepository: DolabRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onAddItem: () -> Unit,
    onContinueAsListing: suspend (DolabItem) -> String?,
    onSignOut: suspend () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showingDolab by remember { mutableStateOf(false) }

    if (showingDolab) {
        DolabScreen(
            initialSession = initialSession,
            repository = dolabRepository,
            onSessionUpdated = onSessionUpdated,
            onSessionExpired = onSessionExpired,
            onBack = { showingDolab = false },
            modifier = modifier,
            onContinueAsListing = onContinueAsListing,
        )
        return
    }

    Box(modifier) {
        ProfileScreen(
            initialSession = initialSession,
            repository = profileRepository,
            imageRepository = profileImageRepository,
            settingsRepository = settingsRepository,
            onSessionUpdated = onSessionUpdated,
            onSessionExpired = onSessionExpired,
            onAddItem = onAddItem,
            onSignOut = onSignOut,
            modifier = Modifier,
        )
        ExtendedFloatingActionButton(
            onClick = { showingDolab = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(18.dp),
            text = { Text("دولابي") },
            icon = { Text("◫") },
        )
    }
}
