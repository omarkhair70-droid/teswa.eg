package com.teswa.mobile.feature.dolab

import com.teswa.mobile.feature.additem.AddItemCategory
import com.teswa.mobile.feature.additem.AddItemDraft
import com.teswa.mobile.feature.additem.AddItemImage
import com.teswa.mobile.feature.additem.ItemCondition

fun mapDolabToAddItemDraft(
    item: DolabItem,
    images: List<AddItemImage>,
    categories: List<AddItemCategory>,
): AddItemDraft {
    val rawCondition = item.condition.orEmpty().trim()
    val normalizedCondition = rawCondition.lowercase()
    val mappedCondition = ItemCondition.entries.firstOrNull { it.apiValue == normalizedCondition }
        ?: ItemCondition.GOOD_USED
    val categoryValue = item.category.orEmpty().trim()
    val matchedCategory = categories.firstOrNull { category ->
        category.id == categoryValue || category.nameAr.trim() == categoryValue
    }
    return AddItemDraft(
        images = images.take(AddItemDraft.MAX_IMAGES),
        title = item.title.orEmpty().take(160),
        categoryId = matchedCategory?.id,
        condition = mappedCondition,
        conditionNotes = if (ItemCondition.entries.any { it.apiValue == normalizedCondition }) "" else rawCondition.take(1_000),
        description = item.description.orEmpty().take(4_000),
        desireText = item.exchangeIntent.orEmpty().take(1_000),
    )
}
