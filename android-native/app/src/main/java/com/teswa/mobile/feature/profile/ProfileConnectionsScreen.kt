package com.teswa.mobile.feature.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

@Composable
fun ProfileConnectionsScreen(
    profileId: String,
    mode: ProfileConnectionsMode,
    initialSession: AuthSession,
    repository: ProfileConnectionsRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onBack: () -> Unit,
    onOpenProfile: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(profileId, mode, repository) {
        ProfileConnectionsStateHolder(initialSession, profileId, mode, repository)
    }
    val scope = rememberCoroutineScope()

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    Column(modifier.fillMaxSize()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedButton(onClick = onBack) { Text("رجوع") }
            Column(Modifier.weight(1f)) {
                Text(mode.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                Text(
                    if (mode == ProfileConnectionsMode.FOLLOWERS) "الناس اللي بتتابع الحساب" else "الحسابات اللي بيتابعها",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        when (val state = holder.state) {
            ProfileConnectionsUiState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
            is ProfileConnectionsUiState.Error -> Column(
                Modifier.fillMaxSize().padding(28.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(state.message, textAlign = TextAlign.Center)
                Spacer(Modifier.size(14.dp))
                Button(onClick = { scope.launch { holder.load() } }) { Text("حاول تاني") }
            }
            is ProfileConnectionsUiState.Ready -> if (state.items.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
                    Text(
                        if (mode == ProfileConnectionsMode.FOLLOWERS) "مفيش متابعين هنا لسه." else "مش بيتابع حد هنا لسه.",
                        textAlign = TextAlign.Center,
                    )
                }
            } else {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 18.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(state.items, key = { it.profileId }) { connection ->
                        ProfileConnectionRow(
                            connection = connection,
                            mine = connection.profileId == holder.session.user.id,
                            onOpen = { onOpenProfile(connection.profileId) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileConnectionRow(
    connection: ProfileConnection,
    mine: Boolean,
    onOpen: () -> Unit,
) {
    val name = connection.displayName ?: connection.username ?: "مستخدم تِسوى"
    val location = listOfNotNull(connection.area, connection.city).joinToString("، ")
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .then(if (mine) Modifier else Modifier.clickable(onClick = onOpen)),
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NetworkImage(connection.avatarUrl, name, Modifier.size(52.dp).clip(CircleShape))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                connection.username?.let {
                    Text("@$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                }
                if (location.isNotBlank()) {
                    Text(location, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if (mine) Text("أنت", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }
    }
}
