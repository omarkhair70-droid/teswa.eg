package com.teswa.mobile.feature.motion

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.teswa.mobile.auth.AuthSession
import kotlinx.coroutines.launch

@Composable
fun MotionScreen(
    initialSession: AuthSession,
    repository: MotionRepository,
    locationResolver: MotionLocationResolver,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onOpenItem: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenStories: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(initialSession.user.id, repository) { MotionStateHolder(initialSession, repository) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    BackHandler(onBack = onBack)

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) scope.launch { holder.enableCityPulse(locationResolver) }
        else holder.showLocationPermissionDenied()
    }

    fun requestCityPulse() {
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (coarse || fine) scope.launch { holder.enableCityPulse(locationResolver) }
        else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
    }

    MotionContent(
        feed = holder.feed,
        cityPulse = holder.cityPulse,
        onBack = onBack,
        onRefresh = { scope.launch { holder.load() } },
        onEnableCityPulse = ::requestCityPulse,
        onRefreshCityPulse = { scope.launch { holder.refreshCityPulse() } },
        onRetryCityPulse = { scope.launch { holder.retryCityPulse(locationResolver) } },
        onHideCityPulse = holder::hideCityPulse,
        onOpenItem = onOpenItem,
        onOpenProfile = onOpenProfile,
        onOpenStories = onOpenStories,
        modifier = modifier,
    )
}
