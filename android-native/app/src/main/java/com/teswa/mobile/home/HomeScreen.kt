package com.teswa.mobile.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthRepository
import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(
    initialSession: AuthSession,
    authRepository: AuthRepository,
    onSignOut: suspend () -> Unit,
    modifier: Modifier = Modifier,
    onSessionUpdated: (AuthSession) -> Unit = {},
) {
    val client = remember { OracleHomeClient() }
    var session by remember(initialSession.user.id) { mutableStateOf(initialSession) }
    var state by remember(initialSession.user.id) { mutableStateOf<HomeUiState>(HomeUiState.Loading) }
    var selectedItemId by remember(initialSession.user.id) { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun validSession(forceRefresh: Boolean = false): AuthSession? {
        return when (val auth = authRepository.ensureValid(session, forceRefresh = forceRefresh)) {
            is AuthResult.Success -> auth.value.also {
                session = it
                onSessionUpdated(it)
            }
            is AuthResult.Failure -> {
                state = HomeUiState.Error(auth.message)
                null
            }
        }
    }

    suspend fun load(forceSessionRefresh: Boolean = false) {
        state = HomeUiState.Loading
        val valid = validSession(forceSessionRefresh) ?: return

        when (val feed = client.fetchFeed(valid)) {
            is HomeFeedResult.Success -> {
                state = if (feed.value.items.isEmpty()) {
                    HomeUiState.Empty("مفيش عناصر ظاهرة دلوقتي. أول عنصر جديد هتلاقيه هنا.")
                } else {
                    HomeUiState.Content(feed.value.items, feed.value.hasMore)
                }
            }
            is HomeFeedResult.Failure -> {
                if (feed.unauthorized && !forceSessionRefresh) {
                    load(forceSessionRefresh = true)
                } else {
                    state = HomeUiState.Error(feed.message)
                }
            }
        }
    }

    suspend fun loadMore() {
        val current = state as? HomeUiState.Content ?: return
        if (!current.hasMore || current.loadingMore) return
        state = current.copy(loadingMore = true)

        var valid = validSession() ?: return
        var feed = client.fetchFeed(valid, offset = current.items.size)
        if (feed is HomeFeedResult.Failure && feed.unauthorized) {
            valid = validSession(forceRefresh = true) ?: return
            feed = client.fetchFeed(valid, offset = current.items.size)
        }

        state = when (feed) {
            is HomeFeedResult.Success -> current.copy(
                items = (current.items + feed.value.items).distinctBy { it.id },
                hasMore = feed.value.hasMore,
                loadingMore = false,
            )
            is HomeFeedResult.Failure -> HomeUiState.Error(feed.message)
        }
    }

    LaunchedEffect(initialSession.accessToken) {
        if (initialSession.accessToken != session.accessToken) {
            session = initialSession
        }
        load()
    }

    val selected = selectedItemId
    if (selected != null) {
        Box(modifier = modifier.fillMaxSize()) {
            ItemDetailScreen(
                itemId = selected,
                initialSession = session,
                authRepository = authRepository,
                onSessionUpdated = {
                    session = it
                    onSessionUpdated(it)
                },
                onBack = { selectedItemId = null },
            )
        }
        return
    }

    when (val current = state) {
        HomeUiState.Loading -> {
            Column(
                modifier = modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator()
                Spacer(Modifier.height(14.dp))
                Text("جاري تحميل الرئيسية…")
            }
        }

        is HomeUiState.Empty -> {
            Column(
                modifier = modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text("تِسوى", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(12.dp))
                Text(current.message)
                Spacer(Modifier.height(18.dp))
                Button(onClick = { scope.launch { load() } }) { Text("تحديث") }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { scope.launch { onSignOut() } }) { Text("تسجيل الخروج") }
            }
        }

        is HomeUiState.Error -> {
            Column(
                modifier = modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text("تعذر تحميل الرئيسية", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(10.dp))
                Text(current.message)
                Spacer(Modifier.height(18.dp))
                Button(onClick = { scope.launch { load() } }) { Text("إعادة المحاولة") }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { scope.launch { onSignOut() } }) { Text("تسجيل الخروج") }
            }
        }

        is HomeUiState.Content -> {
            LazyColumn(
                modifier = modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Column(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column {
                                Text("تِسوى", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                                Text("آخر الحاجات المعروضة للتبادل", style = MaterialTheme.typography.bodyMedium)
                            }
                            OutlinedButton(onClick = { scope.launch { load() } }) {
                                Text("تحديث")
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }

                items(current.items, key = { it.id }) { item ->
                    HomeFeedCard(item = item, onOpen = { selectedItemId = item.id })
                }

                if (current.hasMore) {
                    item {
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !current.loadingMore,
                            onClick = { scope.launch { loadMore() } },
                        ) {
                            if (current.loadingMore) {
                                CircularProgressIndicator(modifier = Modifier.height(22.dp))
                            } else {
                                Text("تحميل عناصر أكتر")
                            }
                        }
                    }
                }

                item {
                    OutlinedButton(
                        modifier = Modifier.fillMaxWidth(),
                        onClick = { scope.launch { onSignOut() } },
                    ) {
                        Text("تسجيل الخروج")
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeFeedCard(
    item: HomeFeedItem,
    onOpen: () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        onClick = onOpen,
    ) {
        Column {
            NetworkImage(
                url = item.coverImageUrl,
                contentDescription = item.title,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(210.dp),
            )
            Column(modifier = Modifier.padding(16.dp)) {
                Text(
                    text = item.title,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                val meta = listOfNotNull(item.category, item.condition, item.city).joinToString(" • ")
                if (meta.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Text(meta, style = MaterialTheme.typography.bodySmall)
                }
                item.description?.takeIf { it.isNotBlank() }?.let { description ->
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = description,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                item.ownerDisplayName?.takeIf { it.isNotBlank() }?.let { owner ->
                    Spacer(Modifier.height(10.dp))
                    Text("بواسطة $owner", style = MaterialTheme.typography.labelMedium)
                }
            }
        }
    }
}
