package com.teswa.mobile.feature.additem

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.media.BinaryUploadRequest
import com.teswa.mobile.core.media.BinaryUploadResult
import com.teswa.mobile.core.media.BinaryUploader
import com.teswa.mobile.core.media.StreamingBinaryUploader
import com.teswa.mobile.core.network.AuthenticatedOracleExecutor
import com.teswa.mobile.core.network.AuthenticatedOracleResult
import com.teswa.mobile.core.network.HttpUrlConnectionOracleTransport
import com.teswa.mobile.core.network.OracleHttpMethod
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleTransport
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.InputStream
import java.util.UUID

interface EditListingRepository {
    suspend fun load(session: AuthSession, itemId: String): EditListingResult<EditListingBundle>

    suspend fun save(
        session: AuthSession,
        itemId: String,
        draft: EditListingDraft,
        onProgress: (EditListingProgress) -> Unit,
    ): EditListingResult<Unit>
}

class OracleEditListingRepository(
    authenticator: SessionAuthenticator,
    private val contentSource: AddItemContentSource,
    private val transport: OracleTransport = HttpUrlConnectionOracleTransport(),
    private val binaryUploader: BinaryUploader = StreamingBinaryUploader(),
) : EditListingRepository {
    private val executor = AuthenticatedOracleExecutor(authenticator, transport)

    override suspend fun load(session: AuthSession, itemId: String): EditListingResult<EditListingBundle> {
        val id = itemId.trim()
        if (id.isEmpty()) return EditListingResult.Failure("معرّف العنصر غير صالح.", session)
        var activeSession = session

        val core = when (val result = loadCore(activeSession, id)) {
            is EditListingResult.Success -> {
                activeSession = result.session
                result.value
            }
            is EditListingResult.Failure -> return result
        }
        val images = when (val result = loadImages(activeSession, id)) {
            is EditListingResult.Success -> {
                activeSession = result.session
                result.value
            }
            is EditListingResult.Failure -> return result
        }
        val categories = when (val result = loadCategories(activeSession)) {
            is EditListingResult.Success -> {
                activeSession = result.session
                result.value
            }
            is EditListingResult.Failure -> return result
        }

        return EditListingResult.Success(
            EditListingBundle(core.copy(images = images), categories),
            activeSession,
        )
    }

    override suspend fun save(
        session: AuthSession,
        itemId: String,
        draft: EditListingDraft,
        onProgress: (EditListingProgress) -> Unit,
    ): EditListingResult<Unit> {
        draft.validate()?.let { return EditListingResult.Failure(it, session) }
        val id = itemId.trim()
        if (id.isEmpty()) return EditListingResult.Failure("معرّف العنصر غير صالح.", session)

        var activeSession = session
        when (val core = saveCore(activeSession, id, draft)) {
            is EditListingResult.Success -> activeSession = core.session
            is EditListingResult.Failure -> return core
        }

        val uploadedObjects = mutableListOf<MediaObject>()
        val orderedRows = JSONArray()
        val newCount = draft.images.count { it is EditListingImageDraft.New }
        var uploadedIndex = 0

        try {
            draft.images.forEach { row ->
                when (row) {
                    is EditListingImageDraft.Existing -> {
                        orderedRows.put(
                            JSONObject()
                                .put("kind", "existing")
                                .put("imageId", row.image.id)
                                .put("imageUrl", row.image.imageUrl),
                        )
                    }
                    is EditListingImageDraft.New -> {
                        uploadedIndex += 1
                        val image = row.image
                        val media = MediaObject(
                            purpose = "item_image",
                            objectKey = "items/${session.user.id}/$id/${UUID.randomUUID()}-${safeFileName(image.displayName)}",
                            contentType = image.contentType,
                            sizeBytes = image.sizeBytes,
                        )
                        val grant = requestUploadGrant(activeSession, media)
                        if (grant is EditListingResult.Failure) {
                            val cleanup = cleanup(activeSession, uploadedObjects)
                            return grant.copy(
                                session = cleanup.session,
                                coreWasSaved = true,
                                message = "اتحفظت بيانات العنصر، لكن تعذر تجهيز الصور الجديدة. حاول حفظ الصور تاني.",
                            )
                        }
                        grant as EditListingResult.Success
                        activeSession = grant.session
                        uploadedObjects += media

                        when (
                            val upload = binaryUploader.upload(
                                BinaryUploadRequest(
                                    uploadUrl = grant.value,
                                    contentType = image.contentType,
                                    sizeBytes = image.sizeBytes,
                                    openStream = { contentSource.open(image) },
                                    onProgress = { sent, total ->
                                        val percent = if (total <= 0L) 0 else ((sent * 100L) / total).toInt().coerceIn(0, 100)
                                        onProgress(EditListingProgress.Uploading(uploadedIndex, newCount, percent))
                                    },
                                ),
                            )
                        ) {
                            is BinaryUploadResult.Success -> Unit
                            is BinaryUploadResult.Failure -> {
                                val cleanup = cleanup(activeSession, uploadedObjects)
                                return EditListingResult.Failure(
                                    message = "اتحفظت بيانات العنصر، لكن رفع صورة جديدة فشل. الصور القديمة لسه سليمة.",
                                    session = cleanup.session,
                                    network = upload.retryable,
                                    coreWasSaved = true,
                                )
                            }
                        }

                        val completed = completeUpload(activeSession, media)
                        if (completed is EditListingResult.Failure) {
                            val cleanup = cleanup(completed.session ?: activeSession, uploadedObjects)
                            return completed.copy(
                                message = "اتحفظت بيانات العنصر، لكن تعذر تثبيت صورة جديدة. الصور القديمة لسه سليمة.",
                                session = cleanup.session,
                                coreWasSaved = true,
                            )
                        }
                        completed as EditListingResult.Success
                        activeSession = completed.session
                        orderedRows.put(JSONObject().put("kind", "new").put("imageUrl", completed.value))
                    }
                }
            }

            onProgress(EditListingProgress.Saving)
            val plan = applyImagePlan(activeSession, id, orderedRows)
            if (plan is EditListingResult.Failure) {
                val cleanup = cleanup(plan.session ?: activeSession, uploadedObjects)
                return plan.copy(
                    message = when {
                        plan.unauthorized -> plan.message
                        else -> "اتحفظت بيانات العنصر، لكن تعذر حفظ ترتيب الصور. أعد فتح التعديل وحاول تاني."
                    },
                    session = cleanup.session,
                    coreWasSaved = true,
                )
            }
            plan as EditListingResult.Success
            activeSession = plan.session

            val removedUrls = plan.value
            val removable = removedUrls.mapNotNull(::mediaFromPublicUrl)
            val unparsedRemoved = removedUrls.size != removable.size
            val oldCleanup = cleanup(activeSession, removable)
            activeSession = oldCleanup.session

            return EditListingResult.Success(
                Unit,
                activeSession,
                storageCleanupWarning = unparsedRemoved || !oldCleanup.complete,
            )
        } catch (cancelled: CancellationException) {
            withContext(NonCancellable) { cleanup(activeSession, uploadedObjects) }
            throw cancelled
        }
    }

    private suspend fun loadCore(session: AuthSession, itemId: String): EditListingResult<EditableListing> {
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/marketplace/items/$itemId/edit"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parseCore(result.value.body, itemId)?.let { EditListingResult.Success(it, result.session) }
                    ?: EditListingResult.Failure("الخادم أعاد بيانات تعديل غير صالحة.", result.session)
                401 -> expired(result.session)
                404 -> EditListingResult.Failure("العنصر غير موجود أو مش مسموح لك تعدّله.", result.session)
                else -> EditListingResult.Failure("تعذر تحميل بيانات التعديل (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل بيانات العنصر الآن.")
        }
    }

    private suspend fun loadImages(session: AuthSession, itemId: String): EditListingResult<List<EditableListingImage>> {
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/marketplace/items/$itemId/edit/images"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> parseImages(result.value.body, itemId)?.let { EditListingResult.Success(it, result.session) }
                    ?: EditListingResult.Failure("الخادم أعاد صور تعديل غير صالحة.", result.session)
                401 -> expired(result.session)
                404 -> EditListingResult.Failure("صور العنصر غير متاحة للتعديل.", result.session)
                else -> EditListingResult.Failure("تعذر تحميل صور العنصر (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل صور العنصر الآن.")
        }
    }

    private suspend fun loadCategories(session: AuthSession): EditListingResult<List<AddItemCategory>> {
        return when (val result = executor.execute(session, OracleRequest(path = "/v1/marketplace/categories"))) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val raw = result.value.body.optJSONArray("items")
                        ?: return EditListingResult.Failure("استجابة الفئات غير مكتملة.", result.session)
                    val categories = buildList {
                        for (index in 0 until raw.length()) {
                            val row = raw.optJSONObject(index) ?: continue
                            val id = row.optString("id").trim()
                            val name = row.optString("nameAr").trim()
                            if (id.isNotEmpty() && name.isNotEmpty()) add(AddItemCategory(id, name))
                        }
                    }
                    if (categories.isEmpty()) EditListingResult.Failure("مفيش فئات متاحة للتعديل دلوقتي.", result.session)
                    else EditListingResult.Success(categories, result.session)
                }
                401 -> expired(result.session)
                else -> EditListingResult.Failure("تعذر تحميل الفئات (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تحميل الفئات الآن.")
        }
    }

    private suspend fun saveCore(
        session: AuthSession,
        itemId: String,
        draft: EditListingDraft,
    ): EditListingResult<Unit> {
        val tags = JSONArray().apply { draft.wantedTags.map(String::trim).filter(String::isNotEmpty).distinct().forEach(::put) }
        val body = JSONObject()
            .put("itemId", itemId)
            .put("ownerId", session.user.id)
            .put("title", draft.title.trim())
            .putNullable("categoryId", draft.categoryId)
            .putNullable("city", draft.city.clean())
            .putNullable("area", draft.area.clean())
            .put("condition", draft.condition.apiValue)
            .putNullable("conditionNotes", draft.conditionNotes.clean())
            .putNullable("description", draft.description.clean())
            .putNullable("itemStory", draft.itemStory.clean())
            .putNullable("swapReason", draft.swapReason.clean())
            .putNullable("goodFor", draft.goodFor.clean())
            .put("desireMode", draft.desireMode.apiValue)
            .putNullable("desireText", draft.desireText.clean())
            .put("wantedTags", tags)

        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/marketplace/items/$itemId/edit", body),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 401 -> expired(result.session)
                result.value.status == 200 && result.value.body.optBoolean("ok") && result.value.body.optString("code") == "updated" ->
                    EditListingResult.Success(Unit, result.session)
                result.value.status == 200 && result.value.body.optString("code") == "not_found_or_unauthorized" ->
                    EditListingResult.Failure("العنصر غير موجود أو مش مسموح لك تعدّله.", result.session)
                result.value.status == 200 && result.value.body.optString("code") == "not_editable" ->
                    EditListingResult.Failure("العنصر مش قابل للتعديل في حالته الحالية.", result.session)
                else -> EditListingResult.Failure("تعذر حفظ بيانات العنصر (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر حفظ بيانات العنصر الآن.")
        }
    }

    private suspend fun requestUploadGrant(session: AuthSession, media: MediaObject): EditListingResult<String> {
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads", media.toJson()),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                201 -> result.value.body.optString("uploadUrl").takeIf { it.startsWith("https://") }
                    ?.let { EditListingResult.Success(it, result.session) }
                    ?: EditListingResult.Failure("الخادم أعاد تصريح رفع غير صالح.", result.session)
                401 -> expired(result.session)
                else -> EditListingResult.Failure("تعذر تجهيز رفع الصورة (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تجهيز رفع الصور الآن.")
        }
    }

    private suspend fun completeUpload(session: AuthSession, media: MediaObject): EditListingResult<String> {
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/media/uploads/complete", media.toJson()),
        )) {
            is AuthenticatedOracleResult.Response -> when (result.value.status) {
                200 -> {
                    val key = result.value.body.optString("objectKey")
                    val url = result.value.body.optString("publicUrl")
                    if (key == media.objectKey && url.startsWith("https://")) EditListingResult.Success(url, result.session)
                    else EditListingResult.Failure("تعذر التحقق من الصورة المرفوعة.", result.session)
                }
                401 -> expired(result.session)
                else -> EditListingResult.Failure("تعذر تثبيت الصورة (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر تثبيت الصورة الآن.")
        }
    }

    private suspend fun applyImagePlan(
        session: AuthSession,
        itemId: String,
        orderedRows: JSONArray,
    ): EditListingResult<List<String>> {
        val body = JSONObject()
            .put("itemId", itemId)
            .put("ownerId", session.user.id)
            .put("orderedRows", orderedRows)
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.POST, "/v1/marketplace/items/$itemId/edit/images/plan", body),
        )) {
            is AuthenticatedOracleResult.Response -> when {
                result.value.status == 401 -> expired(result.session)
                result.value.status == 200 && result.value.body.optBoolean("ok") && result.value.body.optString("code") == "updated" -> {
                    val raw = result.value.body.optJSONArray("removedImageUrls") ?: JSONArray()
                    val removed = buildList {
                        for (index in 0 until raw.length()) raw.optString(index).takeIf(String::isNotBlank)?.let(::add)
                    }
                    EditListingResult.Success(removed, result.session)
                }
                result.value.status == 200 && result.value.body.optString("code") == "not_found_or_unauthorized" ->
                    EditListingResult.Failure("العنصر غير موجود أو مش مسموح لك تعدّل صوره.", result.session)
                result.value.status == 200 && result.value.body.optString("code") == "not_editable" ->
                    EditListingResult.Failure("صور العنصر مش قابلة للتعديل في حالته الحالية.", result.session)
                result.value.status == 200 && result.value.body.optString("code") == "invalid_input" ->
                    EditListingResult.Failure("تعذر التحقق من ترتيب الصور. أعد فتح التعديل.", result.session)
                else -> EditListingResult.Failure("تعذر حفظ صور العنصر (${result.value.status}).", result.session)
            }
            else -> result.toFailure("تعذر حفظ صور العنصر الآن.")
        }
    }

    private suspend fun cleanup(session: AuthSession, objects: List<MediaObject>): CleanupResult {
        if (objects.isEmpty()) return CleanupResult(session, true)
        val body = JSONObject().put("objects", JSONArray().apply { objects.forEach { put(it.toJson()) } })
        return when (val result = executor.execute(
            session,
            OracleRequest(OracleHttpMethod.DELETE, "/v1/media/objects", body),
        )) {
            is AuthenticatedOracleResult.Response -> CleanupResult(
                result.session,
                result.value.status == 200 && result.value.body.optInt("deleted") == objects.size,
            )
            is AuthenticatedOracleResult.NetworkFailure -> CleanupResult(result.session ?: session, false)
            is AuthenticatedOracleResult.InvalidResponse -> CleanupResult(result.session ?: session, false)
            is AuthenticatedOracleResult.SessionFailure -> CleanupResult(session, false)
        }
    }

    private fun parseCore(body: JSONObject, itemId: String): EditableListing? {
        if (body.optString("id") != itemId) return null
        val status = body.optString("status")
        if (status !in setOf("active", "archived")) return null
        val condition = ItemCondition.entries.firstOrNull { it.apiValue == body.optString("condition") } ?: return null
        val desireMode = DesireMode.entries.firstOrNull { it.apiValue == body.optString("desireMode") } ?: return null
        val title = body.optString("title").trim()
        if (title.isEmpty()) return null
        val wantedTags = body.optJSONArray("wantedTags")?.let { raw ->
            buildList { for (index in 0 until raw.length()) raw.optString(index).trim().takeIf(String::isNotEmpty)?.let(::add) }
        } ?: return null
        return EditableListing(
            id = itemId,
            status = status,
            title = title,
            categoryId = body.nullableString("categoryId"),
            city = body.nullableString("city"),
            area = body.nullableString("area"),
            condition = condition,
            conditionNotes = body.nullableString("conditionNotes"),
            description = body.nullableString("description"),
            itemStory = body.nullableString("itemStory"),
            swapReason = body.nullableString("swapReason"),
            goodFor = body.nullableString("goodFor"),
            desireMode = desireMode,
            desireText = body.nullableString("desireText"),
            wantedTags = wantedTags,
            images = emptyList(),
        )
    }

    private fun parseImages(body: JSONObject, itemId: String): List<EditableListingImage>? {
        if (body.optString("itemId") != itemId) return null
        val raw = body.optJSONArray("images") ?: return null
        return buildList {
            for (index in 0 until raw.length()) {
                val row = raw.optJSONObject(index) ?: return null
                val id = row.optString("id").trim()
                val url = row.optString("imageUrl").trim()
                if (id.isEmpty() || !url.startsWith("https://")) return null
                add(
                    EditableListingImage(
                        id = id,
                        imageUrl = url,
                        isPrimary = row.optBoolean("isPrimary"),
                        sortOrder = if (row.isNull("sortOrder")) null else row.optInt("sortOrder"),
                    ),
                )
            }
        }
    }

    private fun mediaFromPublicUrl(url: String): MediaObject? {
        val marker = "#teswa-object=item_image:"
        val index = url.indexOf(marker)
        if (index < 0) return null
        val key = url.substring(index + marker.length).trim()
        if (key.isEmpty()) return null
        return MediaObject("item_image", key, null, null)
    }

    private fun AuthenticatedOracleResult.toFailure(message: String): EditListingResult.Failure = when (this) {
        is AuthenticatedOracleResult.NetworkFailure -> EditListingResult.Failure(message, session, network = true)
        is AuthenticatedOracleResult.InvalidResponse -> EditListingResult.Failure("الخادم أعاد استجابة غير صالحة.", session)
        is AuthenticatedOracleResult.SessionFailure -> EditListingResult.Failure(
            failure.message,
            unauthorized = failure.reason == AuthResult.Reason.SESSION_EXPIRED,
            network = failure.reason == AuthResult.Reason.NETWORK,
        )
        is AuthenticatedOracleResult.Response -> error("HTTP responses must be mapped by the caller.")
    }

    private fun expired(session: AuthSession) = EditListingResult.Failure(
        "انتهت جلسة تِسوى.",
        session = session,
        unauthorized = true,
    )

    private fun safeFileName(value: String): String {
        val clean = value.trim().lowercase().replace(Regex("[^a-z0-9._-]"), "-").replace(Regex("-+"), "-")
        return clean.trim('-').takeIf { it.isNotBlank() }?.take(80) ?: "item-image.jpg"
    }

    private fun String.clean() = trim().takeIf(String::isNotEmpty)

    private fun JSONObject.nullableString(key: String): String? =
        if (isNull(key)) null else optString(key).trim().takeIf(String::isNotEmpty)

    private fun JSONObject.putNullable(key: String, value: String?): JSONObject =
        put(key, value ?: JSONObject.NULL)
}

private data class MediaObject(
    val purpose: String,
    val objectKey: String,
    val contentType: String?,
    val sizeBytes: Long?,
) {
    fun toJson() = JSONObject()
        .put("purpose", purpose)
        .put("objectKey", objectKey)
        .put("contentType", contentType ?: JSONObject.NULL)
        .put("sizeBytes", sizeBytes ?: JSONObject.NULL)
}

private data class CleanupResult(val session: AuthSession, val complete: Boolean)
