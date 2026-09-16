package com.teswa.mobile.feature.people

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
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.ui.NetworkImage

@Composable
internal fun PeopleDirectoryContent(
    state: PeopleUiState,
    queryDraft: String,
    refreshing: Boolean,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    onClear: () -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("ناس تِسوى", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                    Text(
                        "اكتشف الشخص قبل العرض: اهتماماته، مكانه، ونشاطه على تِسوى.",
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
                Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = queryDraft,
                        onValueChange = onQueryChange,
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        label = { Text("دور على شخص") },
                        placeholder = { Text("اسم، @username، مدينة أو منطقة") },
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = onSearch) { Text("بحث") }
                        if (queryDraft.isNotBlank()) OutlinedButton(onClick = onClear) { Text("مسح") }
                        OutlinedButton(enabled = !refreshing, onClick = onRefresh) {
                            Text(if (refreshing) "بنحدّث…" else "تحديث")
                        }
                    }
                }
            }
        }

        when (state) {
            PeopleUiState.Loading -> item { PeopleCenter("بنحضّر ناس تِسوى…", loading = true) }
            is PeopleUiState.Error -> item { PeopleCenter(state.message) }
            is PeopleUiState.Empty -> item {
                PeopleCenter(
                    if (state.query.isBlank()) "لسه مفيش ملفات متاحة للاستكشاف دلوقتي."
                    else "مفيش حد مطابق لـ «${state.query}» دلوقتي.",
                )
            }
            is PeopleUiState.Content -> {
                item {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column {
                            Text(
                                if (state.query.isBlank()) "اكتشف المجتمع" else "نتائج «${state.query}»",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                            )
                            Text(
                                "${state.entries.size} ملف ظاهر دلوقتي",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                items(state.entries, key = { it.id }) { person ->
                    PersonDirectoryCard(person, onOpenProfile)
                }

                state.loadMoreError?.let { message ->
                    item {
                        Surface(
                            shape = MaterialTheme.shapes.medium,
                            color = MaterialTheme.colorScheme.errorContainer.copy(alpha = .45f),
                        ) {
                            Text(message, Modifier.fillMaxWidth().padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer)
                        }
                    }
                }

                if (state.hasMore) {
                    item {
                        Button(
                            modifier = Modifier.fillMaxWidth(),
                            enabled = !state.loadingMore,
                            onClick = onLoadMore,
                        ) {
                            if (state.loadingMore) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                            else Text("هات ناس أكتر")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PersonDirectoryCard(person: PeopleEntry, onOpenProfile: (String) -> Unit) {
    Card(onClick = { onOpenProfile(person.id) }) {
        Column(Modifier.fillMaxWidth()) {
            Box(Modifier.fillMaxWidth().height(104.dp)) {
                NetworkImage(person.coverUrl, "غلاف ${person.displayName}", Modifier.fillMaxSize())
                NetworkImage(
                    person.avatarUrl,
                    person.displayName,
                    Modifier
                        .align(Alignment.BottomStart)
                        .padding(start = 14.dp, bottom = 10.dp)
                        .size(64.dp)
                        .clip(CircleShape),
                )
            }
            Column(Modifier.fillMaxWidth().padding(15.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(person.displayName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        Text("@${person.username}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                    }
                    val place = listOfNotNull(person.city, person.area).joinToString(" • ")
                    if (place.isNotBlank()) Text(place, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
                (person.profileTagline ?: person.bio)?.let {
                    Text(it, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    PersonStat("${person.activeItemsCount}", "عناصر", Modifier.weight(1f))
                    PersonStat("${person.successfulSwapsCount}", "تبديلات", Modifier.weight(1f))
                    PersonStat(person.responseRate?.let { "${it.toInt()}%" } ?: "—", "معدل الرد", Modifier.weight(1f))
                }
                Text(
                    "افتح الملف وشوف التفاصيل والحاجات النشطة",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
    }
}

@Composable
private fun PersonStat(value: String, label: String, modifier: Modifier) {
    Surface(modifier, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f)) {
        Column(Modifier.padding(9.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(value, fontWeight = FontWeight.Bold)
            Text(label, style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun PeopleCenter(message: String, loading: Boolean = false) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 36.dp, horizontal = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (loading) {
            CircularProgressIndicator()
            Spacer(Modifier.height(12.dp))
        }
        Text(message, textAlign = TextAlign.Center)
    }
}
