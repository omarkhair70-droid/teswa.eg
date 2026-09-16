package com.teswa.mobile.feature.additem

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EditListingModelsTest {
    @Test
    fun `editable listing becomes draft with primary image first`() {
        val listing = EditableListing(
            id = "item-1",
            status = "active",
            title = "كاميرا فيلم",
            categoryId = "cameras",
            city = "بني سويف",
            area = "شرق النيل",
            condition = ItemCondition.GOOD_USED,
            conditionNotes = "خدش بسيط",
            description = "شغالة كويس",
            itemStory = "معايا من زمان",
            swapReason = "مش بستخدمها",
            goodFor = "مبتدئ تصوير",
            desireMode = DesireMode.FLEXIBLE,
            desireText = "مفتوح لاقتراحات",
            wantedTags = listOf("تصوير", "كتب"),
            images = listOf(
                EditableListingImage("second", "https://example.com/2.jpg", false, 1),
                EditableListingImage("cover", "https://example.com/1.jpg", true, 5),
                EditableListingImage("third", "https://example.com/3.jpg", false, 2),
            ),
        )

        val draft = listing.toDraft()

        assertEquals("cover", (draft.images.first() as EditListingImageDraft.Existing).image.id)
        assertEquals(listOf("second", "third"), draft.images.drop(1).map {
            (it as EditListingImageDraft.Existing).image.id
        })
        assertEquals("كاميرا فيلم", draft.title)
        assertEquals(listOf("تصوير", "كتب"), draft.wantedTags)
        assertNull(draft.validate())
    }

    @Test
    fun `move helper preserves values and moves requested entry`() {
        val values = listOf("a", "b", "c", "d")

        assertEquals(listOf("a", "c", "d", "b"), moveListingEntry(values, 1, 3))
        assertEquals(values, moveListingEntry(values, -1, 1))
        assertEquals(values, moveListingEntry(values, 1, 9))
    }

    @Test
    fun `draft validation rejects removing every image`() {
        val draft = validDraft().copy(images = emptyList())

        assertEquals("لازم تحتفظ بصورة واحدة على الأقل.", draft.validate())
    }

    @Test
    fun `specific desire requires text`() {
        val draft = validDraft().copy(desireMode = DesireMode.SPECIFIC, desireText = "")

        assertTrue(draft.validate()?.contains("الحاجة المحددة") == true)
    }

    private fun validDraft() = EditListingDraft(
        images = listOf(
            EditListingImageDraft.Existing(
                EditableListingImage("image-1", "https://example.com/1.jpg", true, 0),
            ),
        ),
        title = "عنصر",
        categoryId = "category-1",
        city = "بني سويف",
        area = "",
        condition = ItemCondition.GOOD_USED,
        conditionNotes = "",
        description = "",
        itemStory = "",
        swapReason = "",
        goodFor = "",
        desireMode = DesireMode.FLEXIBLE,
        desireText = "",
        wantedTags = emptyList(),
    )
}
