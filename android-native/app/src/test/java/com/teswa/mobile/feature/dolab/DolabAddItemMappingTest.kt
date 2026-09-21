package com.teswa.mobile.feature.dolab

import com.teswa.mobile.feature.additem.AddItemCategory
import com.teswa.mobile.feature.additem.ItemCondition
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DolabAddItemMappingTest {
    @Test
    fun `maps known condition and Arabic category into add item draft`() {
        val item = sampleItem(condition = "almost_new", category = "إلكترونيات")
        val draft = mapDolabToAddItemDraft(
            item = item,
            images = emptyList(),
            categories = listOf(AddItemCategory("electronics", "إلكترونيات")),
        )

        assertEquals("سماعة", draft.title)
        assertEquals("electronics", draft.categoryId)
        assertEquals(ItemCondition.ALMOST_NEW, draft.condition)
        assertEquals("", draft.conditionNotes)
        assertEquals("كتاب أو حاجة موسيقية", draft.desireText)
        assertEquals("", draft.description)
    }

    @Test
    fun `keeps unknown condition as notes and leaves unmatched category for user`() {
        val item = sampleItem(condition = "مستعملة مرتين", category = "فئة قديمة")
        val draft = mapDolabToAddItemDraft(item, emptyList(), emptyList())

        assertEquals(ItemCondition.GOOD_USED, draft.condition)
        assertEquals("مستعملة مرتين", draft.conditionNotes)
        assertNull(draft.categoryId)
    }

    private fun sampleItem(condition: String, category: String) = DolabItem(
        id = "dolab-1",
        title = "سماعة",
        description = "وصف بسيط",
        category = category,
        condition = condition,
        exchangeIntent = "كتاب أو حاجة موسيقية",
        status = DolabItemStatus.READY,
        source = "manual",
        publishedItemId = null,
        createdAt = null,
        updatedAt = null,
    )
}
