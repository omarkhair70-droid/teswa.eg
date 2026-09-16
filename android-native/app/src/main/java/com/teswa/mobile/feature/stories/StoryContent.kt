package com.teswa.mobile.feature.stories

import android.net.Uri
import android.widget.VideoView
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.teswa.mobile.ui.NetworkImage
import kotlinx.coroutines.launch
import com.teswa.mobile.feature.voice.VoiceComposer

@Composable
fun StoriesRail(
    holder: StoryStateHolder,
    onCreate: () -> Unit,
    onManage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    when (val state = holder.homeState) {
        StoryHomeState.Loading -> Row(
            modifier.fillMaxWidth().padding(vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            CircularProgressIndicator(Modifier.size(22.dp))
            Text("بنحضّر القصص…", style = MaterialTheme.typography.bodySmall)
        }
        is StoryHomeState.Error -> Surface(
            modifier.fillMaxWidth(),
            shape = MaterialTheme.shapes.large,
            color = MaterialTheme.colorScheme.errorContainer.copy(alpha = .45f),
        ) {
            Row(
                Modifier.fillMaxWidth().padding(14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(state.message, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                OutlinedButton(onClick = { scope.launch { holder.load() } }) { Text("إعادة") }
            }
        }
        is StoryHomeState.Ready -> if (state.groups.isNotEmpty()) {
            Column(modifier.fillMaxWidth()) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("حكايات تِسوى", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    OutlinedButton(onClick = onManage) { Text("إدارة قصصي") }
                }
                Spacer(Modifier.height(10.dp))
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 2.dp),
                    horizontalArrangement = Arrangement.spacedBy(13.dp),
                ) {
                    item {
                        Column(
                            Modifier.width(76.dp).clickable(onClick = onCreate),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Surface(
                                Modifier.size(68.dp),
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.primaryContainer,
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text("+", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                            Spacer(Modifier.height(5.dp))
                            Text("قصتك", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                    items(state.groups, key = { it.author.id }) { group ->
                        StoryAuthorBubble(group) { scope.launch { holder.open(group) } }
                    }
                }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Surface(
                    modifier.fillMaxWidth().clickable(onClick = onCreate),
                    shape = MaterialTheme.shapes.large,
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .45f),
                ) {
                    Row(
                        Modifier.fillMaxWidth().padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text("شارك أول قصة", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            Text("صورة أو فيديو لمدة 24 ساعة", style = MaterialTheme.typography.bodySmall)
                        }
                        Text("+", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
                    }
                }
                TextButton(onClick = onManage) { Text("إدارة قصصي") }
            }
        }
    }
}

@Composable
private fun StoryAuthorBubble(group: StoryGroup, onOpen: () -> Unit) {
    val name = group.author.displayName ?: group.author.username ?: "مستخدم"
    Column(
        Modifier.width(76.dp).clickable(onClick = onOpen),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier
                .size(68.dp)
                .border(2.dp, MaterialTheme.colorScheme.primary, CircleShape)
                .padding(3.dp),
        ) {
            NetworkImage(group.author.avatarUrl, name, Modifier.fillMaxSize().clip(CircleShape))
            Surface(
                Modifier.align(Alignment.BottomEnd),
                shape = CircleShape,
                color = MaterialTheme.colorScheme.primary,
            ) {
                Text(
                    group.stories.size.toString(),
                    Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    style = MaterialTheme.typography.labelSmall,
                )
            }
        }
        Spacer(Modifier.height(5.dp))
        Text(name, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelMedium)
    }
}

@Composable
fun StoryViewerScreen(
    holder: StoryStateHolder,
    onReplyOpened: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val viewer = holder.viewer ?: return
    val slide = viewer.slides.getOrNull(holder.activeIndex) ?: return
    val scope = rememberCoroutineScope()
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
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp),
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
            Modifier.align(Alignment.TopCenter).fillMaxWidth().padding(horizontal = 14.dp, vertical = 24.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            NetworkImage(viewer.group.author.avatarUrl, name, Modifier.size(42.dp).clip(CircleShape))
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(name, color = Color.White, fontWeight = FontWeight.Bold)
                Text("${holder.activeIndex + 1} من ${viewer.slides.size}", color = Color.White.copy(alpha = .72f), style = MaterialTheme.typography.labelMedium)
            }
            OutlinedButton(onClick = holder::close) { Text("إغلاق", color = Color.White) }
        }
        Row(Modifier.fillMaxSize()) {
            Box(
                Modifier.weight(1f).fillMaxHeight().clickable(enabled = holder.activeIndex > 0) {
                    scope.launch { holder.move(-1) }
                },
            )
            Box(
                Modifier.weight(1f).fillMaxHeight().clickable(enabled = holder.activeIndex < viewer.slides.lastIndex) {
                    scope.launch { holder.move(1) }
                },
            )
        }
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            slide.story.caption?.let {
                Surface(
                    color = Color.Black.copy(alpha = .55f),
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Text(it, Modifier.padding(horizontal = 14.dp, vertical = 9.dp), color = Color.White, textAlign = TextAlign.Center)
                }
                Spacer(Modifier.height(9.dp))
            }
            holder.message?.let {
                Text(it, color = Color(0xFFFFB4AB), style = MaterialTheme.typography.bodySmall)
                Spacer(Modifier.height(7.dp))
            }
            if (!mine) {
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Bottom,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
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
                    OutlinedTextField(
                        value = holder.replyComposer,
                        onValueChange = holder::composeReply,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("رد على القصة…") },
                        minLines = 1,
                        maxLines = 3,
                    )
                    Button(
                        onClick = {
                            scope.launch {
                                holder.sendReply()?.let {
                                    holder.close()
                                    onReplyOpened(it)
                                }
                            }
                        },
                        enabled = holder.replyComposer.isNotBlank() && holder.workingAction == null,
                    ) { Text(if (holder.workingAction == "reply") "…" else "إرسال") }
                    OutlinedButton(
                        onClick = { scope.launch { holder.toggleLike() } },
                        enabled = holder.workingAction == null,
                    ) { Text(if (slide.liked) "♥" else "♡") }
                }
            } else {
                Text("دي قصتك", color = Color.White.copy(alpha = .75f))
            }
        }
    }
}

@Composable
private fun StoryMediaUnavailable() {
    Column(
        Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("تعذر فتح وسائط القصة", color = Color.White, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(8.dp))
        Text("تقدر تنتقل للقصة التالية أو تحاول لاحقًا.", color = Color.White.copy(alpha = .7f), textAlign = TextAlign.Center)
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
