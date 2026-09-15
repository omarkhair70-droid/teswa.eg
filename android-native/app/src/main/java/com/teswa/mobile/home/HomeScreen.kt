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
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(
    initialSession: AuthSession,
    client: OracleHomeClient,
    offersRepository: OffersRepository,
    onSignOut: suspend () -> Unit,
    modifier: Modifier = Modifier,
    onSessionUpdated: (AuthSession) -> Unit = {},
    onOfferCreated: () -> Unit = {},
    onAddItem: () -> Unit = {},
    externalItemId: String? = null,
    onExternalItemConsumed: () -> Unit = {},
) {
    val holder = remember(initialSession.user.id, client) { HomeStateHolder(initialSession, client) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }

    LaunchedEffect(holder.session.accessToken) {
        onSessionUpdated(holder.session)
    }

    LaunchedEffect(holder.sessionExpired) {
        if (holder.sessionExpired) onSignOut()
    }

    LaunchedEffect(externalItemId) {
        externalItemId?.let {
            holder.openItem(it)
            onExternalItemConsumed()
        }
    }

    val selected = holder.selectedItemId
    if (selected != null) {
        Box(modifier = modifier.fillMaxSize()) {
            ItemDetailScreen(
                itemId = selected,
                initialSession = holder.session,
                client = client,
                offersRepository = offersRepository,
                onSessionUpdated = holder::updateSession,
                onSessionExpired = onSignOut,
                onBack = holder::closeItem,
                onOfferCreated = onOfferCreated,
                onAddItem = onAddItem,
            )
        }
        return
    }

    when (val current = holder.state) {
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
                Button(onClick = { scope.launch { holder.load() } }) { Text("تحديث") }
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
                Button(onClick = { scope.launch { holder.load() } }) { Text("إعادة المحاولة") }
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
                            OutlinedButton(onClick = { scope.launch { holder.load() } }) {
                                Text("تحديث")
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                    }
                }

                items(current.items, key = { it.id }) { item ->
                    HomeFeedCard(item = item, onOpen = { holder.openItem(item.id) })
                }

                if (current.hasMore) {
                    item {
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !current.loadingMore,
                            onClick = { scope.launch { holder.loadMore() } },
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
