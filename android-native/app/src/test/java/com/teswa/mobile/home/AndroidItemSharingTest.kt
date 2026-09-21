package com.teswa.mobile.home

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidItemSharingTest {
    @Test
    fun canonicalUrlUsesPublicHttpsRoute() {
        assertEquals(
            "https://teswa.eg/item/84af21bb-6ad7-4a93-b8d2-32197688f730",
            canonicalItemUrl("84af21bb-6ad7-4a93-b8d2-32197688f730"),
        )
    }

    @Test
    fun captionContainsPublicContextAndNeverPrivateNotes() {
        val item = sampleItem(
            desireText = "كتاب عربي أو مفاجأة مفيدة",
            conditionNotes = "ملاحظة خاصة لا تخرج في المشاركة",
        )

        val caption = itemShareCaption(item)

        assertTrue(caption.contains("كاميرا فيلم على تِسوى"))
        assertTrue(caption.contains("مفتوحة للتبديل: كتاب عربي أو مفاجأة مفيدة"))
        assertTrue(caption.endsWith("https://teswa.eg/item/item-123"))
        assertFalse(caption.contains("ملاحظة خاصة"))
    }

    private fun sampleItem(
        desireText: String?,
        conditionNotes: String?,
    ) = ItemDetail(
        id = "item-123",
        ownerId = "owner-1",
        title = "كاميرا فيلم",
        description = "public description",
        condition = "حالة جيدة",
        conditionNotes = conditionNotes,
        category = "كاميرات",
        city = "القاهرة",
        area = "المعادي",
        images = emptyList(),
        ownerDisplayName = "سارة",
        ownerUsername = "sara",
        desireText = desireText,
        itemStory = null,
        swapReason = null,
        goodFor = null,
    )
}
