package com.teswa.mobile.feature.additem

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession
import kotlinx.coroutines.CancellationException

sealed interface EditListingUiState {
    data object Loading : EditListingUiState
    data class Ready(val status: String, val categories: List<AddItemCategory>) : EditListingUiState
    data class Error(val message: String) : EditListingUiState
}

class EditListingStateHolder(
    private val itemId: String,
    initialSession: AuthSession,
    private val repository: EditListingRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<EditListingUiState>(EditListingUiState.Loading)
        private set
    var draft by mutableStateOf<EditListingDraft?>(null)
        private set
    var saving by mutableStateOf(false)
        private set
    var progress by mutableStateOf<EditListingProgress?>(null)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var messageIsError by mutableStateOf(true)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(value: AuthSession) {
        if (value.user.id == session.user.id && value.accessToken != session.accessToken) session = value
    }

    suspend fun load(preserveSuccess: String? = null) {
        state = EditListingUiState.Loading
        when (val result = repository.load(session, itemId)) {
            is EditListingResult.Success -> {
                session = result.session
                draft = result.value.listing.toDraft()
                state = EditListingUiState.Ready(result.value.listing.status, result.value.categories)
                if (preserveSuccess != null) showSuccess(preserveSuccess)
                else {
                    message = null
                    messageIsError = true
                }
            }
            is EditListingResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                state = EditListingUiState.Error(result.message)
            }
        }
    }

    fun addImages(values: List<AddItemImage>) {
        if (saving) return
        val current = draft ?: return
        val available = AddItemDraft.MAX_IMAGES - current.images.size
        val existingNewUris = current.images.mapNotNullTo(mutableSetOf()) {
            (it as? EditListingImageDraft.New)?.image?.uri
        }
        val unique = values.filter { existingNewUris.add(it.uri) }
        val accepted = unique.take(available)
        draft = current.copy(images = current.images + accepted.map { EditListingImageDraft.New(it) })
        if (unique.size > accepted.size) showError("الحد الأقصى ${AddItemDraft.MAX_IMAGES} صور.")
    }

    fun removeImage(index: Int) {
        if (saving) return
        val current = draft ?: return
        if (index !in current.images.indices) return
        draft = current.copy(images = current.images.toMutableList().apply { removeAt(index) })
        message = null
    }

    fun makePrimary(index: Int) {
        if (saving) return
        val current = draft ?: return
        draft = current.copy(images = moveListingEntry(current.images, index, 0))
    }

    fun moveImage(index: Int, delta: Int) {
        if (saving) return
        val current = draft ?: return
        draft = current.copy(images = moveListingEntry(current.images, index, index + delta))
    }

    fun updateBasics(title: String = draft?.title.orEmpty(), categoryId: String? = draft?.categoryId) {
        if (saving) return
        draft = draft?.copy(title = title.take(160), categoryId = categoryId)
    }

    fun updateDetails(
        condition: ItemCondition = draft?.condition ?: ItemCondition.GOOD_USED,
        conditionNotes: String = draft?.conditionNotes.orEmpty(),
        description: String = draft?.description.orEmpty(),
        city: String = draft?.city.orEmpty(),
        area: String = draft?.area.orEmpty(),
    ) {
        if (saving) return
        draft = draft?.copy(
            condition = condition,
            conditionNotes = conditionNotes.take(1_000),
            description = description.take(4_000),
            city = city.take(120),
            area = area.take(120),
        )
    }

    fun updateExchange(
        desireMode: DesireMode = draft?.desireMode ?: DesireMode.FLEXIBLE,
        desireText: String = draft?.desireText.orEmpty(),
        itemStory: String = draft?.itemStory.orEmpty(),
        swapReason: String = draft?.swapReason.orEmpty(),
        goodFor: String = draft?.goodFor.orEmpty(),
    ) {
        if (saving) return
        draft = draft?.copy(
            desireMode = desireMode,
            desireText = desireText.take(1_000),
            itemStory = itemStory.take(600),
            swapReason = swapReason.take(240),
            goodFor = goodFor.take(240),
        )
    }

    suspend fun save() {
        val value = draft ?: return
        value.validate()?.let {
            showError(it)
            return
        }
        if (saving) return
        saving = true
        progress = EditListingProgress.Saving
        message = null
        messageIsError = true
        try {
            when (val result = repository.save(session, itemId, value) { progress = it }) {
                is EditListingResult.Success -> {
                    session = result.session
                    val success = if (result.storageCleanupWarning) {
                        "التعديلات اتحفظت. في ملف قديم محتاج تنظيف تلقائي لاحقًا، لكن الإعلان نفسه سليم."
                    } else {
                        "التعديلات اتحفظت على نفس العنصر."
                    }
                    saving = false
                    progress = null
                    load(success)
                    return
                }
                is EditListingResult.Failure -> {
                    result.session?.let { session = it }
                    sessionExpired = result.unauthorized
                    val text = if (result.coreWasSaved) {
                        "${result.message} البيانات الأساسية اتحدثت بالفعل."
                    } else result.message
                    showError(text)
                }
            }
        } catch (_: CancellationException) {
            showError("تم إيقاف الحفظ. أعد فتح العنصر قبل إعادة المحاولة عشان نقرأ آخر حالة مؤكدة.")
        } finally {
            saving = false
            progress = null
        }
    }

    fun showError(value: String) {
        message = value
        messageIsError = true
    }

    private fun showSuccess(value: String) {
        message = value
        messageIsError = false
    }
}
