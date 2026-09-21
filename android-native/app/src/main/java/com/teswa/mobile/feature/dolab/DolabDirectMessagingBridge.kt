package com.teswa.mobile.feature.dolab

import android.content.Context
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.direct.DirectConversation
import com.teswa.mobile.feature.direct.DirectMessage
import com.teswa.mobile.feature.voice.VoiceMediaRepository
import com.teswa.mobile.feature.voice.VoiceMediaResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

data class DolabDirectShareable(
    val id: String,
    val title: String,
    val text: String,
)

interface DolabDirectMessagingBridge {
    suspend fun loadShareables(session: AuthSession): DolabResult<List<DolabDirectShareable>>
    suspend fun saveMessage(
        session: AuthSession,
        conversation: DirectConversation,
        message: DirectMessage,
    ): DolabResult<Unit>
}

class AndroidDolabDirectMessagingBridge(
    context: Context,
    private val dolabRepository: DolabRepository,
    private val voiceMediaRepository: VoiceMediaRepository,
) : DolabDirectMessagingBridge {
    private val appContext = context.applicationContext

    override suspend fun loadShareables(session: AuthSession): DolabResult<List<DolabDirectShareable>> =
        when (val result = dolabRepository.loadWorkspace(session)) {
            is DolabResult.Success -> DolabResult.Success(buildDolabDirectShareables(result.value), result.session)
            is DolabResult.Failure -> result
        }

    override suspend fun saveMessage(
        session: AuthSession,
        conversation: DirectConversation,
        message: DirectMessage,
    ): DolabResult<DolabItem> =
        if (message.messageType == "voice" && !message.audioStoragePath.isNullOrBlank()) {
            saveVoice(session, conversation, message)
        } else {
            saveText(session, conversation, message)
        }

    private suspend fun saveText(
        session: AuthSession,
        conversation: DirectConversation,
        message: DirectMessage,
    ): DolabResult<Unit> {
        val clean = message.body.trim()
        if (clean.isEmpty()) return DolabResult.Failure("الرسالة دي مفيهاش نص يتحفظ.", session)
        return when (
            val saved = dolabRepository.createNote(
                session = session,
                itemId = null,
                body = clean.take(8_000),
                noteType = "text",
            )
        ) {
            is DolabResult.Success -> DolabResult.Success(Unit, saved.session)
            is DolabResult.Failure -> saved
        }
    }

    private suspend fun saveVoice(
        session: AuthSession,
        conversation: DirectConversation,
        message: DirectMessage,
    ): DolabResult<Unit> {
        val storagePath = message.audioStoragePath
            ?: return DolabResult.Failure("التسجيل غير متاح للحفظ.", session)
        var activeSession = session
        val signedUrl = when (val signed = voiceMediaRepository.signedUrl(activeSession, "direct_voice", storagePath)) {
            is VoiceMediaResult.Success -> {
                activeSession = signed.session
                signed.value
            }
            is VoiceMediaResult.Failure -> return DolabResult.Failure(
                signed.message,
                signed.session,
                unauthorized = signed.unauthorized,
                network = signed.network,
            )
        }

        val expectedSize = message.audioSizeBytes?.takeIf { it in 1..MAX_VOICE_BYTES }
        if (message.audioSizeBytes != null && expectedSize == null) {
            return DolabResult.Failure("حجم التسجيل غير صالح للحفظ في الدولاب.", activeSession)
        }

        val target = withContext(Dispatchers.IO) {
            File(appContext.cacheDir, "dolab-chat").apply { mkdirs() }
                .let { File.createTempFile("direct-${message.id.take(12)}-", ".m4a", it) }
        }
        try {
            if (!download(signedUrl, target, MAX_VOICE_BYTES)) {
                return DolabResult.Failure("تعذر تجهيز التسجيل للحفظ في الدولاب.", activeSession, network = true)
            }
            if (expectedSize != null && target.length() != expectedSize) {
                return DolabResult.Failure("التسجيل المحفوظ غير مكتمل.", activeSession)
            }

            val media = DolabPendingMedia(
                uri = target.toURI().toString(),
                displayName = target.name,
                mediaType = "audio",
                mimeType = message.audioMimeType?.takeIf(String::isNotBlank) ?: "audio/m4a",
                sizeBytes = target.length(),
                durationMs = message.audioDurationMs?.toLong(),
                openStream = { target.inputStream() },
            )
            return when (
                val uploaded = dolabRepository.uploadMedia(
                    session = activeSession,
                    itemId = null,
                    media = media,
                    sortOrder = 0,
                    onProgress = {},
                )
            ) {
                is DolabResult.Failure -> uploaded
                is DolabResult.Success -> {
                    activeSession = uploaded.session
                    when (
                        val note = dolabRepository.createNote(
                            session = activeSession,
                            itemId = null,
                            body = messageTitle(activeSession, conversation, message),
                            noteType = "voice",
                            mediaId = uploaded.value.id,
                        )
                    ) {
                        is DolabResult.Success -> DolabResult.Success(Unit, note.session)
                        is DolabResult.Failure -> {
                            val rollbackSession = when (
                                val rollback = dolabRepository.deleteMedia(note.session ?: activeSession, uploaded.value)
                            ) {
                                is DolabResult.Success -> rollback.session
                                is DolabResult.Failure -> rollback.session ?: note.session ?: activeSession
                            }
                            DolabResult.Failure(
                                note.message,
                                rollbackSession,
                                unauthorized = note.unauthorized,
                                network = note.network,
                            )
                        }
                    }
                }
            }
        } finally {
            withContext(Dispatchers.IO) { target.delete() }
        }
    }

    private fun messageTitle(session: AuthSession, conversation: DirectConversation, message: DirectMessage): String {
        val other = conversation.otherDisplayName ?: conversation.otherUsername ?: "مستخدم تِسوى"
        return if (message.senderId == session.user.id) "رسالة منك لـ $other" else "رسالة من $other"
    }

    private suspend fun download(url: String, target: File, maxBytes: Long): Boolean = withContext(Dispatchers.IO) {
        if (!url.startsWith("https://")) return@withContext false
        var connection: HttpURLConnection? = null
        try {
            connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 12_000
                readTimeout = 20_000
                instanceFollowRedirects = true
                setRequestProperty("Accept", "audio/*")
                setRequestProperty("User-Agent", "TeswaNative/Android")
            }
            if (connection.responseCode !in 200..299) return@withContext false
            if (connection.contentLengthLong > maxBytes) return@withContext false
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
            written in 1..maxBytes
        } catch (_: Exception) {
            false
        } finally {
            connection?.disconnect()
            if (target.length() > maxBytes) target.delete()
        }
    }

    private companion object {
        const val MAX_VOICE_BYTES = 15_728_640L
    }
}

fun buildDolabDirectShareables(workspace: DolabWorkspace): List<DolabDirectShareable> {
    val result = mutableListOf<DolabDirectShareable>()
    val seenText = linkedSetOf<String>()

    workspace.items
        .asSequence()
        .filter { it.status != DolabItemStatus.ARCHIVED && it.source !in setOf("note", "voice") }
        .take(8)
        .forEach { item ->
            val title = item.title?.trim().takeUnless { it.isNullOrEmpty() } ?: "حاجة من دولابك"
            val text = buildList {
                item.title?.trim()?.takeIf(String::isNotEmpty)?.let(::add)
                item.description?.trim()?.takeIf(String::isNotEmpty)?.let(::add)
                item.exchangeIntent?.trim()?.takeIf(String::isNotEmpty)?.let { add("نفسي أبدّلها بـ: $it") }
            }.joinToString("\n").trim().take(1_200)
            if (text.isNotEmpty() && seenText.add(text)) {
                result += DolabDirectShareable("item:${item.id}", title, text)
            }
        }

    workspace.notes
        .asSequence()
        .mapNotNull { note -> note.body?.trim()?.takeIf(String::isNotEmpty)?.let { note to it.take(1_200) } }
        .take(6)
        .forEach { (note, text) ->
            if (seenText.add(text)) {
                val itemTitle = note.dolabItemId
                    ?.let { id -> workspace.items.firstOrNull { it.id == id }?.title }
                    ?.trim()
                    ?.takeIf(String::isNotEmpty)
                result += DolabDirectShareable(
                    id = "note:${note.id}",
                    title = itemTitle?.let { "ملاحظة — $it" } ?: "ملاحظة من دولابك",
                    text = text,
                )
            }
        }

    return result.take(12)
}
