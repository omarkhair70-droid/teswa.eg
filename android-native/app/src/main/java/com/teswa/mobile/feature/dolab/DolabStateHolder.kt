package com.teswa.mobile.feature.dolab

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

class DolabStateHolder(
    initialSession: AuthSession,
    private val repository: DolabRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<DolabUiState>(DolabUiState.Loading)
        private set
    var filter by mutableStateOf(DolabFilter.ALL)
        private set
    var refreshing by mutableStateOf(false)
        private set
    var workingId by mutableStateOf<String?>(null)
        private set
    var creating by mutableStateOf(false)
        private set
    var mediaUploadProgress by mutableStateOf<DolabMediaUploadProgress?>(null)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var messageIsError by mutableStateOf(false)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    private val signedUrls = mutableMapOf<String, String>()

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    fun selectFilter(value: DolabFilter) {
        filter = value
    }

    fun clearMessage() {
        message = null
        messageIsError = false
    }

    fun workspace(): DolabWorkspace? = when (val current = state) {
        is DolabUiState.Ready -> current.workspace
        is DolabUiState.Empty -> current.workspace
        else -> null
    }

    fun visibleItems(): List<DolabItem> = workspace()?.items.orEmpty().filter { item ->
        when (filter) {
            DolabFilter.ALL -> true
            DolabFilter.IN_PROGRESS -> item.status == DolabItemStatus.DRAFT
            DolabFilter.READY -> item.status == DolabItemStatus.READY
            DolabFilter.PUBLISHED -> item.status == DolabItemStatus.PUBLISHED || item.status == DolabItemStatus.EXCHANGED
            DolabFilter.ARCHIVED -> item.status == DolabItemStatus.ARCHIVED
        }
    }

    suspend fun load(refresh: Boolean = false) {
        sessionExpired = false
        clearMessage()
        if (refresh) refreshing = true else state = DolabUiState.Loading
        when (val result = repository.loadWorkspace(session)) {
            is DolabResult.Success -> {
                session = result.session
                signedUrls.clear()
                state = result.value.asUiState()
            }
            is DolabResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (refresh && workspace() != null && !result.unauthorized) show(result.message, error = true)
                else state = DolabUiState.Error(result.message)
            }
        }
        refreshing = false
    }

    suspend fun create(draft: DolabItemDraft): Boolean {
        if (creating) return false
        creating = true
        clearMessage()
        val result = repository.createItem(session, draft)
        creating = false
        return when (result) {
            is DolabResult.Success -> {
                session = result.session
                val current = workspace() ?: DolabWorkspace(emptyList(), emptyList(), emptyList())
                state = current.copy(items = listOf(result.value) + current.items.filterNot { it.id == result.value.id }).asUiState()
                show("اتحفظت في دولابك.")
                true
            }
            is DolabResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                show(result.message, error = true)
                false
            }
        }
    }

    suspend fun save(item: DolabItem, draft: DolabItemDraft): Boolean {
        if (workingId != null) return false
        workingId = item.id
        clearMessage()
        val result = repository.updateItem(session, item, draft)
        workingId = null
        return when (result) {
            is DolabResult.Success -> {
                session = result.session
                replaceItem(result.value)
                show("اتحفظت التعديلات.")
                true
            }
            is DolabResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                show(result.message, error = true)
                false
            }
        }
    }

    suspend fun setReady(item: DolabItem, ready: Boolean): Boolean = save(
        item,
        item.toDraft().copy(status = if (ready) DolabItemStatus.READY else DolabItemStatus.DRAFT),
    )

    suspend fun delete(item: DolabItem): Boolean {
        if (workingId != null) return false
        workingId = item.id
        clearMessage()
        val result = repository.deleteItem(session, item.id)
        workingId = null
        return when (result) {
            is DolabResult.Success -> {
                session = result.session
                val current = workspace() ?: return true
                current.media.filter { it.dolabItemId == item.id }.forEach { signedUrls.remove(it.id) }
                state = current.copy(
                    items = current.items.filterNot { it.id == item.id },
                    media = current.media.filterNot { it.dolabItemId == item.id },
                    notes = current.notes.filterNot { it.dolabItemId == item.id },
                ).asUiState()
                show("اتشالت من دولابك.")
                true
            }
            is DolabResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                show(result.message, error = true)
                false
            }
        }
    }

    suspend fun addNote(itemId: String, body: String): Boolean {
        if (workingId != null) return false
        workingId = itemId
        clearMessage()
        val result = repository.createNote(session, itemId, body)
        workingId = null
        return when (result) {
            is DolabResult.Success -> {
                session = result.session
                val current = workspace() ?: return true
                state = current.copy(notes = listOf(result.value) + current.notes.filterNot { it.id == result.value.id }).asUiState()
                show("اتضافت للمساحة دي.")
                true
            }
            is DolabResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                show(result.message, error = true)
                false
            }
        }
    }

    suspend fun deleteNote(note: DolabNote): Boolean {
        if (workingId != null) return false
        workingId = note.dolabItemId ?: note.id
        clearMessage()
        val result = repository.deleteNote(session, note.id)
        workingId = null
        return when (result) {
            is DolabResult.Success -> {
                session = result.session
                val current = workspace() ?: return true
                state = current.copy(notes = current.notes.filterNot { it.id == note.id }).asUiState()
                true
            }
            is DolabResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                show(result.message, error = true)
                false
            }
        }
    }

    suspend fun addMedia(item: DolabItem, pending: DolabPendingMedia): Boolean {
        if (workingId != null) return false
        pending.validate()?.let { show(it, error = true); return false }
        workingId = item.id
        mediaUploadProgress = DolabMediaUploadProgress(item.id, 0)
        clearMessage()
        val sortOrder = workspace()?.mediaFor(item.id)?.size ?: 0
        val result = repository.uploadMedia(session, item.id, pending, sortOrder) { percent ->
            mediaUploadProgress = DolabMediaUploadProgress(item.id, percent)
        }
        workingId = null
        mediaUploadProgress = null
        return when (result) {
            is DolabResult.Success -> {
                session = result.session
                val current = workspace() ?: return true
                state = current.copy(
                    media = current.media.filterNot { it.id == result.value.id } + result.value,
                ).asUiState()
                show("الميديا اتحفظت مع الحاجة.")
                true
            }
            is DolabResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                show(result.message, error = true)
                false
            }
        }
    }

    suspend fun deleteMedia(media: DolabMedia): Boolean {
        if (workingId != null) return false
        workingId = media.dolabItemId ?: media.id
        clearMessage()
        val result = repository.deleteMedia(session, media)
        workingId = null
        return when (result) {
            is DolabResult.Success -> {
                session = result.session
                signedUrls.remove(media.id)
                val current = workspace() ?: return true
                state = current.copy(media = current.media.filterNot { it.id == media.id }).asUiState()
                show("الميديا اتشالت.")
                true
            }
            is DolabResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (result.message.startsWith("اتحذف سجل الميديا")) {
                    signedUrls.remove(media.id)
                    val current = workspace()
                    if (current != null) state = current.copy(media = current.media.filterNot { it.id == media.id }).asUiState()
                }
                show(result.message, error = true)
                false
            }
        }
    }

    suspend fun mediaUrl(media: DolabMedia): String? {
        signedUrls[media.id]?.let { return it }
        return when (val result = repository.signedMediaUrl(session, media)) {
            is DolabResult.Success -> {
                session = result.session
                signedUrls[media.id] = result.value
                result.value
            }
            is DolabResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                null
            }
        }
    }

    fun showError(value: String) {
        show(value, error = true)
    }

    private fun replaceItem(item: DolabItem) {
        val current = workspace() ?: return
        state = current.copy(items = current.items.map { if (it.id == item.id) item else it }).asUiState()
    }

    private fun show(value: String, error: Boolean = false) {
        message = value
        messageIsError = error
    }

    private fun DolabWorkspace.asUiState(): DolabUiState =
        if (items.isEmpty() && media.isEmpty() && notes.isEmpty()) DolabUiState.Empty(this) else DolabUiState.Ready(this)
}

fun DolabItem.toDraft(): DolabItemDraft = DolabItemDraft(
    title = title.orEmpty(),
    description = description.orEmpty(),
    category = category.orEmpty(),
    condition = condition.orEmpty(),
    exchangeIntent = exchangeIntent.orEmpty(),
    status = if (status.editable) status else DolabItemStatus.DRAFT,
    source = source,
)
