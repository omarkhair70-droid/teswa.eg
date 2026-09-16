package com.teswa.mobile.feature.people

import androidx.activity.compose.BackHandler
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.teswa.mobile.auth.AuthSession
import kotlinx.coroutines.launch

@Composable
fun PeopleScreen(
    initialSession: AuthSession,
    repository: PeopleRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onOpenProfile: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(initialSession.user.id, repository) { PeopleStateHolder(initialSession, repository) }
    val scope = rememberCoroutineScope()
    var queryDraft by remember { mutableStateOf("") }
    BackHandler(onBack = onBack)

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
        queryDraft = holder.appliedQuery
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    PeopleDirectoryContent(
        state = holder.state,
        queryDraft = queryDraft,
        refreshing = holder.refreshing,
        onQueryChange = { queryDraft = it.take(80) },
        onSearch = { scope.launch { holder.search(queryDraft) } },
        onClear = {
            queryDraft = ""
            scope.launch { holder.clearSearch() }
        },
        onRefresh = { scope.launch { holder.refresh() } },
        onLoadMore = { scope.launch { holder.loadMore() } },
        onOpenProfile = onOpenProfile,
        onBack = onBack,
        modifier = modifier,
    )
}
