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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaIconAction
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSize
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.performTeswa
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
    var viewersContext by mutableStateOf<StoryViewersContext?>(null)
        private set
    var loadingViewers by mutableStateOf(false)
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

    suspend fun delete(item: ManagedStory): Boolean {
        if (deletingId != null) return false
        deletingId = item.story.id
        message = null
        var deleted = false
        when (val result = repository.deleteOwned(session, item.story)) {
            is StoryResult.Success -> {
                session = result.session
                val ready = state as? StoryManageUiState.Ready
                if (ready != null) state = ready.copy(stories = ready.stories.filterNot { it.story.id == item.story.id })
                message = if (result.value.storageCleanupComplete) "تم حذف القصة."
                else "تم حذف القصة، لكن تنظيف ملف الوسائط هيتعاد لاحقًا."
                deleted = true
            }
            is StoryResult.Failure -> capture(result)
        }
        deletingId = null
        return deleted
    }

    suspend fun openViewers(item: ManagedStory) {
        if (loadingViewers) return
        loadingViewers = true
        message = null
        when (val result = repository.loadViewers(session, item.story.id)) {
            is StoryResult.Success -> {
                session = result.session
                viewersContext = result.value
                if (result.value == null) message = "القصة لم تعد متاحة."
            }
            is StoryResult.Failure -> capture(result)
        }
        loadingViewers = false
    }

    fun closeViewers() {
        viewersContext = null
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
    val haptics = LocalHapticFeedback.current
    var confirming by remember { mutableStateOf<ManagedStory?>(null) }
    BackHandler(onBack = onBack)
    LaunchedEffect(initialSession.accessToken) {
        holder.updateSession(initialSession)
        holder.load()
    }
    LaunchedEffect(holder.session.accessToken) { onSessionUpdated(holder.session) }
    LaunchedEffect(holder.sessionExpired) { if (holder.sessionExpired) onSessionExpired() }

    holder.viewersContext?.let { context ->
        StoryViewersContent(context, onBack = holder::closeViewers, modifier = modifier)
        return
    }

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
            contentPadding = PaddingValues(bottom = TeswaSpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
        ) {
            item {
                TeswaFocusedHeader(title = "إدارة الحكايات", onBack = onBack)
            }
            holder.message?.let { feedback ->
                item {
                    TeswaInlineMessage(
                        title = "تحديث الحكايات",
                        body = feedback,
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    )
                }
            }
            item {
                Text(
                    "${state.stories.size} حكايات نشطة · تختفي تلقائيًا بعد 24 ساعة",
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            item {
                TeswaPrimaryAction(
                    text = "أضف حكاية",
                    icon = TeswaIcons.PutIntoPlay,
                    onClick = onCreate,
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
            if (state.stories.isEmpty()) {
                item {
                    TeswaInlineMessage(
                        title = "مفيش حكايات نشطة دلوقتي",
                        body = "شارك صورة أو فيديو يضيف سياق خفيف للناس.",
                        icon = TeswaIcons.Gallery,
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    )
                }
            } else {
                items(state.stories, key = { it.story.id }) { item ->
                    StoryManageRow(
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                        item = item,
                        deleting = holder.deletingId == item.story.id,
                        onDelete = { confirming = item },
                        onViewers = { scope.launch { holder.openViewers(item) } },
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
                TextButton(onClick = {
                    confirming = null
                    scope.launch {
                        if (holder.delete(item)) haptics.performTeswa(TeswaHapticEvent.Reject)
                    }
                }) { Text("حذف", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { confirming = null }) { Text("إلغاء") } },
        )
    }
}

@Composable
private fun StoryManageRow(
    modifier: Modifier = Modifier,
    item: ManagedStory,
    deleting: Boolean,
    onDelete: () -> Unit,
    onViewers: () -> Unit,
) {
    Column(modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(vertical = TeswaSpacing.xs),
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
                        Icon(TeswaIcons.Play, contentDescription = null, modifier = Modifier.size(TeswaSize.iconHero))
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
            if (deleting) CircularProgressIndicator(Modifier.size(TeswaSize.icon))
            else TeswaIconAction(TeswaIcons.Delete, "حذف الحكاية", onDelete)
        }
        if ((item.viewCount ?: 0) > 0) {
            TextButton(onClick = onViewers, modifier = Modifier.fillMaxWidth()) {
                Text("عرض المشاهدين")
            }
        }
        HorizontalDivider()
    }
}

@Composable
private fun StoryViewersContent(
    context: StoryViewersContext,
    onBack: () -> Unit,
    modifier: Modifier,
) {
    BackHandler(onBack = onBack)
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(18.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column(Modifier.weight(1f)) {
                    Text("مشاهدو القصة", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                    Text(context.storyCaption ?: "قصة بدون تعليق", maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                TeswaIconAction(TeswaIcons.Back, "رجوع", onBack)
            }
        }
        if (context.viewers.isEmpty()) {
            item { Text("لسه محدش شاف القصة.", Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center) }
        } else {
            items(context.viewers, key = { it.userId }) { viewer ->
                Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)) {
                    Row(
                        Modifier.fillMaxWidth().padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        NetworkImage(
                            viewer.avatarUrl,
                            viewer.displayName,
                            Modifier.size(48.dp),
                        )
                        Column(Modifier.weight(1f)) {
                            Text(viewer.displayName ?: viewer.username ?: "مستخدم تِسوى", fontWeight = FontWeight.SemiBold)
                            viewer.username?.let { Text("@$it", style = MaterialTheme.typography.bodySmall) }
                        }
                        Text(viewer.viewedAt.take(16).replace('T', ' '), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
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
        if (loading) TeswaInlineLoading(message)
        else TeswaInlineMessage(
            title = "الحكايات وقفت هنا",
            body = message,
            emphasis = TeswaEmphasis.Strong,
            actionLabel = primary?.first,
            onAction = primary?.second,
        )
        secondary?.let { TeswaSecondaryAction(text = it.first, onClick = it.second) }
    }
}
