package com.teswa.mobile.feature.additem

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AddItemModelsTest {
    private val validImage = AddItemImage("content://one", "one.jpg", "image/jpeg", 128L)

    @Test
    fun validDraftMatchesOracleBounds() {
        val draft = AddItemDraft(
            images = listOf(validImage),
            title = "كاميرا فيلم",
            categoryId = "22222222-2222-2222-2222-222222222222",
            desireMode = DesireMode.SPECIFIC,
            desireText = "كتاب تصوير",
        )

        assertNull(draft.validate())
    }

    @Test
    fun rejectsUnsupportedMediaAndMissingSpecificDesire() {
        val invalidMedia = AddItemDraft(
            images = listOf(validImage.copy(contentType = "image/gif")),
            title = "كاميرا",
            categoryId = "category",
        )
        val missingDesire = AddItemDraft(
            images = listOf(validImage),
            title = "كاميرا",
            categoryId = "category",
            desireMode = DesireMode.SPECIFIC,
        )

        assertEquals("استخدم صور JPG أو PNG أو WebP.", invalidMedia.validate())
        assertEquals("اكتب الحاجة المحددة اللي بتدور عليها.", missingDesire.validate())
    }
}
