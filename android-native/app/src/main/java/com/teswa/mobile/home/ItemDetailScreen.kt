package com.teswa.mobile.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
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
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.offers.OfferCreationScreen
import com.teswa.mobile.feature.offers.OffersRepository
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

@Composable
fun ItemDetailScreen(
    itemId: String,
    initialSession: AuthSession,
    client: OracleHomeClient,
    offersRepository: OffersRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onBack: () -> Unit,
    onOfferCreated: () -> Unit,
    onAddItem: () -> Unit,
) {
    val holder = remember(itemId, client) { ItemDetailStateHolder(itemId, initialSession, client) }
    val scope = rememberCoroutineScope()
    var creatingOffer by remember(itemId) { mutableStateOf(false) }

    LaunchedEffect(itemId, initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }

    LaunchedEffect(holder.session.accessToken) {
        onSessionUpdated(holder.session)
    }

    LaunchedEffect(holder.sessionExpired) {
        if (holder.sessionExpired) onSessionExpired()
    }

    if (creatingOffer) {
        OfferCreationScreen(
            requestedItemId = itemId,
            initialSession = holder.session,
            repository = offersRepository,
            onSessionUpdated = holder::updateSession,
            onSessionExpired = onSessionExpired,
            onBack = { creatingOffer = false },
            onAddItem = onAddItem,
            onOfferSent = onOfferCreated,
        )
        return
    }

    when (val current = holder.state) {
        ItemDetailUiState.Loading -> {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator()
                Spacer(Modifier.height(12.dp))
                Text("جاري تحميل العنصر…")
            }
        }

        is ItemDetailUiState.Error -> {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(current.message)
                Spacer(Modifier.height(16.dp))
                Button(onClick = { scope.launch { holder.load() } }) { Text("إعادة المحاولة") }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = onBack) { Text("رجوع") }
            }
        }

        is ItemDetailUiState.Content -> {
            val detail = current.detail
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    Column(modifier = Modifier.padding(horizontal = 18.dp)) {
                        OutlinedButton(onClick = onBack) { Text("رجوع") }
                        Spacer(Modifier.height(14.dp))
                        Text(
                            text = detail.title,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                        )
                        val meta = listOfNotNull(detail.category, detail.condition, detail.city, detail.area)
                            .joinToString(" • ")
                        if (meta.isNotBlank()) {
                            Spacer(Modifier.height(6.dp))
                            Text(meta, style = MaterialTheme.typography.bodyMedium)
                        }
                    }
                }

                if (detail.images.isNotEmpty()) {
                    item {
                        LazyRow(
                            contentPadding = PaddingValues(horizontal = 18.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                        ) {
                            items(detail.images) { imageUrl ->
                                NetworkImage(
                                    url = imageUrl,
                                    contentDescription = detail.title,
                                    modifier = Modifier
                                        .width(300.dp)
                                        .height(260.dp),
                                )
                            }
                        }
                    }
                }

                item {
                    Column(modifier = Modifier.padding(horizontal = 18.dp)) {
                        detail.description?.let { DetailSection("الوصف", it) }
                        detail.conditionNotes?.let { DetailSection("حالة العنصر", it) }
                        detail.desireText?.let { DetailSection("صاحبه عايز إيه؟", it) }
                        detail.itemStory?.let { DetailSection("حكاية العنصر", it) }
                        detail.swapReason?.let { DetailSection("ليه بيتبدل؟", it) }
                        detail.goodFor?.let { DetailSection("مفيد لمين؟", it) }

                        val owner = detail.ownerDisplayName ?: detail.ownerUsername
                        if (!owner.isNullOrBlank()) {
                            DetailSection("صاحب العنصر", owner)
                        }
                        if (detail.ownerId != null && detail.ownerId != holder.session.user.id) {
                            Spacer(Modifier.height(18.dp))
                            Button(
                                onClick = { creatingOffer = true },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("قدّم عرض تبديل") }
                            Spacer(Modifier.height(6.dp))
                            Text(
                                "هتختار عنصر نشط من حاجتك، والقرار يفضل عند صاحب العنصر.",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DetailSection(title: String, value: String) {
    if (value.isBlank()) return
    Spacer(Modifier.height(12.dp))
    Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(4.dp))
    Text(value, style = MaterialTheme.typography.bodyLarge)
}
