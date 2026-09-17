package com.teswa.mobile.feature.stories

import android.net.Uri
import android.widget.VideoView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.compose.ui.viewinterop.AndroidView
import com.teswa.mobile.feature.safety.ReportTarget
import com.teswa.mobile.feature.voice.VoiceComposer
import com.teswa.mobile.ui.NetworkImage
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaHapticEvent
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaMark
import com.teswa.mobile.ui.system.TeswaMarkIcon
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSize
import com.teswa.mobile.ui.system.TeswaSpacing
import com.teswa.mobile.ui.system.TeswaTextField
import com.teswa.mobile.ui.system.performTeswa
import kotlinx.coroutines.launch

@Composable
fun StoriesRail(
    holder: StoryStateHolder,
    onCreate: () -> Unit,
    onManage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    when (val state = holder.homeState) {
        StoryHomeState.Loading -> TeswaInlineLoading("بنحضّر الحكايات…", modifier)
        is StoryHomeState.Error -> TeswaInlineMessage(
            title = "الحكايات مش متاحة دلوقتي",
            body = state.message,
            icon = TeswaIcons.Refresh,
            emphasis = TeswaEmphasis.Quiet,
            actionLabel = "حاول تاني",
            onAction = { scope.launch { holder.load() } },
            modifier = modifier,
        )
        is StoryHomeState.Ready -> Column(
            modifier = modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
        ) {
            TeswaSectionHeader(
                title = "من عند الناس",
                actionLabel = "إدارة",
                onAction = onManage,
            )
            if (state.groups.isEmpty()) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onCreate)
                        .padding(vertical = TeswaSpacing.sm),
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TeswaMarkIcon(
                        mark = TeswaMark.PutIntoPlay,
                        color = MaterialTheme.colorScheme.primary,
                        size = 34.dp,
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text("سيب أثر صغير", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                        Text(
                            "صورة أو فيديو يضيف سياق للحاجة أو للشخص، من غير ما يعمل عالم اجتماعي منفصل.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            } else {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = TeswaSpacing.xxs),
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
                ) {
                    item { StoryCreatePostcard(onCreate) }
                    items(state.groups, key = { it.author.id }) { group ->
                        StoryAuthorPostcard(group) { scope.launch { holder.open(group) } }
                    }
                }
            }
        }
    }
}

@Composable
private fun StoryCreatePostcard(onCreate: () -> Unit) {
    Surface(
        modifier = Modifier
            .width(82.dp)
            .height(116.dp)
            .clickable(onClick = onCreate)
            .semantics {
                role = Role.Button
                contentDescription = "أضف حكاية"
            },
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .7f),
        tonalElevation = 0.dp,
    ) {
        Column(
            modifier = Modifier.padding(TeswaSpacing.sm),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.Start,
        ) {
            TeswaMarkIcon(
                mark = TeswaMark.PutIntoPlay,
                color = MaterialTheme.colorScheme.primary,
                size = 30.dp,
            )
            Column {
                Text("أضف", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                Text(
                    "أثر",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun StoryAuthorPostcard(group: StoryGroup, onOpen: () -> Unit) {
    val name = group.author.displayName ?: group.author.username ?: "مستخدم"
    Box(
        Modifier
            .width(86.dp)
            .height(118.dp)
            .clip(MaterialTheme.shapes.large)
            .clickable(onClick = onOpen)
            .semantics {
                role = Role.Button
                contentDescription = "افتح حكايات $name"
            },
    ) {
        NetworkImage(
            url = group.author.avatarUrl,
            contentDescription = name,
            modifier = Modifier.fillMaxSize(),
        )
        Surface(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth(),
            color = Color.Black.copy(alpha = .58f),
        ) {
            Column(Modifier.padding(horizontal = TeswaSpacing.xs, vertical = 6.dp)) {
                Text(
                    name,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "${group.stories.size} أثر",
                    style = MaterialTheme.typography.labelSmall,
                    color = Color.White.copy(alpha = .72f),
                )
            }
        }
    }
}

@Composable
fun StoryViewerScreen(
    holder: StoryStateHolder,
    onReplyOpened: (String) -> Unit,
    onReport: (ReportTarget) -> Unit,
    modifier: Modifier = Modifier,
) {
    val viewer = holder.viewer ?: return
    val slide = viewer.slides.getOrNull(holder.activeIndex) ?: return
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val mine = slide.story.userId == holder.session.user.id
    val name = viewer.group.author.displayName ?: viewer.group.author.username ?: "مستخدم تِسوى"
    BackHandler(onBack = holder::close)

    Box(modifier.fillMaxSize().background(Color(0xFF0B0D10))) {
        when {
            slide.signedUrl == null -> StoryMediaUnavailable()
            slide.story.mediaType == "image" -> NetworkImage(
                slide.signedUrl,
                slide.story.caption ?: name,
                Modifier.fillMaxSize(),
                contentScale = ContentScale.Fit,
            )
            else -> key(slide.story.id, slide.signedUrl) {
                StoryVideo(slide.signedUrl, Modifier.fillMaxSize())
            }
        }
        Row(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal = TeswaSpacing.sm, vertical = TeswaSpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
        ) {
            viewer.slides.forEachIndexed { index, _ ->
                Box(
                    Modifier
                        .weight(1f)
                        .height(3.dp)
                        .clip(CircleShape)
                        .background(if (index <= holder.activeIndex) Color.White else Color.White.copy(alpha = .3f)),
                )
            }
        }
        Row(
            Modifier.align(Alignment.TopCenter).fillMaxWidth().zIndex(2f).padding(horizontal = TeswaSpacing.sm, vertical = TeswaSpacing.xl),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NetworkImage(viewer.group.author.avatarUrl, name, Modifier.size(42.dp).clip(CircleShape))
            Spacer(Modifier.width(TeswaSpacing.xs))
            Column(Modifier.weight(1f)) {
                Text(name, color = Color.White, fontWeight = FontWeight.Bold)
                Text(
                    "${holder.activeIndex + 1} من ${viewer.slides.size}",
                    color = Color.White.copy(alpha = .72f),
                    style = MaterialTheme.typography.labelMedium,
                )
            }
            IconButton(onClick = holder::close, modifier = Modifier.size(TeswaSize.minTouch)) {
                Icon(TeswaIcons.Clear, contentDescription = "إغلاق الحكاية", tint = Color.White)
            }
        }
        Row(Modifier.fillMaxSize().zIndex(1f)) {
            StoryNavigationTarget(
                label = "الحكاية السابقة",
                enabled = holder.activeIndex > 0,
                modifier = Modifier.weight(1f).fillMaxHeight(),
            ) { scope.launch { holder.move(-1) } }
            StoryNavigationTarget(
                label = "الحكاية التالية",
                enabled = holder.activeIndex < viewer.slides.lastIndex,
                modifier = Modifier.weight(1f).fillMaxHeight(),
            ) { scope.launch { holder.move(1) } }
        }
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().zIndex(2f).padding(TeswaSpacing.sm),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
        ) {
            slide.story.caption?.let {
                Surface(color = Color.Black.copy(alpha = .62f), shape = MaterialTheme.shapes.large) {
                    Text(
                        it,
                        Modifier.padding(horizontal = TeswaSpacing.md, vertical = TeswaSpacing.xs),
                        color = Color.White,
                        textAlign = TextAlign.Center,
                    )
                }
            }
            holder.message?.let {
                Text(it, color = Color(0xFFFFB4AB), style = MaterialTheme.typography.bodySmall)
            }
            if (!mine) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xxs),
                ) {
                    VoiceComposer(
                        enabled = holder.workingAction == null,
                        sending = holder.workingAction == "voice_reply",
                        uploadProgress = holder.voiceUploadProgress,
                        onSend = { draft ->
                            holder.sendVoiceReply(draft)?.let {
                                holder.close()
                                onReplyOpened(it)
                                true
                            } ?: false
                        },
                        onError = holder::showMessage,
                    )
                    Surface(
                        modifier = Modifier.weight(1f),
                        shape = MaterialTheme.shapes.large,
                        color = Color.White.copy(alpha = .94f),
                    ) {
                        TeswaTextField(
                            value = holder.replyComposer,
                            onValueChange = holder::composeReply,
                            label = "رد على الحكاية",
                            singleLine = false,
                            minLines = 1,
                            maxLines = 3,
                            enabled = holder.workingAction == null,
                        )
                    }
                    val canSend = holder.replyComposer.isNotBlank() && holder.workingAction == null
                    IconButton(
                        enabled = canSend,
                        modifier = Modifier.size(TeswaSize.minTouch),
                        onClick = {
                            haptics.performTeswa(TeswaHapticEvent.Commit)
                            scope.launch {
                                holder.sendReply()?.let {
                                    holder.close()
                                    onReplyOpened(it)
                                }
                            }
                        },
                    ) {
                        Icon(
                            TeswaIcons.Send,
                            contentDescription = "إرسال الرد",
                            tint = if (canSend) Color.White else Color.White.copy(alpha = .35f),
                        )
                    }
                    IconButton(
                        enabled = holder.workingAction == null,
                        modifier = Modifier.size(TeswaSize.minTouch),
                        onClick = {
                            haptics.performTeswa(if (slide.liked) TeswaHapticEvent.ToggleOff else TeswaHapticEvent.ToggleOn)
                            scope.launch { holder.toggleLike() }
                        },
                    ) {
                        Icon(
                            if (slide.liked) TeswaIcons.Like else TeswaIcons.LikeOutline,
                            contentDescription = if (slide.liked) "إلغاء الإعجاب" else "إعجاب بالحكاية",
                            tint = Color.White,
                        )
                    }
                }
                IconButton(
                    onClick = { onReport(ReportTarget.Story(slide.story.id, "قصة $name")) },
                    enabled = holder.workingAction == null,
                    modifier = Modifier.size(TeswaSize.minTouch),
                ) {
                    Icon(TeswaIcons.Report, contentDescription = "الإبلاغ عن الحكاية", tint = Color.White)
                }
            } else {
                Text("دي حكايتك", color = Color.White.copy(alpha = .75f))
            }
        }
    }
}

@Composable
private fun StoryNavigationTarget(
    label: String,
    enabled: Boolean,
    modifier: Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .clickable(enabled = enabled, onClick = onClick)
            .semantics {
                role = Role.Button
                contentDescription = label
            },
    )
}

@Composable
private fun StoryMediaUnavailable() {
    Column(
        Modifier.fillMaxSize().padding(TeswaSpacing.xxl),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("تعذر فتح وسائط الحكاية", color = Color.White, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(TeswaSpacing.xs))
        Text("تقدر تنتقل للحكاية التالية أو تحاول لاحقًا.", color = Color.White.copy(alpha = .7f), textAlign = TextAlign.Center)
    }
}

@Composable
private fun StoryVideo(url: String, modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            VideoView(context).apply {
                setVideoURI(Uri.parse(url))
                setOnPreparedListener { player ->
                    player.isLooping = true
                    start()
                }
            }
        },
        onRelease = { it.stopPlayback() },
    )
}
