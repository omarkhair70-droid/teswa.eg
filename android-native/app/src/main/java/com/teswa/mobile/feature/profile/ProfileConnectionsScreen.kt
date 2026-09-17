package com.teswa.mobile.feature.profile

import androidx.activity.compose.BackHandler
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
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaStatePill
import kotlinx.coroutines.launch

@Composable
fun ProfileConnectionsScreen(
    profileId: String,
    mode: ProfileConnectionsMode,
    initialSession: AuthSession,
    repository: PublicProfileRepository,
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
    BackHandler(onBack = onBack)

    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    Column(modifier.fillMaxSize()) {
        TeswaFocusedHeader(title = mode.title, onBack = onBack)
        Text(
            if (mode == ProfileConnectionsMode.FOLLOWERS) "الناس اللي بتتابع الحساب" else "الحسابات اللي بيتابعها",
            modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        when (val state = holder.state) {
            ProfileConnectionsUiState.Loading -> TeswaInlineLoading(
                "بنحمّل العلاقات…",
                Modifier.padding(TeswaLayout.ScreenHorizontal),
            )
            is ProfileConnectionsUiState.Error -> TeswaInlineMessage(
                title = "العلاقات مش متاحة",
                body = state.message,
                icon = TeswaIcons.Refresh,
                actionLabel = "حاول تاني",
                onAction = { scope.launch { holder.load() } },
                modifier = Modifier.padding(TeswaLayout.ScreenHorizontal),
            )
            is ProfileConnectionsUiState.Ready -> if (state.items.isEmpty()) {
                TeswaEmptyField(
                    title = "لسه مفيش علاقات هنا",
                    body = if (mode == ProfileConnectionsMode.FOLLOWERS) "مفيش متابعين للحساب لسه." else "الحساب مش بيتابع حد لسه.",
                    modifier = Modifier.padding(TeswaLayout.ScreenHorizontal),
                )
            } else {
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = TeswaLayout.FocusedContentPadding,
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
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
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = TeswaSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TeswaPersonIdentity(
            name = name,
            avatarUrl = connection.avatarUrl,
            supporting = connection.username?.let { "@$it" },
            evidence = location.takeIf { it.isNotBlank() },
            onClick = if (mine) null else onOpen,
            modifier = Modifier.weight(1f),
        )
        if (mine) {
            TeswaStatePill(
                text = "أنت",
                emphasis = TeswaEmphasis.Quiet,
            )
        }
    }
}
