package com.teswa.mobile.feature.dolab

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

class DolabVoicePersistenceTest {
    private val session = AuthSession(
        accessToken = "access",
        refreshToken = "refresh",
        expiresAtEpochSeconds = Long.MAX_VALUE,
        user = AuthUser(
            id = "11111111-1111-4111-8111-111111111111",
            email = null,
            phone = null,
            displayName = "Tester",
            avatarUrl = null,
        ),
    )

    private val item = DolabItem(
        id = "33333333-3333-4333-8333-333333333333",
        title = "كاميرا",
        description = null,
        category = null,
        condition = null,
        exchangeIntent = null,
        status = DolabItemStatus.DRAFT,
        source = "manual",
        publishedItemId = null,
        createdAt = null,
        updatedAt = null,
    )

    private val pending = DolabPendingMedia(
        uri = "file:///voice.m4a",
        displayName = "voice.m4a",
        mediaType = "audio",
        mimeType = "audio/mp4",
        sizeBytes = 4,
        durationMs = 1_500,
        openStream = { ByteArrayInputStream(byteArrayOf(1, 2, 3, 4)) },
    )

    @Test
    fun voiceTracePersistsMediaAndLinkedNoteTogether() = runBlocking {
        val repository = FakeRepository(session)
        val holder = DolabStateHolder(session, repository)

        val saved = holder.addVoiceTrace(item, pending)

        assertTrue(saved)
        assertEquals(item.id, repository.uploadedItemId)
        assertEquals(item.id, repository.notedItemId)
        assertEquals(repository.uploadedMedia.id, repository.notedMediaId)
        assertEquals("voice", repository.notedType)
        assertNull(holder.workingId)
        assertNull(holder.mediaUploadProgress)

        val workspace = holder.workspace()
        assertNotNull(workspace)
        assertTrue(workspace!!.media.any { it.id == repository.uploadedMedia.id })
        assertTrue(workspace.notes.any { it.mediaId == repository.uploadedMedia.id && it.noteType == "voice" })
    }

    @Test
    fun noteFailureRollsBackUploadedVoice() = runBlocking {
        val repository = FakeRepository(session, failNote = true)
        val holder = DolabStateHolder(session, repository)

        val saved = holder.addVoiceTrace(item, pending)

        assertFalse(saved)
        assertTrue(repository.rollbackCalled)
        assertNull(holder.workingId)
        assertNull(holder.mediaUploadProgress)
        assertTrue(holder.messageIsError)
    }

    private class FakeRepository(
        private val activeSession: AuthSession,
        private val failNote: Boolean = false,
    ) : DolabRepository {
        val uploadedMedia = DolabMedia(
            id = "44444444-4444-4444-8444-444444444444",
            dolabItemId = "33333333-3333-4333-8333-333333333333",
            mediaType = "audio",
            storagePath = activeSession.user.id + "/voice.m4a",
            thumbnailPath = null,
            durationMs = 1_500,
            width = null,
            height = null,
            mimeType = "audio/mp4",
            sizeBytes = 4,
            sortOrder = 0,
            createdAt = null,
        )

        var uploadedItemId: String? = null
        var notedItemId: String? = null
        var notedMediaId: String? = null
        var notedType: String? = null
        var rollbackCalled = false

        override suspend fun loadWorkspace(session: AuthSession) =
            DolabResult.Success(DolabWorkspace(emptyList(), emptyList(), emptyList()), activeSession)

        override suspend fun createItem(session: AuthSession, draft: DolabItemDraft) =
            DolabResult.Failure("unused", activeSession)

        override suspend fun updateItem(session: AuthSession, item: DolabItem, draft: DolabItemDraft) =
            DolabResult.Failure("unused", activeSession)

        override suspend fun deleteItem(session: AuthSession, itemId: String) =
            DolabResult.Failure("unused", activeSession)

        override suspend fun createNote(
            session: AuthSession,
            itemId: String?,
            body: String,
            noteType: String,
            mediaId: String?,
        ): DolabResult<DolabNote> {
            notedItemId = itemId
            notedMediaId = mediaId
            notedType = noteType
            if (failNote) return DolabResult.Failure("note failed", activeSession)
            return DolabResult.Success(
                DolabNote(
                    id = "55555555-5555-4555-8555-555555555555",
                    body = body,
                    noteType = noteType,
                    dolabItemId = itemId,
                    mediaId = mediaId,
                    sharedToConversationId = null,
                    createdAt = null,
                ),
                activeSession,
            )
        }

        override suspend fun deleteNote(session: AuthSession, noteId: String) =
            DolabResult.Success(Unit, activeSession)

        override suspend fun uploadMedia(
            session: AuthSession,
            itemId: String?,
            media: DolabPendingMedia,
            sortOrder: Int,
            onProgress: (Int) -> Unit,
        ): DolabResult<DolabMedia> {
            uploadedItemId = itemId
            onProgress(100)
            return DolabResult.Success(uploadedMedia.copy(dolabItemId = itemId), activeSession)
        }

        override suspend fun deleteMedia(session: AuthSession, media: DolabMedia): DolabResult<Unit> {
            rollbackCalled = true
            return DolabResult.Success(Unit, activeSession)
        }
    }
}
