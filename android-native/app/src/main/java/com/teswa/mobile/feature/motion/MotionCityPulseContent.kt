package com.teswa.mobile.feature.motion

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.ui.NetworkImage

@Composable
fun MotionCityPulseCard(
    state: MotionCityPulseState,
    onEnable: () -> Unit,
    onRefresh: () -> Unit,
    onRetry: () -> Unit,
    onHide: () -> Unit,
    onOpenItem: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenStories: () -> Unit,
) {
    Card {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            when (state) {
                MotionCityPulseState.Hidden -> {
                    Text("نبض مدينتك", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "خلّي تِسوى يحدد مدينتك مرة واحدة ويجمع الحركة القريبة في مساحة مستقلة عن Nearby العادي.",
                        style = MaterialTheme.typography.bodyMedium,
                    )
                    Button(onClick = onEnable) { Text("فعّل نبض مدينتي") }
                }
                MotionCityPulseState.Resolving -> PulseWorking("بنحدد مدينتك…")
                is MotionCityPulseState.Loading -> PulseWorking("بنقرأ نبض ${state.location.label}…")
                is MotionCityPulseState.Error -> {
                    Text("نبض مدينتك", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text(state.message, color = MaterialTheme.colorScheme.error)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = onRetry) { Text("حاول تاني") }
                        if (state.location != null) TextButton(onClick = onHide) { Text("إخفاء") }
                    }
                }
                is MotionCityPulseState.Ready -> ReadyPulse(
                    state = state,
                    onRefresh = onRefresh,
                    onHide = onHide,
                    onOpenItem = onOpenItem,
                    onOpenProfile = onOpenProfile,
                    onOpenStories = onOpenStories,
                )
            }
        }
    }
}

@Composable
private fun ReadyPulse(
    state: MotionCityPulseState.Ready,
    onRefresh: () -> Unit,
    onHide: () -> Unit,
    onOpenItem: (String) -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenStories: () -> Unit,
) {
    val pulse = state.pulse
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("نبض ${pulse.location.label}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("الحركة اللي ليها علاقة بالمكان حوالينك.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (state.refreshing) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        PulseMetric(pulse.movingItems.size.toString(), "حركة", Modifier.weight(1f))
        PulseMetric(pulse.storyItems.size.toString(), "حكايات", Modifier.weight(1f))
        PulseMetric(pulse.people.size.toString(), "ناس", Modifier.weight(1f))
        PulseMetric(pulse.activeStoryAuthors.size.toString(), "قصص", Modifier.weight(1f))
    }
    state.notice?.let {
        Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f)) {
            Text(it, Modifier.fillMaxWidth().padding(10.dp), style = MaterialTheme.typography.bodySmall)
        }
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(enabled = !state.refreshing, onClick = onRefresh) { Text("تحديث") }
        TextButton(onClick = onHide) { Text("إخفاء") }
        TextButton(onClick = onOpenStories) { Text("الحكايات") }
    }

    if (pulse.people.isNotEmpty()) {
        Text("ناس قريبة من النبض", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            items(pulse.people, key = { it.id }) { person ->
                Card(onClick = { onOpenProfile(person.id) }, modifier = Modifier.width(170.dp)) {
                    Row(Modifier.padding(11.dp), verticalAlignment = Alignment.CenterVertically) {
                        NetworkImage(person.avatarUrl, person.displayName, Modifier.size(46.dp).clip(CircleShape))
                        Spacer(Modifier.width(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text(person.displayName, fontWeight = FontWeight.Bold, maxLines = 1)
                            Text("@${person.username}", style = MaterialTheme.typography.labelSmall, maxLines = 1)
                            val place = listOfNotNull(person.city, person.area).joinToString(" • ")
                            if (place.isNotBlank()) Text(place, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                        }
                    }
                }
            }
        }
    }

    if (pulse.movingItems.isNotEmpty()) {
        Text("بيتحرك في ${pulse.location.label}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            items(pulse.movingItems, key = { "pulse-moving-${it.id}" }) { item ->
                Card(onClick = { onOpenItem(item.id) }, modifier = Modifier.width(190.dp)) {
                    Column {
                        NetworkImage(item.imageUrl, item.title, Modifier.fillMaxWidth().height(110.dp))
                        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(item.title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${item.openInterestCount} اهتمام", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }

    if (pulse.storyItems.isNotEmpty()) {
        Text("حكايات من المدينة", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        pulse.storyItems.take(3).forEach { item ->
            Card(onClick = { onOpenItem(item.id) }) {
                Row(Modifier.fillMaxWidth().padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    NetworkImage(item.imageUrl, item.title, Modifier.size(62.dp))
                    Spacer(Modifier.width(9.dp))
                    Column(Modifier.weight(1f)) {
                        Text(item.storyLabel, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelSmall)
                        Text(item.title, fontWeight = FontWeight.Bold, maxLines = 1)
                        if (item.storySnippet.isNotBlank()) Text(item.storySnippet, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
            Spacer(Modifier.height(7.dp))
        }
    }

    if (pulse.activeStoryAuthors.isNotEmpty()) {
        Text("قصص نشطة حوالينك", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        LazyRow(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            items(pulse.activeStoryAuthors, key = { "pulse-author-${it.id}" }) { author ->
                Card(onClick = { onOpenProfile(author.id) }, modifier = Modifier.width(145.dp)) {
                    Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                        val name = author.displayName ?: author.username ?: "مستخدم تِسوى"
                        NetworkImage(author.avatarUrl, name, Modifier.size(42.dp).clip(CircleShape))
                        Spacer(Modifier.width(7.dp))
                        Column(Modifier.weight(1f)) {
                            Text(name, fontWeight = FontWeight.Bold, maxLines = 1)
                            Text("${author.storiesCount} قصة", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }

    if (pulse.movingItems.isEmpty() && pulse.storyItems.isEmpty() && pulse.people.isEmpty() && pulse.activeStoryAuthors.isEmpty()) {
        Text("النبض هادي في ${pulse.location.label} دلوقتي؛ باقي حركة تِسوى لسه متاحة تحت.", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun PulseWorking(message: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
        Text(message)
    }
}

@Composable
private fun PulseMetric(value: String, label: String, modifier: Modifier) {
    Surface(modifier, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .45f)) {
        Column(Modifier.padding(8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}
