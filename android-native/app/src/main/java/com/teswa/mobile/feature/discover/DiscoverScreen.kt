package com.teswa.mobile.feature.discover

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import com.teswa.mobile.home.CurrentLocationProvider
import kotlinx.coroutines.launch

@Composable
fun DiscoverScreen(
    initialSession: AuthSession,
    repository: DiscoverRepository,
    locationProvider: CurrentLocationProvider,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onOpenItem: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenStories: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(initialSession.user.id, repository) { DiscoverStateHolder(initialSession, repository) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var queryDraft by remember { mutableStateOf("") }
    val locationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        if (grants.values.any { it }) scope.launch { holder.enableNearby(locationProvider) }
        else holder.showLocationPermissionDenied()
    }

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
        queryDraft = holder.filters.query
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    fun requestNearby() {
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (coarse || fine) scope.launch { holder.enableNearby(locationProvider) }
        else locationPermission.launch(arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION))
    }

    when (val current = holder.state) {
        DiscoverUiState.Loading -> DiscoverCentered("بنرتّب لك عالم تِسوى…", modifier, loading = true)
        is DiscoverUiState.Error -> DiscoverCentered(
            current.message,
            modifier,
            action = "حاول تاني" to { scope.launch { holder.load() } },
        )
        is DiscoverUiState.Empty -> DiscoverList(
            modifier = modifier,
            holder = holder,
            queryDraft = queryDraft,
            onQueryChange = { queryDraft = it.take(80) },
            categories = current.categories,
            people = current.people,
            emptyMessage = current.message,
            onApplyQuery = { scope.launch { holder.applyFilters(holder.filters.copy(query = queryDraft)) } },
            onSelectCategory = { value -> scope.launch { holder.applyFilters(holder.filters.copy(category = value)) } },
            onSelectCondition = { value -> scope.launch { holder.applyFilters(holder.filters.copy(condition = value)) } },
            onClearFilters = {
                queryDraft = ""
                scope.launch { holder.clearFilters() }
            },
            onNearby = ::requestNearby,
            onDisableNearby = { scope.launch { holder.disableNearby() } },
            onOpenProfile = onOpenProfile,
            onOpenItem = onOpenItem,
            onOpenStories = onOpenStories,
            onRefresh = { scope.launch { holder.refresh() } },
        )
        is DiscoverUiState.Content -> DiscoverList(
            modifier = modifier,
            holder = holder,
            queryDraft = queryDraft,
            onQueryChange = { queryDraft = it.take(80) },
            categories = current.categories,
            people = current.people,
            items = current.items,
            hasMore = current.hasMore,
            loadingMore = current.loadingMore,
            onApplyQuery = { scope.launch { holder.applyFilters(holder.filters.copy(query = queryDraft)) } },
            onSelectCategory = { value -> scope.launch { holder.applyFilters(holder.filters.copy(category = value)) } },
            onSelectCondition = { value -> scope.launch { holder.applyFilters(holder.filters.copy(condition = value)) } },
            onClearFilters = {
                queryDraft = ""
                scope.launch { holder.clearFilters() }
            },
            onNearby = ::requestNearby,
            onDisableNearby = { scope.launch { holder.disableNearby() } },
            onOpenProfile = onOpenProfile,
            onOpenItem = onOpenItem,
            onOpenStories = onOpenStories,
            onLoadMore = { scope.launch { holder.loadMore() } },
            onRefresh = { scope.launch { holder.refresh() } },
        )
    }
}
