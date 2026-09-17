package com.teswa.mobile.feature.people

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.teswa.mobile.ui.system.TeswaEmptyField
import com.teswa.mobile.ui.system.TeswaEmphasis
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
import com.teswa.mobile.ui.system.TeswaTraceNote

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
        contentPadding = PaddingValues(bottom = TeswaSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.lg),
    ) {
        item {
            TeswaFocusedHeader(title = "الناس", onBack = onBack)
        }

        item {
            Column(
                Modifier
                    .fillMaxWidth()
                    .padding(horizontal = TeswaLayout.ScreenHorizontal),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                TeswaTraceNote("الشخص هنا مهم بقدر ما يساعدك تفهم مين ورا الحاجة، وإيه الدليل اللي اتكوّن من تبديلات حقيقية.")
                TeswaSearchField(
                    query = queryDraft,
                    onQueryChange = onQueryChange,
                    onSearch = onSearch,
                    placeholder = "اسم، username، مدينة أو منطقة",
                )
                Row(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                    TeswaPrimaryAction(
                        text = "دور",
                        onClick = onSearch,
                        modifier = Modifier.weight(1f),
                        icon = TeswaIcons.Search,
                    )
                    if (queryDraft.isNotBlank()) {
                        TeswaSecondaryAction(
                            text = "امسح",
                            onClick = onClear,
                            modifier = Modifier.weight(1f),
                            icon = TeswaIcons.Clear,
                        )
                    }
                    TeswaSecondaryAction(
                        text = if (refreshing) "بنحدّث…" else "حدّث",
                        onClick = onRefresh,
                        modifier = Modifier.weight(1f),
                        icon = TeswaIcons.Refresh,
                        enabled = !refreshing,
                    )
                }
            }
        }

        when (state) {
            PeopleUiState.Loading -> item {
                TeswaInlineLoading(
                    "بندور على الناس…",
                    Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }

            is PeopleUiState.Error -> item {
                TeswaInlineMessage(
                    title = "الناس مش متاحة دلوقتي",
                    body = state.message,
                    icon = TeswaIcons.Refresh,
                    emphasis = TeswaEmphasis.Strong,
                    actionLabel = "حاول تاني",
                    onAction = onRefresh,
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }

            is PeopleUiState.Empty -> item {
                TeswaEmptyField(
                    title = "مفيش حد مطابق",
                    body = if (state.query.isBlank()) {
                        "لسه مفيش ملفات ظاهرة في النطاق الحالي."
                    } else {
                        "ملقيناش حد مطابق لـ «${state.query}» دلوقتي."
                    },
                    modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                )
            }

            is PeopleUiState.Content -> {
                item {
                    TeswaSectionHeader(
                        title = if (state.query.isBlank()) "هويات وأثر من التعامل" else "نتائج «${state.query}»",
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    )
                }

                items(state.entries, key = { it.id }) { person ->
                    PersonIdentityMoment(
                        person = person,
                        onOpenProfile = onOpenProfile,
                        modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                    )
                }

                state.loadMoreError?.let { message ->
                    item {
                        TeswaInlineMessage(
                            title = "باقي الناس ما ظهروش",
                            body = message,
                            emphasis = TeswaEmphasis.Quiet,
                            actionLabel = "حاول تاني",
                            onAction = onLoadMore,
                            modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                        )
                    }
                }

                if (state.hasMore) {
                    item {
                        TeswaPrimaryAction(
                            text = "هات ناس أكتر",
                            loading = state.loadingMore,
                            onClick = onLoadMore,
                            modifier = Modifier.padding(horizontal = TeswaLayout.ScreenHorizontal),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PersonIdentityMoment(
    person: PeopleEntry,
    onOpenProfile: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val place = listOfNotNull(person.city, person.area)
        .filter { it.isNotBlank() }
        .joinToString(" · ")

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clickable { onOpenProfile(person.id) }
            .padding(vertical = TeswaSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        TeswaPersonIdentity(
            name = person.displayName,
            avatarUrl = person.avatarUrl,
            supporting = "@${person.username}" + if (place.isBlank()) "" else " · $place",
            evidence = person.profileTagline?.takeIf { it.isNotBlank() }
                ?: person.bio?.takeIf { it.isNotBlank() },
        )
        TeswaEvidenceLine(
            icon = TeswaIcons.Trust,
            text = "${person.successfulSwapsCount} تبديل مكتمل",
            supporting = buildList {
                add("${person.activeItemsCount} حاجة في اللعب")
                person.responseRate?.let { add("بيرد بنسبة ${it.toInt()}%") }
            }.joinToString(" · "),
        )
        Text(
            text = "افتح الملف وشوف الحاجات والدليل في سياقهم",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}
