package com.teswa.mobile.core.media

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

sealed interface BinaryUploadResult {
    data object Success : BinaryUploadResult
    data class Failure(val retryable: Boolean) : BinaryUploadResult
}

fun interface BinaryUploader {
    suspend fun upload(request: BinaryUploadRequest): BinaryUploadResult
}

data class BinaryUploadRequest(
    val uploadUrl: String,
    val contentType: String,
    val sizeBytes: Long,
    val openStream: () -> InputStream,
    val onProgress: (sentBytes: Long, totalBytes: Long) -> Unit = { _, _ -> },
)

class StreamingBinaryUploader : BinaryUploader {
    override suspend fun upload(request: BinaryUploadRequest): BinaryUploadResult = withContext(Dispatchers.IO) {
        if (request.sizeBytes <= 0L) return@withContext BinaryUploadResult.Failure(retryable = false)

        var connection: HttpURLConnection? = null
        try {
            connection = (URL(request.uploadUrl).openConnection() as HttpURLConnection).apply {
                requestMethod = "PUT"
                connectTimeout = 12_000
                readTimeout = 20_000
                instanceFollowRedirects = false
                doOutput = true
                setFixedLengthStreamingMode(request.sizeBytes)
                setRequestProperty("Content-Type", request.contentType)
                setRequestProperty("If-None-Match", "*")
            }

            var sent = 0L
            request.openStream().buffered().use { input ->
                connection.outputStream.buffered().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        currentCoroutineContext().ensureActive()
                        val count = input.read(buffer)
                        if (count < 0) break
                        output.write(buffer, 0, count)
                        sent += count
                        request.onProgress(sent, request.sizeBytes)
                    }
                }
            }

            if (sent != request.sizeBytes) return@withContext BinaryUploadResult.Failure(retryable = false)
            val status = connection.responseCode
            if (status in 200..299) {
                connection.inputStream?.close()
                BinaryUploadResult.Success
            } else {
                connection.errorStream?.close()
                BinaryUploadResult.Failure(retryable = status >= 500)
            }
        } catch (_: IOException) {
            BinaryUploadResult.Failure(retryable = true)
        } finally {
            connection?.disconnect()
        }
    }
}
