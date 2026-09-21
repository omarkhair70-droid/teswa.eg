package com.teswa.mobile.feature.dolab

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DolabDirectMessagingBridgeTest {
    @Test
    fun `builds compact shareables from active items and notes`() {
        val workspace = DolabWorkspace(
            items = listOf(
                item(
                    id = "item-1",
                    title = "كاميرا فيلم",
                    description = "شغالة كويس",
                    exchangeIntent = "كتاب تصوير",
                    status = DolabItemStatus.READY,
                ),
                item(
                    id = "archived",
                    title = "قديم",
                    description = "ما يظهرش",
                    exchangeIntent = null,
                    status = DolabItemStatus.ARCHIVED,
                ),
                item(
                    id = "legacy-note",
                    title = "رسالة منك لحد",
                    description = "أثر قديم",
                    exchangeIntent = null,
                    status = DolabItemStatus.DRAFT,
                    source = "note",
                ),
            ),
            media = emptyList(),
            notes = listOf(
                DolabNote(
                    id = "note-1",
                    body = "ممكن أضيف معاها الجراب.",
                    noteType = "text",
                    dolabItemId = "item-1",
                    mediaId = null,
                    sharedToConversationId = null,
                    createdAt = null,
                ),
            ),
        )

        val result = buildDolabDirectShareables(workspace)

        assertEquals(2, result.size)
        assertEquals("item:item-1", result.first().id)
        assertTrue(result.first().text.contains("نفسي أبدّلها بـ: كتاب تصوير"))
        assertEquals("ملاحظة — كاميرا فيلم", result.last().title)
        assertFalse(result.any { it.text.contains("ما يظهرش") })
        assertFalse(result.any { it.text.contains("أثر قديم") })
    }

    @Test
    fun `deduplicates identical text and caps direct picker`() {
        val items = (1..14).map { index ->
            item(
                id = "item-$index",
                title = "حاجة $index",
                description = "وصف $index",
                exchangeIntent = null,
                status = DolabItemStatus.DRAFT,
            )
        }
        val notes = listOf(
            DolabNote(
                id = "duplicate",
                body = "حاجة 1\nوصف 1",
                noteType = "text",
                dolabItemId = null,
                mediaId = null,
                sharedToConversationId = null,
                createdAt = null,
            ),
        ) + (1..8).map { index ->
            DolabNote(
                id = "note-$index",
                body = "ملاحظة $index",
                noteType = "text",
                dolabItemId = null,
                mediaId = null,
                sharedToConversationId = null,
                createdAt = null,
            )
        }

        val result = buildDolabDirectShareables(DolabWorkspace(items, emptyList(), notes))

        assertEquals(12, result.size)
        assertEquals(result.map { it.text }.distinct().size, result.size)
    }

    private fun item(
        id: String,
        title: String,
        description: String,
        exchangeIntent: String?,
        status: DolabItemStatus,
        source: String = "manual",
    ) = DolabItem(
        id = id,
        title = title,
        description = description,
        category = null,
        condition = null,
        exchangeIntent = exchangeIntent,
        status = status,
        source = source,
        publishedItemId = null,
        createdAt = null,
        updatedAt = null,
    )
}
