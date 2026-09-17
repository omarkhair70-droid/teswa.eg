package com.teswa.mobile.feature.discover

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import com.teswa.mobile.ui.system.TeswaChoiceChip
import com.teswa.mobile.ui.system.TeswaEmphasis
import com.teswa.mobile.ui.system.TeswaIcons
import com.teswa.mobile.ui.system.TeswaInlineLoading
import com.teswa.mobile.ui.system.TeswaInlineMessage
import com.teswa.mobile.ui.system.TeswaLayout
import com.teswa.mobile.ui.system.TeswaObjectIdentity
import com.teswa.mobile.ui.system.TeswaObjectStage
import com.teswa.mobile.ui.system.TeswaPersonIdentity
import com.teswa.mobile.ui.system.TeswaPrimaryAction
import com.teswa.mobile.ui.system.TeswaScreenHeading
import com.teswa.mobile.ui.system.TeswaSectionHeader
import com.teswa.mobile.ui.system.TeswaSearchField
import com.teswa.mobile.ui.system.TeswaSecondaryAction
import com.teswa.mobile.ui.system.TeswaSpacing

@Composable
fun DiscoverList(
    modifier: Modifier,
    holder: DiscoverStateHolder,
    queryDraft: String,
    onQueryChange: (String) -> Unit,
    categories: List<DiscoverCategory>,
    people: List<DiscoverPersonPreview>,
    items: List<DiscoverItem> = emptyList(),
    hasMore: Boolean = false,
    loadingMore: Boolean = false,
    emptyMessage: String? = null,
    onApplyQuery: () -> Unit,
    onSelectCategory: (String?) -> Unit,
    onSelectCondition: (String?) -> Unit,
    onClearFilters: () -> Unit,
    onNearby: () -> Unit,
    onDisableNearby: () -> Unit,
    onOpenPeople: () -> Unit,
    onOpenProfile: (String) -> Unit,
    onOpenItem: (String) -> Unit,
    onLoadMore: () -> Unit = {},
    onRefresh: () -> Unit = {},
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            horizontal = TeswaLayout.ScreenHorizontal,
            vertical = TeswaLayout.ScreenVertical,
        ),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xl),
    ) {
        item {
            TeswaScreenHeading(
                title = "دور جوه الاحتمالات",
                eyebrow = "اكتشف",
                supporting = "ابحث بالاسم أو التصنيف أو المدينة، وبعدها ضيّق النطاق على قد القرار اللي بتحاول تاخده.",
            )
        }

        item {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
            ) {
                TeswaSearchField(
                    query = queryDraft,
                    onQueryChange = onQueryChange,
                    onSearch = onApplyQuery,
                    placeholder = "اسم حاجة، تصنيف، مدينة…",
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TeswaChoiceChip(
                        label = when {
                            holder.locationWorking -> "بنحدد القريب…"
                            holder.nearbyLocation != null -> "قريب مني"
                            else -> "الأقرب لي"
                        },
                        selected = holder.nearbyLocation != null,
                        onClick = if (holder.nearbyLocation == null) onNearby else onDisableNearby,
                        leadingIcon = TeswaIcons.Location,
                    )
                    if (holder.filters.activeCount > 0) {
                        TeswaChoiceChip(
                            label = "امسح ${holder.filters.activeCount} فلتر",
                            selected = true,
                            onClick = onClearFilters,
                            leadingIcon = TeswaIcons.Clear,
                        )
                    }
                }
                holder.message?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        if (categories.isNotEmpty()) {
            item {
                TeswaSectionHeader("التصنيفات")
                Spacer(Modifier.padding(top = TeswaSpacing.xxs))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                    item {
                        TeswaChoiceChip(
                            label = "الكل",
                            selected = holder.filters.category == null,
                            onClick = { onSelectCategory(null) },
                        )
                    }
                    items(categories, key = { it.id }) { category ->
                        TeswaChoiceChip(
                            label = category.nameAr,
                            selected = holder.filters.category == category.nameAr,
                            onClick = {
                                onSelectCategory(
                                    if (holder.filters.category == category.nameAr) null else category.nameAr,
                                )
                            },
                        )
                    }
                }
            }
        }

        item {
            TeswaSectionHeader("الحالة")
            Spacer(Modifier.padding(top = TeswaSpacing.xxs))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.xs)) {
                item { ConditionChip("الكل", null, holder.filters.condition, onSelectCondition) }
                item { ConditionChip("شبه جديد", "almost_new", holder.filters.condition, onSelectCondition) }
                item { ConditionChip("حالة جيدة", "good_used", holder.filters.condition, onSelectCondition) }
                item { ConditionChip("ملاحظات بسيطة", "minor_issues", holder.filters.condition, onSelectCondition) }
                item { ConditionChip("يحتاج إصلاح", "needs_repair", holder.filters.condition, onSelectCondition) }
            }
        }

        item {
            TeswaSectionHeader(
                title = "ناس ممكن يفرقوا في القرار",
                actionLabel = "كل الناس",
                onAction = onOpenPeople,
            )
            if (people.isNotEmpty()) {
                Spacer(Modifier.padding(top = TeswaSpacing.xs))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(TeswaSpacing.lg)) {
                    items(people, key = { it.id }) { person ->
                        Column(
                            modifier = Modifier
                                .fillParentMaxWidth(.72f)
                                .clickable { onOpenProfile(person.id) },
                            verticalArrangement = Arrangement.spacedBy(TeswaSpacing.xs),
                        ) {
                            val place = listOfNotNull(person.city, person.area)
                                .filter { it.isNotBlank() }
                                .joinToString(" • ")
                            TeswaPersonIdentity(
                                name = person.displayName,
                                avatarUrl = person.avatarUrl,
                                supporting = buildString {
                                    append("@${person.username}")
                                    if (place.isNotBlank()) append(" · $place")
                                },
                                evidence = "${person.successfulSwapsCount} تبديلات مكتملة · ${person.activeItemsCount} حاجات في اللعب",
                            )
                        }
                    }
                }
            } else {
                Spacer(Modifier.padding(top = TeswaSpacing.xs))
                Text(
                    text = "مفيش ناس ظاهرة في النطاق الحالي. تقدر تفتح الدليل وتدور بالاسم أو المدينة.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        item {
            TeswaSectionHeader(
                title = "النتائج",
                actionLabel = "حدّث",
                onAction = onRefresh,
            )
            if (holder.filters.activeCount > 0) {
                Text(
                    text = "${holder.filters.activeCount} فلتر نشط",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }

        emptyMessage?.let { message ->
            item {
                TeswaInlineMessage(
                    title = "ملقيناش تطابق واضح",
                    body = message,
                    actionLabel = if (holder.filters.activeCount > 0) "امسح الفلاتر" else null,
                    onAction = if (holder.filters.activeCount > 0) onClearFilters else null,
                )
            }
        }

        if (items.isEmpty() && hasMore) {
            item {
                TeswaInlineMessage(
                    title = "أول نطاق مفيهوش تطابق",
                    body = "نقدر نوسّع البحث ونشوف احتمالات أبعد شوية.",
                    actionLabel = "وسّع البحث",
                    onAction = onLoadMore,
                )
            }
        }

        items(items, key = { it.id }) { item ->
            DiscoverObject(
                item = item,
                onOpen = { onOpenItem(item.id) },
            )
        }

        if (hasMore) {
            item {
                TeswaPrimaryAction(
                    text = "هات نتائج أكتر",
                    loading = loadingMore,
                    onClick = onLoadMore,
                )
            }
        }
    }
}

@Composable
private fun ConditionChip(
    label: String,
    value: String?,
    selectedValue: String?,
    onSelect: (String?) -> Unit,
) {
    TeswaChoiceChip(
        label = label,
        selected = selectedValue == value,
        onClick = { onSelect(if (selectedValue == value && value != null) null else value) },
    )
}

@Composable
private fun DiscoverObject(
    item: DiscoverItem,
    onOpen: () -> Unit,
) {
    val meta = buildList {
        item.condition?.takeIf { it.isNotBlank() }?.let(::add)
        item.city?.takeIf { it.isNotBlank() }?.let(::add)
        item.distanceKm?.let { add(String.format(java.util.Locale.US, "%.1f كم", it)) }
    }.joinToString(" • ")

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onOpen),
        verticalArrangement = Arrangement.spacedBy(TeswaSpacing.sm),
    ) {
        TeswaObjectStage(
            item = TeswaObjectIdentity(
                title = item.title,
                imageUrl = item.imageUrl,
                meta = meta.takeIf { it.isNotBlank() },
                owner = item.ownerDisplayName?.takeIf { it.isNotBlank() }?.let { "عند $it" },
            ),
            eyebrow = item.category?.takeIf { it.isNotBlank() },
        )
        item.description?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun DiscoverCentered(
    message: String,
    modifier: Modifier,
    loading: Boolean = false,
    action: Pair<String, () -> Unit>? = null,
) {
    Column(
        modifier
            .fillMaxSize()
            .padding(TeswaLayout.RootContentPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (loading) {
            TeswaInlineLoading(message)
        } else {
            TeswaInlineMessage(
                title = "الاكتشاف وقف هنا",
                body = message,
                emphasis = TeswaEmphasis.Strong,
                actionLabel = action?.first,
                onAction = action?.second,
            )
        }
    }
}
