package com.teswa.mobile.feature.profile

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.direct.DirectComposeTarget
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

@Composable
fun PublicProfileScreen(
    profileId: String,
    initialSession: AuthSession,
    repository: PublicProfileRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onBack: () -> Unit,
    onOpenItem: (String) -> Unit,
    onMessage: (DirectComposeTarget) -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(profileId, repository) { PublicProfileStateHolder(initialSession, profileId, repository) }
    val scope = rememberCoroutineScope()
    var confirmBlock by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(initialSession.accessToken) { holder.updateSession(initialSession); holder.load() }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    when (val state = holder.state) {
        PublicProfileUiState.Loading -> PublicCenter("بنحضّر الملف…", modifier, true)
        is PublicProfileUiState.Error -> PublicCenter(state.message, modifier, primary = "حاول تاني" to { scope.launch { holder.load() } }, secondary = "رجوع" to onBack)
        is PublicProfileUiState.Ready -> {
            val profile = state.overview.profile
            LazyColumn(
                modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                item { OutlinedButton(onClick = onBack) { Text("رجوع") } }
                item {
                    Surface(shape = MaterialTheme.shapes.extraLarge, color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .48f)) {
                        Column(Modifier.fillMaxWidth().padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            NetworkImage(profile.avatarUrl, profile.displayName, Modifier.size(92.dp).clip(CircleShape))
                            Spacer(Modifier.height(10.dp))
                            Text(profile.displayName, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                            Text("@${profile.username}", color = MaterialTheme.colorScheme.primary)
                            profile.profileTagline?.let { Spacer(Modifier.height(6.dp)); Text(it, textAlign = TextAlign.Center) }
                            val location = listOfNotNull(profile.area, profile.city).joinToString("، ")
                            if (location.isNotBlank()) Text(location, style = MaterialTheme.typography.bodySmall)
                            Spacer(Modifier.height(14.dp))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                PublicStat("${state.overview.follow.followerCount}", "متابع", Modifier.weight(1f))
                                PublicStat("${state.overview.follow.followingCount}", "يتابع", Modifier.weight(1f))
                                PublicStat("${profile.successfulSwapsCount}", "تبديل", Modifier.weight(1f))
                            }
                        }
                    }
                }
                holder.message?.let { item { Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.error.copy(alpha = .1f)) { Text(it, Modifier.fillMaxWidth().padding(12.dp), color = MaterialTheme.colorScheme.error) } } }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = {
                                onMessage(
                                    DirectComposeTarget(
                                        userId = profile.id,
                                        displayName = profile.displayName,
                                        username = profile.username,
                                        avatarUrl = profile.avatarUrl,
                                    ),
                                )
                            },
                            modifier = Modifier.weight(1f),
                            enabled = holder.workingAction == null && !state.overview.blockedByMe && !state.overview.blockedMe,
                        ) { Text("مراسلة") }
                        OutlinedButton(
                            onClick = { scope.launch { holder.toggleFollow() } },
                            modifier = Modifier.weight(1f),
                            enabled = holder.workingAction == null && !state.overview.blockedByMe && !state.overview.blockedMe,
                        ) { Text(if (state.overview.follow.followingByMe) "إلغاء المتابعة" else "متابعة") }
                    }
                    TextButton(
                        onClick = { confirmBlock = !state.overview.blockedByMe },
                        enabled = holder.workingAction == null,
                    ) { Text(if (state.overview.blockedByMe) "فك الحظر" else "حظر المستخدم") }
                    if (state.overview.blockedMe) Text("الحساب ده قافل التفاعل معاك.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                }
                profile.bio?.let { item { Card { Column(Modifier.padding(16.dp)) { Text("عن المستخدم", style = MaterialTheme.typography.titleMedium); Spacer(Modifier.height(5.dp)); Text(it) } } } }
                item { Text("حاجته النشطة", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
                if (state.overview.listings.isEmpty()) item { Text("مفيش عناصر نشطة حاليًا.", Modifier.fillMaxWidth().padding(20.dp), textAlign = TextAlign.Center) }
                else items(state.overview.listings, key = { it.id }) { listing ->
                    Card(onClick = { onOpenItem(listing.id) }) {
                        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            NetworkImage(listing.imageUrl, listing.title, Modifier.size(82.dp).clip(MaterialTheme.shapes.medium))
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(listing.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(listOfNotNull(listing.category, listing.city).joinToString(" • "), style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }

    confirmBlock?.let { block ->
        AlertDialog(
            onDismissRequest = { confirmBlock = null },
            title = { Text(if (block) "حظر المستخدم؟" else "إلغاء الحظر؟") },
            text = { Text(if (block) "هيتقفل التفاعل الجديد بين الحسابين وتختفي علاقات المتابعة." else "هيبقى التفاعل متاح من جديد حسب إعدادات الخصوصية.") },
            confirmButton = { Button(onClick = { confirmBlock = null; scope.launch { holder.toggleBlock() } }) { Text(if (block) "حظر" else "إلغاء الحظر") } },
            dismissButton = { TextButton(onClick = { confirmBlock = null }) { Text("رجوع") } },
        )
    }
}

@Composable private fun PublicStat(value: String, label: String, modifier: Modifier) {
    Surface(modifier, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface.copy(alpha = .75f)) {
        Column(Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) { Text(value, fontWeight = FontWeight.Bold); Text(label, style = MaterialTheme.typography.labelSmall) }
    }
}

@Composable private fun PublicCenter(message: String, modifier: Modifier, loading: Boolean = false, primary: Pair<String, () -> Unit>? = null, secondary: Pair<String, () -> Unit>? = null) {
    Column(modifier.fillMaxSize().padding(28.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        if (loading) { CircularProgressIndicator(); Spacer(Modifier.height(12.dp)) }
        Text(message, textAlign = TextAlign.Center)
        primary?.let { Spacer(Modifier.height(16.dp)); Button(onClick = it.second) { Text(it.first) } }
        secondary?.let { Spacer(Modifier.height(8.dp)); OutlinedButton(onClick = it.second) { Text(it.first) } }
    }
}
