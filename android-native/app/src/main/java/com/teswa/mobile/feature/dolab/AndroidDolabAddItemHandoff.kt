package com.teswa.mobile.feature.dolab

import android.content.Context
import androidx.core.content.FileProvider
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.additem.AddItemCategory
import com.teswa.mobile.feature.additem.AddItemDraft
import com.teswa.mobile.feature.additem.AddItemDraftStore
import com.teswa.mobile.feature.additem.AddItemImage
import com.teswa.mobile.feature.additem.AddItemRepository
import com.teswa.mobile.feature.additem.AddItemResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

sealed interface DolabAddItemHandoffResult {
    data class Success(
        val draft: AddItemDraft,
        val session: AuthSession,
        val warnings: List<String>,
    ) : DolabAddItemHandoffResult

    data class Failure(
        val message: String,
        val session: AuthSession? = null,
    ) : DolabAddItemHandoffResult
}

class AndroidDolabAddItemHandoff(
    context: Context,
    private val dolabRepository: DolabRepository,
    private val publishBridge: DolabPublishBridgeRepository,
    private val addItemRepository: AddItemRepository,
    private val publishContextStore: DolabPublishContextStore,
) {
    private val appContext = context.applicationContext

    suspend fun prepareAndPersist(session: AuthSession, item: DolabItem): DolabAddItemHandoffResult {
        val result = prepare(session, item)
        if (result is DolabAddItemHandoffResult.Success) {
            AddItemDraftStore(appContext, result.session.user.id).save(result.draft)
            publishContextStore.begin(result.session.user.id, item.id)
        }
        return result
    }

    private suspend fun prepare(session: AuthSession, item: DolabItem): DolabAddItemHandoffResult {
        var activeSession = session
        val source = when (val result = publishBridge.loadSource(activeSession, item.id)) {
            is DolabResult.Success -> {
                activeSession = result.session
                result.value
            }
            is DolabResult.Failure -> return DolabAddItemHandoffResult.Failure(result.message, result.session)
        }

        val warnings = mutableListOf<String>()
        val images = mutableListOf<AddItemImage>()
        val imageRows = source.media.filter { it.mediaType == "image" }.take(AddItemDraft.MAX_IMAGES)
        val targetDirectory = File(appContext.cacheDir, "dolab-publish/${session.user.id}/${item.id}")
        withContext(Dispatchers.IO) {
            targetDirectory.deleteRecursively()
            targetDirectory.mkdirs()
        }

        for ((index, media) in imageRows.withIndex()) {
            val mimeType = media.mimeType?.lowercase()?.takeIf { it in AddItemDraft.SUPPORTED_IMAGE_TYPES }
            if (mimeType == null) {
                warnings += "في صورة بصيغة غير مدعومة واتسابِت."
                continue
            }
            val signedUrl = when (val signed = dolabRepository.signedMediaUrl(activeSession, media)) {
                is DolabResult.Success -> {
                    activeSession = signed.session
                    signed.value
                }
                is DolabResult.Failure -> {
                    signed.session?.let { activeSession = it }
                    warnings += "تعذر تجهيز صورة من الدولاب."
                    continue
                }
            }
            val extension = extensionFor(mimeType)
            val target = File(targetDirectory, "dolab-${index + 1}-${media.id.take(12)}.$extension")
            val downloaded = downloadImage(signedUrl, target, AddItemDraft.MAX_IMAGE_BYTES)
            if (!downloaded) {
                target.delete()
                warnings += "فشل تنزيل صورة من الدولاب."
                continue
            }
            val uri = FileProvider.getUriForFile(appContext, "${appContext.packageName}.fileprovider", target)
            images += AddItemImage(
                uri = uri.toString(),
                displayName = target.name,
                contentType = mimeType,
                sizeBytes = target.length(),
            )
        }

        val categories: List<AddItemCategory> = when (val result = addItemRepository.loadCategories(activeSession)) {
            is AddItemResult.Success -> {
                activeSession = result.session
                result.value
            }
            is AddItemResult.Failure -> {
                result.session?.let { activeSession = it }
                warnings += "الفئة هتحتاج تختارها يدويًا قبل النشر."
                emptyList()
            }
        }

        return DolabAddItemHandoffResult.Success(
            draft = mapDolabToAddItemDraft(source.item, images, categories),
            session = activeSession,
            warnings = warnings,
        )
    }

    private suspend fun downloadImage(url: String, target: File, maxBytes: Long): Boolean = withContext(Dispatchers.IO) {
        if (!url.startsWith("https://")) return@withContext false
        var connection: HttpURLConnection? = null
        try {
            connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 12_000
                readTimeout = 20_000
                instanceFollowRedirects = true
                setRequestProperty("Accept", "image/*")
                setRequestProperty("User-Agent", "TeswaNative/Android")
            }
            if (connection.responseCode !in 200..299) return@withContext false
            val announcedSize = connection.contentLengthLong
            if (announcedSize > maxBytes) return@withContext false
            var written = 0L
            connection.inputStream.buffered().use { input ->
                target.outputStream().buffered().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        written += count
                        if (written > maxBytes) return@withContext false
                        output.write(buffer, 0, count)
                    }
                }
            }
            written in 1..maxBytes && target.isFile
        } catch (_: Exception) {
            false
        } finally {
            connection?.disconnect()
            if (target.length() > maxBytes) target.delete()
        }
    }

    private fun extensionFor(mimeType: String): String = when (mimeType) {
        "image/png" -> "png"
        "image/webp" -> "webp"
        else -> "jpg"
    }
}
