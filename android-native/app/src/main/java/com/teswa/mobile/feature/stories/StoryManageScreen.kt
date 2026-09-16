package com.teswa.mobile.feature.stories

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch

private sealed interface StoryManageUiState {
    data object Loading : StoryManageUiState
    data class Ready(val stories: List<ManagedStory>) : StoryManageUiState
    data class Error(val message: String) : StoryManageUiState
}

private class StoryManageStateHolder(
    initialSession: AuthSession,
    private val repository: StoryRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<StoryManageUiState>(StoryManageUiState.Loading)
        private set
    var deletingId by mutableStateOf<String?>(null)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(value: AuthSession) {
        if (value.user.id == session.user.id && value.accessToken != session.accessToken) session = value
    }

    suspend fun load() {
        state = StoryManageUiState.Loading
        when (val result = repository.loadOwned(session)) {
            is StoryResult.Success -> {
                session = result.session
                state = StoryManageUiState.Ready(result.value)
                message = null
            }
            is StoryResult.Failure -> {
                capture(result)
                state = StoryManageUiState.Error(result.message)
            }
        }
    }

    suspend fun delete(item: ManagedStory) {
        if (deletingId != null) return
        deletingId = item.story.id
        message = null
        when (val result = repository.deleteOwned(session, item.story)) {
            is StoryResult.Success -> {
                session = result.session
                val ready = state as? StoryManageUiState.Ready
                if (ready != null) state = ready.copy(stories = ready.stories.filterNot { it.story.id == item.story.id })
                message = if (result.value.storageCleanupComplete) "تم حذف القصة."
                else "تم حذف القصة، لكن تنظيف ملف الوسائط هيتعاد لاحقًا."
            }
            is StoryResult.Failure -> capture(result)
        }
        deletingId = null
    }

    private fun capture(result: StoryResult.Failure) {
        result.session?.let { session = it }
        sessionExpired = result.unauthorized
        message = if (result.unauthorized) null else result.message
    }
}

@Composable
fun StoryManageScreen(
    initialSession: AuthSession,
    repository: StoryRepository,
    onSessionUpdated: (AuthSession) -> Unit,
    onSessionExpired: suspend () -> Unit,
    onCreate: () -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val holder = remember(initialSession.user.id, repository) { StoryManageStateHolder(initialSession, repository) }
    val scope = rememberCoroutineScope()
    var confirming by remember { mutableStateOf<ManagedStory?>(null) }
    BackHandler(onBack = onBack)
    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    when (val state = holder.state) {
        StoryManageUiState.Loading -> StoryManageCenter("بنحضّر قصصك…", modifier, loading = true)
        is StoryManageUiState.Error -> StoryManageCenter(
            state.message,
            modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            secondary = "رجوع" to onBack,
        )
        is StoryManageUiState.Ready -> LazyColumn(
            modifier.fillMaxSize(),
            contentPadding = PaddingValues(18.dp),
            verticalArrangement = Arrangement.spacedBy(13.dp),
        ) {
            item {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text("إدارة القصص", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                        Text("تابع المحتوى النشط واحذفه وقت ما تحب.", style = MaterialTheme.typography.bodyMedium)
                    }
                    OutlinedButton(onClick = onBack) { Text("رجوع") }
                }
            }
            holder.message?.let { feedback ->
                item {
                    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.secondaryContainer) {
                        Text(feedback, Modifier.fillMaxWidth().padding(13.dp))
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    StoryManageStat(state.stories.size.toString(), "نشطة", Modifier.weight(1f))
                    StoryManageStat(
                        state.stories.mapNotNull { it.viewCount }.sum().toString().takeIf { state.stories.all { it.viewCount != null } } ?: "—",
                        "مشاهدة",
                        Modifier.weight(1f),
                    )
                    StoryManageStat(
                        state.stories.mapNotNull { it.likeCount }.sum().toString().takeIf { state.stories.all { it.likeCount != null } } ?: "—",
                        "إعجاب",
                        Modifier.weight(1f),
                    )
                }
            }
            item { Button(onClick = onCreate, modifier = Modifier.fillMaxWidth()) { Text("إضافة قصة") } }
            if (state.stories.isEmpty()) {
                item {
                    Surface(shape = MaterialTheme.shapes.extraLarge, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)) {
                        Column(
                            Modifier.fillMaxWidth().padding(28.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text("مفيش قصص نشطة دلوقتي", style = MaterialTheme.typography.titleLarge)
                            Spacer(Modifier.height(7.dp))
                            Text("شارك صورة أو فيديو وخلي ملفك حي.", textAlign = TextAlign.Center)
                        }
                    }
                }
            } else {
                items(state.stories, key = { it.story.id }) { item ->
                    StoryManageRow(
                        item = item,
                        deleting = holder.deletingId == item.story.id,
                        onDelete = { confirming = item },
                    )
                }
            }
        }
    }

    confirming?.let { item ->
        AlertDialog(
            onDismissRequest = { confirming = null },
            title = { Text("حذف القصة؟") },
            text = { Text("القصة هتختفي فورًا ومش هتقدر ترجعها.") },
            confirmButton = {
                Button(onClick = {
                    confirming = null
                    scope.launch { holder.delete(item) }
                }) { Text("حذف") }
            },
            dismissButton = { TextButton(onClick = { confirming = null }) { Text("إلغاء") } },
        )
    }
}

@Composable
private fun StoryManageRow(item: ManagedStory, deleting: Boolean, onDelete: () -> Unit) {
    Card {
        Row(
            Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (item.story.mediaType == "image") {
                NetworkImage(item.signedUrl, item.story.caption, Modifier.size(84.dp))
            } else {
                Surface(
                    Modifier.size(84.dp),
                    shape = MaterialTheme.shapes.medium,
                    color = MaterialTheme.colorScheme.primaryContainer,
                ) {
                    Column(verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("▶", style = MaterialTheme.typography.headlineSmall)
                        Text("فيديو", style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
            Column(Modifier.weight(1f)) {
                Text(
                    item.story.caption ?: "قصة بدون تعليق",
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    "مشاهدات: ${item.viewCount ?: "—"}  •  إعجابات: ${item.likeCount ?: "—"}",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            OutlinedButton(onClick = onDelete, enabled = !deleting) {
                Text(if (deleting) "…" else "حذف")
            }
        }
    }
}

@Composable
private fun StoryManageStat(value: String, label: String, modifier: Modifier) {
    Surface(modifier, shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .5f)) {
        Column(Modifier.padding(13.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun StoryManageCenter(
    message: String,
    modifier: Modifier,
    loading: Boolean = false,
    primary: Pair<String, () -> Unit>? = null,
    secondary: Pair<String, () -> Unit>? = null,
) {
    Column(
        modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (loading) {
            CircularProgressIndicator()
            Spacer(Modifier.height(12.dp))
        }
        Text(message, textAlign = TextAlign.Center)
        primary?.let {
            Spacer(Modifier.height(14.dp))
            Button(onClick = it.second) { Text(it.first) }
        }
        secondary?.let {
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = it.second) { Text(it.first) }
        }
    }
}
