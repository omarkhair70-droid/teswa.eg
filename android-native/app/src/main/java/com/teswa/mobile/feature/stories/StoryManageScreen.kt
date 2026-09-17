package com.teswa.mobile.feature.stories

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaActionSheet
import com.teswa.mobile.ui.system.TeswaArchiveLabel
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaIconAction
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaRadius
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSize
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTraceNote
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
                message = if (result.value.storageCleanupComplete) "الحكاية اتشالت."
                else "الحكاية اتشالت، وتنظيف ملف الميديا هيتعاد تلقائيًا."
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
                if (result.value == null) message = "الحكاية لم تعد متاحة."
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
        StoryManageUiState.Loading -> StoryManageCenter("بنفتح الحكايات اللي لسه عايشة…", modifier, loading = true)
        is StoryManageUiState.Error -> StoryManageCenter(
            state.message,
            modifier,
            primary = "حاول تاني" to { scope.launch { holder.load() } },
            secondary = "رجوع" to onBack,
        )
        is StoryManageUiState.Ready -> LazyColumn(
            modifier.fillMaxSize(),
            contentPadding = PaddingValues(bottom = TeswaSpacing.xl),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.lg),
        ) {
            item {
                TeswaFocusedHeader(title = "حكاياتك", onBack = onBack)
            }
            item {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = TeswaLayout.ScreenHorizontal),
                    verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        TeswaArchiveLabel(
                            text = "${state.stories.size} عايشة دلوقتي",
                            tone = MaterialTheme.colorScheme.surfaceVariant,
                        )
                        Text(
                            "24 ساعة",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    TeswaTraceNote("الحكاية أثر خفيف من اللحظة الحالية؛ بتختفي لوحدها ومش بتتحول لعالم اجتماعي موازي.")
                    TeswaPrimaryAction(
                        text = "أضف حكاية",
                        icon = TeswaIcons.Gallery,
                        onClick = onCreate,
                    )
                }
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

            if (state.stories.isEmpty()) {
                item {
                    TeswaInlineMessage(
                        title = "مفيش لحظة عايشة دلوقتي",
                        body = "صورة أو فيديو واحد كفاية لما يكون فيه حاجة تستاهل تتشاف للحظة.",
                        icon = TeswaIcons.Gallery,
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    )
                }
            } else {
                items(state.stories, key = { it.story.id }) { item ->
                    StoryMemoryRow(
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
        TeswaActionSheet(
            title = "نشيل الحكاية؟",
            supporting = "هتختفي فورًا من عند الناس. ده حذف للحكاية المؤقتة نفسها، مش لأي حاجة في دولابك.",
            onDismiss = { confirming = null },
        ) {
            TeswaPrimaryAction(
                text = "شيل الحكاية",
                icon = TeswaIcons.Delete,
                onClick = {
                    confirming = null
                    scope.launch {
                        if (holder.delete(item)) haptics.performTeswa(TeswaHapticEvent.Reject)
                    }
                },
            )
            TextButton(
                onClick = { confirming = null },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("سيبها") }
        }
    }
}

@Composable
private fun StoryMemoryRow(
    modifier: Modifier = Modifier,
    item: ManagedStory,
    deleting: Boolean,
    onDelete: () -> Unit,
    onViewers: () -> Unit,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
        ) {
            Box(modifier = Modifier.size(104.dp)) {
                if (item.story.mediaType == "image") {
                    NetworkImage(
                        item.signedUrl,
                        item.story.caption,
                        Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(TeswaRadius.md)),
                    )
                } else {
                    Surface(
                        Modifier.fillMaxSize(),
                        shape = RoundedCornerShape(TeswaRadius.md),
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Column(
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Icon(TeswaIcons.Play, contentDescription = null, modifier = Modifier.size(TeswaSize.iconHero))
                            Text("فيديو", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
                TeswaArchiveLabel(
                    text = "مؤقتة",
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(TeswaSpacing.xxs),
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            ) {
                Text(
                    item.story.caption?.takeIf { it.isNotBlank() } ?: "لحظة من غير تعليق",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 3,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "اتنشرت ${storyDate(item.story.createdAt)} · تختفي ${storyDate(item.story.expiresAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    "${item.viewCount ?: 0} شافوها · ${item.likeCount ?: 0} إعجابات",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }

            if (deleting) {
                TeswaInlineLoading("بنشيلها…")
            } else {
                TeswaIconAction(TeswaIcons.Delete, "حذف الحكاية", onDelete)
            }
        }

        if ((item.viewCount ?: 0) > 0) {
            TeswaSecondaryAction(
                text = if (item.viewCount == 1) "شوف مين شافها" else "شوف الناس اللي شافوها",
                icon = TeswaIcons.Me,
                onClick = onViewers,
            )
        }
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
        contentPadding = PaddingValues(bottom = TeswaSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
    ) {
        item {
            TeswaFocusedHeader(title = "مين شاف اللحظة", onBack = onBack)
        }
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                TeswaArchiveLabel("اتنشرت ${storyDate(context.storyCreatedAt)}")
                context.storyCaption?.takeIf { it.isNotBlank() }?.let { TeswaTraceNote(it) }
            }
        }
        if (context.viewers.isEmpty()) {
            item {
                TeswaInlineMessage(
                    title = "لسه محدش شافها",
                    body = "لو حد شاف الحكاية هتظهر هويته هنا طول ما الحكاية متاحة.",
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
        } else {
            items(context.viewers, key = { it.userId }) { viewer ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = TeswaLayout.ScreenHorizontal, vertical = TeswaSpacing.xs),
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TeswaPersonIdentity(
                        name = viewer.displayName ?: viewer.username ?: "مستخدم تِسوى",
                        avatarUrl = viewer.avatarUrl,
                        supporting = viewer.username?.let { "@$it" },
                        evidence = "شافها ${storyDate(viewer.viewedAt)}",
                        modifier = Modifier.weight(1f),
                    )
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
        modifier.fillMaxSize().padding(TeswaLayout.RootContentPadding),
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
        secondary?.let {
            Spacer(Modifier.height(TeswaSpacing.sm))
            TeswaSecondaryAction(text = it.first, onClick = it.second)
        }
    }
}

private fun storyDate(value: String): String {
    val clean = value.trim()
    val date = clean.substringBefore('T')
    val time = clean.substringAfter('T', "").take(5)
    return if (date.isNotBlank() && time.isNotBlank()) "$date · $time" else clean.take(16)
}
