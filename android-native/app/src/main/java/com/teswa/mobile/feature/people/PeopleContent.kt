package com.teswa.mobile.feature.people

import androidx.compose.foundation.clickable
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
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaEvidenceLine
import com.teswa.mobile.ui.system.TeswaFocusedHeader
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaSearchField
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing

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
        contentPadding = PaddingValues(vertical = TeswaSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.md),
    ) {
        item {
            TeswaFocusedHeader(title = "ناس تِسوى", onBack = onBack)
        }

        item {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = TeswaLayout.ScreenHorizontal),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
            ) {
                Text(
                    "اكتشف الشخص بقدر ما تحتاجه لفهم حاجاته وأدلة التعامل معاه.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TeswaSearchField(
                    query = queryDraft,
                    onQueryChange = onQueryChange,
                    onSearch = onSearch,
                    placeholder = "اسم، username، مدينة أو منطقة",
                )
                Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                    TeswaPrimaryAction("بحث", onSearch, Modifier.weight(1f), icon = TeswaIcons.Search)
                    if (queryDraft.isNotBlank()) {
                        TeswaSecondaryAction("مسح", onClear, Modifier.weight(1f), icon = TeswaIcons.Clear)
                    }
                    TeswaSecondaryAction(
                        text = if (refreshing) "بنحدّث…" else "تحديث",
                        onClick = onRefresh,
                        modifier = Modifier.weight(1f),
                        icon = TeswaIcons.Refresh,
                        enabled = !refreshing,
                    )
                }
            }
        }

        when (state) {
            PeopleUiState.Loading -> item { TeswaInlineLoading("بنحضّر ناس تِسوى…", Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal)) }
            is PeopleUiState.Error -> item { TeswaInlineMessage("الناس مش متاحة دلوقتي", state.message, icon = TeswaIcons.Refresh, modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal)) }
            is PeopleUiState.Empty -> item {
                TeswaEmptyField(
                    title = "مفيش نتائج",
                    body = if (state.query.isBlank()) "لسه مفيش ملفات متاحة للاستكشاف دلوقتي."
                    else "مفيش حد مطابق لـ «${state.query}» دلوقتي.",
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }
            is PeopleUiState.Content -> {
                item {
                    TeswaSectionHeader(
                        if (state.query.isBlank()) "اكتشف المجتمع" else "نتائج «${state.query}»",
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    )
                }

                items(state.entries, key = { it.id }) { person ->
                    PersonDirectoryCard(person, onOpenProfile, Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal))
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
private fun PersonDirectoryCard(person: PeopleEntry, onOpenProfile: (String) -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().clickable { onOpenProfile(person.id) }.padding(vertical = TeswaSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
    ) {
        val place = listOfNotNull(person.city, person.area).joinToString(" · ")
        TeswaPersonIdentity(
            name = person.displayName,
            avatarUrl = person.avatarUrl,
            supporting = "@${person.username}" + if (place.isBlank()) "" else " · $place",
            evidence = person.profileTagline ?: person.bio,
        )
        TeswaEvidenceLine(
            icon = TeswaIcons.Trust,
            text = "${person.successfulSwapsCount} تبديل مكتمل",
            supporting = buildList {
                add("${person.activeItemsCount} حاجة نشطة")
                person.responseRate?.let { add("بيرد بنسبة ${it.toInt()}%") }
            }.joinToString(" · "),
        )
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
