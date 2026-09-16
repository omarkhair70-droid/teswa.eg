package com.teswa.mobile.feature.motion

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.ui.NetworkImage

@Composable
fun MotionContent(
    feed: MotionFeedState,
    cityPulse: MotionCityPulseState,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onEnableCityPulse: () -> Unit,
    onRefreshCityPulse: () -> Unit,
    onRetryCityPulse: () -> Unit,
    onHideCityPulse: () -> Unit,
    onOpenItem: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenStories: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("نبض تِسوى", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "الحاجات اللي بدأت تتحرك، الحكايات اللي بتشد الانتباه، والناس النشطة حواليك.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.width(12.dp))
                OutlinedButton(onClick = onBack) { Text("رجوع") }
            }
        }

        item {
            Card {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        MotionMetric(feed.movingItems.size.toString(), "عليها حركة", Modifier.weight(1f))
                        MotionMetric(feed.storyItems.size.toString(), "حكايات", Modifier.weight(1f))
                        MotionMetric(feed.videoDrops.size.toString(), "لقطات", Modifier.weight(1f))
                    }
                    if (feed.loading) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                            Text("بنحدّث النبض…", style = MaterialTheme.typography.bodySmall)
                        }
                    } else {
                        OutlinedButton(onClick = onRefresh) { Text("حدّث النبض") }
                    }
                }
            }
        }

        item {
            MotionCityPulseCard(
                state = cityPulse,
                onEnable = onEnableCityPulse,
                onRefresh = onRefreshCityPulse,
                onRetry = onRetryCityPulse,
                onHide = onHideCityPulse,
                onOpenItem = onOpenItem,
                onOpenProfile = onOpenProfile,
                onOpenStories = onOpenStories,
            )
        }

        item {
            Card(onClick = onOpenStories) {
                Row(
                    Modifier.fillMaxWidth().padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("حكايات تِسوى", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text(
                            "افتح تجربة القصص الأصلية وشوف الحكايات النشطة ورد عليها من نفس مسار Stories.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Spacer(Modifier.width(10.dp))
                    OutlinedButton(onClick = onOpenStories) { Text("افتح") }
                }
            }
        }

        item { MotionSectionTitle("عناصر بدأت تتحرك", "اهتمام وعروض فتحت باب للتبديل.") }
        feed.movingError?.let { message -> item { MotionSectionError(message, onRefresh) } }
        if (feed.movingItems.isNotEmpty()) {
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(feed.movingItems, key = { it.id }) { item ->
                        MovingCard(item, onOpenItem)
                    }
                }
            }
        } else if (!feed.loading && feed.movingError == null) {
            item { MotionEmptyLine("مفيش عناصر عليها حركة واضحة دلوقتي.") }
        }

        item { MotionSectionTitle("حكايات بتشد الانتباه", "السياق وسبب التبديل قبل ما تدخل على العنصر.") }
        feed.storiesError?.let { message -> item { MotionSectionError(message, onRefresh) } }
        if (feed.storyItems.isNotEmpty()) {
            items(feed.storyItems, key = { "story-${it.id}" }) { item ->
                StoryMotionCard(item, onOpenItem)
            }
        } else if (!feed.loading && feed.storiesError == null) {
            item { MotionEmptyLine("الحكايات هتظهر هنا أول ما يبقى فيه نشاط جديد.") }
        }

        item { MotionSectionTitle("لقطات من الحركة", "فيديوهات مرتبطة بعناصر حقيقية؛ افتح العنصر للتفاصيل.") }
        feed.videoError?.let { message -> item { MotionSectionError(message, onRefresh) } }
        if (feed.videoDrops.isNotEmpty()) {
            item {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(feed.videoDrops, key = { "video-${it.id}" }) { drop ->
                        VideoDropCard(drop, onOpenItem)
                    }
                }
            }
        } else if (!feed.loading && feed.videoError == null) {
            item { MotionEmptyLine("مفيش لقطات فيديو جديدة دلوقتي.") }
        }
    }
}

@Composable
private fun MovingCard(item: MotionMovingItem, onOpenItem: (String) -> Unit) {
    Card(onClick = { onOpenItem(item.id) }, modifier = Modifier.width(230.dp)) {
        Column {
            NetworkImage(item.imageUrl, item.title, Modifier.fillMaxWidth().height(150.dp))
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text("${item.openInterestCount} اهتمام مفتوح", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium)
                val meta = listOfNotNull(item.category, item.location).joinToString(" • ")
                if (meta.isNotBlank()) Text(meta, style = MaterialTheme.typography.bodySmall, maxLines = 1)
                if (item.hasVideoTeaser) Text("فيه لقطة فيديو", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun StoryMotionCard(item: MotionStoryItem, onOpenItem: (String) -> Unit) {
    Card(onClick = { onOpenItem(item.id) }) {
        Row(Modifier.fillMaxWidth().padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
            NetworkImage(item.imageUrl, item.title, Modifier.size(92.dp))
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(item.storyLabel, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1)
                if (item.storySnippet.isNotBlank()) Text(item.storySnippet, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val meta = listOfNotNull(item.ownerDisplayName, item.city, item.area).joinToString(" • ")
                if (meta.isNotBlank()) Text(meta, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun VideoDropCard(drop: MotionVideoDrop, onOpenItem: (String) -> Unit) {
    Card(onClick = { onOpenItem(drop.id) }, modifier = Modifier.width(220.dp)) {
        Column {
            NetworkImage(drop.imageUrl, drop.title, Modifier.fillMaxWidth().height(138.dp))
            Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(drop.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2)
                drop.durationMs?.let { Text("فيديو ${formatDuration(it)}", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelMedium) }
                val meta = listOfNotNull(drop.ownerDisplayName, drop.location).joinToString(" • ")
                if (meta.isNotBlank()) Text(meta, maxLines = 1, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun MotionSectionTitle(title: String, subtitle: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun MotionMetric(value: String, label: String, modifier: Modifier) {
    Surface(modifier, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = .38f)) {
        Column(Modifier.padding(10.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun MotionSectionError(message: String, onRetry: () -> Unit) {
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.errorContainer.copy(alpha = .45f)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(message, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
            OutlinedButton(onClick = onRetry) { Text("إعادة") }
        }
    }
}

@Composable
private fun MotionEmptyLine(message: String) {
    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)) {
        Text(message, Modifier.fillMaxWidth().padding(16.dp))
    }
}

private fun formatDuration(durationMs: Int): String {
    val seconds = (durationMs / 1000).coerceAtLeast(0)
    return "%d:%02d".format(java.util.Locale.US, seconds / 60, seconds % 60)
}
