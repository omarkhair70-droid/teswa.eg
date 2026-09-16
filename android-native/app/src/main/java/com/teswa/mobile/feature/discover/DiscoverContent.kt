package com.teswa.mobile.feature.discover

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
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.teswa.mobile.ui.NetworkImage

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
    onOpenProfile: (String) -> Unit,
    onOpenItem: (String) -> Unit,
    onOpenStories: () -> Unit,
    onLoadMore: () -> Unit = {},
    onRefresh: () -> Unit = {},
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("اكتشف", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                Text(
                    "مش قائمة منتجات؛ دي مساحة تلاقي فيها حاجات وناس وفرص تبديل ليها معنى.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
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
                        label = { Text("دور على حاجة") },
                        placeholder = { Text("اسم، تصنيف، مدينة…") },
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = onApplyQuery) { Text("بحث") }
                        if (holder.filters.activeCount > 0) OutlinedButton(onClick = onClearFilters) { Text("مسح الفلاتر") }
                    }
                }
            }
        }

        if (categories.isNotEmpty()) {
            item {
                Text("التصنيفات", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        FilterChip(
                            selected = holder.filters.category == null,
                            onClick = { onSelectCategory(null) },
                            label = { Text("الكل") },
                        )
                    }
                    items(categories, key = { it.id }) { category ->
                        FilterChip(
                            selected = holder.filters.category == category.nameAr,
                            onClick = { onSelectCategory(if (holder.filters.category == category.nameAr) null else category.nameAr) },
                            label = { Text(category.nameAr) },
                        )
                    }
                }
            }
        }

        item {
            Text("الحالة", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(8.dp))
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item { ConditionChip("الكل", null, holder.filters.condition, onSelectCondition) }
                item { ConditionChip("شبه جديد", "almost_new", holder.filters.condition, onSelectCondition) }
                item { ConditionChip("حالة جيدة", "good_used", holder.filters.condition, onSelectCondition) }
                item { ConditionChip("ملاحظات بسيطة", "minor_issues", holder.filters.condition, onSelectCondition) }
                item { ConditionChip("يحتاج إصلاح", "needs_repair", holder.filters.condition, onSelectCondition) }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                if (holder.nearbyLocation == null) {
                    OutlinedButton(enabled = !holder.locationWorking, onClick = onNearby) {
                        Text(if (holder.locationWorking) "بنحدد موقعك…" else "الأقرب لي")
                    }
                } else {
                    Button(enabled = !holder.locationWorking, onClick = onDisableNearby) { Text("قريب مني · إلغاء") }
                }
                OutlinedButton(onClick = onRefresh) { Text("تحديث") }
            }
            holder.message?.let {
                Spacer(Modifier.height(6.dp))
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }

        item { StoriesEntryCard(onOpenStories) }

        if (people.isNotEmpty()) {
            item {
                Text("ناس تِسوى", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("شوف الشخص قبل ما تشوف عرضه.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(people, key = { it.id }) { person ->
                        PersonPreviewCard(person, onOpenProfile)
                    }
                }
            }
        }

        item { MotionBoundaryCard() }

        item {
            Text("حاجات ممكن تناسبك", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            if (holder.filters.activeCount > 0) {
                Text("${holder.filters.activeCount} فلتر نشط", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
            }
        }

        emptyMessage?.let { message ->
            item {
                Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)) {
                    Text(message, Modifier.fillMaxWidth().padding(22.dp))
                }
            }
        }

        if (items.isEmpty() && hasMore) {
            item {
                Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f)) {
                    Text("لسه مفيش تطابق في أول مجموعة قريبة. كمّل عشان ندور في نطاق أكبر من النتائج.", Modifier.fillMaxWidth().padding(18.dp))
                }
            }
        }

        items(items, key = { it.id }) { item -> DiscoverItemCard(item, onOpenItem) }

        if (hasMore) {
            item {
                Button(
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !loadingMore,
                    onClick = onLoadMore,
                ) {
                    if (loadingMore) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    else Text("هات أكتر")
                }
            }
        }
    }
}

@Composable
private fun ConditionChip(label: String, value: String?, selectedValue: String?, onSelect: (String?) -> Unit) {
    FilterChip(
        selected = selectedValue == value,
        onClick = { onSelect(if (selectedValue == value && value != null) null else value) },
        label = { Text(label) },
    )
}

@Composable
private fun PersonPreviewCard(person: DiscoverPersonPreview, onOpenProfile: (String) -> Unit) {
    Card(onClick = { onOpenProfile(person.id) }, modifier = Modifier.size(width = 210.dp, height = 138.dp)) {
        Row(Modifier.fillMaxSize().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            NetworkImage(
                url = person.avatarUrl,
                contentDescription = person.displayName,
                modifier = Modifier.size(54.dp).clip(CircleShape),
            )
            Spacer(Modifier.size(10.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(person.displayName, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 1)
                Text("@${person.username}", style = MaterialTheme.typography.bodySmall, maxLines = 1)
                val place = listOfNotNull(person.city, person.area).joinToString(" • ")
                if (place.isNotBlank()) Text(place, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                Text("${person.activeItemsCount} عناصر · ${person.successfulSwapsCount} تبديلات", style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun StoriesEntryCard(onOpenStories: () -> Unit) {
    Card(onClick = onOpenStories) {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("حكايات تِسوى", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text(
                    "ادخل على الحكايات النشطة وشوف الناس بتحكي عن حاجاتها قبل التبديل.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedButton(onClick = onOpenStories) { Text("شوف") }
        }
    }
}

@Composable
private fun MotionBoundaryCard() {
    Card {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("نبض تِسوى", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(
                "الحركة الحية في المدينة، القصص النشطة والعناصر اللي عليها اهتمام ليهم مساحة مستقلة هنا بدل ما نزحم التصفح العادي.",
                style = MaterialTheme.typography.bodyMedium,
            )
            Text("هنفصل النبض عن نتائج البحث عشان كل مساحة تفضل واضحة ومفيدة.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun DiscoverItemCard(item: DiscoverItem, onOpenItem: (String) -> Unit) {
    Card(onClick = { onOpenItem(item.id) }) {
        Column {
            NetworkImage(item.imageUrl, item.title, Modifier.fillMaxWidth().height(205.dp))
            Column(Modifier.padding(15.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                val meta = listOfNotNull(item.category, item.condition, item.city).joinToString(" • ")
                if (meta.isNotBlank()) Text(meta, style = MaterialTheme.typography.bodySmall)
                item.description?.let { Text(it, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium) }
                val footer = buildList {
                    item.ownerDisplayName?.let(::add)
                    item.distanceKm?.let { add(String.format(java.util.Locale.US, "%.1f كم", it)) }
                }.joinToString(" · ")
                if (footer.isNotBlank()) Text(footer, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
            }
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
        modifier.fillMaxSize().padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (loading) {
            CircularProgressIndicator()
            Spacer(Modifier.height(14.dp))
        }
        Text(message)
        action?.let {
            Spacer(Modifier.height(14.dp))
            Button(onClick = it.second) { Text(it.first) }
        }
    }
}
