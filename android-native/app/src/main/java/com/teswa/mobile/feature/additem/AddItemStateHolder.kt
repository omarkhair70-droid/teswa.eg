package com.teswa.mobile.feature.additem

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession
import kotlinx.coroutines.CancellationException
import com.teswa.mobile.home.CurrentLocationProvider
import com.teswa.mobile.home.CurrentLocationResult

enum class AddItemStep { BASICS, DETAILS, EXCHANGE }

sealed interface AddItemCategoriesState {
    data object Loading : AddItemCategoriesState
    data class Ready(val values: List<AddItemCategory>) : AddItemCategoriesState
    data class Error(val message: String) : AddItemCategoriesState
}

sealed interface AddItemSubmissionState {
    data object Idle : AddItemSubmissionState
    data class Working(val progress: AddItemPublishProgress) : AddItemSubmissionState
    data class Success(val item: PublishedItem) : AddItemSubmissionState
}

class AddItemStateHolder(
    initialSession: AuthSession,
    private val repository: AddItemRepository,
    initialDraft: AddItemDraft = AddItemDraft(),
) {
    var session by mutableStateOf(initialSession)
        private set
    var draft by mutableStateOf(initialDraft)
        private set
    var step by mutableStateOf(AddItemStep.BASICS)
        private set
    var categoriesState by mutableStateOf<AddItemCategoriesState>(AddItemCategoriesState.Loading)
        private set
    var submissionState by mutableStateOf<AddItemSubmissionState>(AddItemSubmissionState.Idle)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set
    var locationWorking by mutableStateOf(false)
        private set

    val isPublishing: Boolean get() = submissionState is AddItemSubmissionState.Working

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun loadCategories() {
        categoriesState = AddItemCategoriesState.Loading
        when (val result = repository.loadCategories(session)) {
            is AddItemResult.Success -> {
                session = result.session
                categoriesState = if (result.value.isEmpty()) {
                    AddItemCategoriesState.Error("مفيش فئات متاحة للنشر دلوقتي.")
                } else {
                    AddItemCategoriesState.Ready(result.value)
                }
            }
            is AddItemResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                categoriesState = AddItemCategoriesState.Error(result.message)
            }
        }
    }

    fun addImages(images: List<AddItemImage>) {
        if (isPublishing) return
        val availableSlots = AddItemDraft.MAX_IMAGES - draft.images.size
        val existingUris = draft.images.mapTo(mutableSetOf()) { it.uri }
        val unique = images.filter { existingUris.add(it.uri) }
        val additions = unique.take(availableSlots)
        draft = draft.copy(images = draft.images + additions)
        message = if (unique.size > additions.size) "الحد الأقصى ${AddItemDraft.MAX_IMAGES} صور." else null
    }

    fun removeImage(uri: String) {
        if (!isPublishing) draft = draft.copy(images = draft.images.filterNot { it.uri == uri })
    }

    fun updateBasics(title: String = draft.title, categoryId: String? = draft.categoryId) {
        if (!isPublishing) draft = draft.copy(title = title, categoryId = categoryId)
    }

    fun updateDetails(
        condition: ItemCondition = draft.condition,
        conditionNotes: String = draft.conditionNotes,
        description: String = draft.description,
        city: String = draft.city,
        area: String = draft.area,
    ) {
        if (!isPublishing) {
            val locationChanged = city != draft.city || area != draft.area
            draft = draft.copy(
                condition = condition,
                conditionNotes = conditionNotes,
                description = description,
                city = city,
                area = area,
                locationLatitude = if (locationChanged) null else draft.locationLatitude,
                locationLongitude = if (locationChanged) null else draft.locationLongitude,
            )
        }
    }

    suspend fun useCurrentLocation(provider: CurrentLocationProvider) {
        if (isPublishing || locationWorking) return
        locationWorking = true
        message = null
        when (val result = provider.current()) {
            is CurrentLocationResult.Success -> {
                draft = draft.copy(
                    locationLatitude = result.location.latitude,
                    locationLongitude = result.location.longitude,
                )
                message = "تم حفظ موقع تقريبي للعنصر. اكتب المدينة والمنطقة لو محتاج توضيح أكتر."
            }
            is CurrentLocationResult.Failure -> message = when (result.reason) {
                CurrentLocationResult.Reason.PERMISSION_DENIED -> "إذن الموقع غير مفعّل. تقدر تكتب المدينة يدويًا."
                CurrentLocationResult.Reason.SERVICES_DISABLED -> "شغّل خدمة الموقع أو اكتب المدينة يدويًا."
                CurrentLocationResult.Reason.UNAVAILABLE -> "تعذر تحديد الموقع الآن. تقدر تكتب المدينة يدويًا."
            }
        }
        locationWorking = false
    }

    fun clearLocation() {
        if (!isPublishing) draft = draft.copy(locationLatitude = null, locationLongitude = null)
    }

    fun updateExchange(
        desireMode: DesireMode = draft.desireMode,
        desireText: String = draft.desireText,
        itemStory: String = draft.itemStory,
        swapReason: String = draft.swapReason,
        goodFor: String = draft.goodFor,
    ) {
        if (!isPublishing) draft = draft.copy(
            desireMode = desireMode,
            desireText = desireText,
            itemStory = itemStory,
            swapReason = swapReason,
            goodFor = goodFor,
        )
    }

    fun next() {
        message = when (step) {
            AddItemStep.BASICS -> basicsError()
            AddItemStep.DETAILS -> null
            AddItemStep.EXCHANGE -> null
        }
        if (message == null) {
            step = when (step) {
                AddItemStep.BASICS -> AddItemStep.DETAILS
                AddItemStep.DETAILS -> AddItemStep.EXCHANGE
                AddItemStep.EXCHANGE -> AddItemStep.EXCHANGE
            }
        }
    }

    fun previous() {
        if (isPublishing) return
        message = null
        step = when (step) {
            AddItemStep.BASICS -> AddItemStep.BASICS
            AddItemStep.DETAILS -> AddItemStep.BASICS
            AddItemStep.EXCHANGE -> AddItemStep.DETAILS
        }
    }

    suspend fun publish() {
        val validation = draft.validate()
        if (validation != null) {
            message = validation
            return
        }
        message = null
        sessionExpired = false
        submissionState = AddItemSubmissionState.Working(AddItemPublishProgress.Uploading(1, draft.images.size, 0))
        try {
            when (val result = repository.publish(session, draft) { progress ->
                submissionState = AddItemSubmissionState.Working(progress)
            }) {
                is AddItemResult.Success -> {
                    session = result.session
                    submissionState = AddItemSubmissionState.Success(result.value)
                }
                is AddItemResult.Failure -> {
                    result.session?.let { session = it }
                    sessionExpired = result.unauthorized
                    submissionState = AddItemSubmissionState.Idle
                    message = result.message
                }
            }
        } catch (_: CancellationException) {
            submissionState = AddItemSubmissionState.Idle
            message = "تم إيقاف النشر. المسودة محفوظة وتقدر تحاول تاني."
        }
    }

    fun reset() {
        if (isPublishing) return
        draft = AddItemDraft()
        step = AddItemStep.BASICS
        submissionState = AddItemSubmissionState.Idle
        message = null
    }

    fun showMessage(value: String) {
        message = value
    }

    private fun basicsError(): String? = when {
        draft.images.isEmpty() -> "اختار صورة واحدة على الأقل."
        draft.title.isBlank() -> "اكتب اسم واضح للعنصر."
        draft.categoryId.isNullOrBlank() -> "اختار الفئة المناسبة."
        else -> null
    }
}
