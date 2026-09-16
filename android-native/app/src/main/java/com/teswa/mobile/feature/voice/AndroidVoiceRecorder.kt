package com.teswa.mobile.feature.voice

import android.content.Context
import android.media.MediaRecorder
import android.os.SystemClock
import java.io.File

class AndroidVoiceRecorder(context: Context) {
    private val directory = File(context.applicationContext.cacheDir, "voice-drafts")
    private var recorder: MediaRecorder? = null
    private var output: File? = null
    private var startedAt = 0L

    val isRecording: Boolean get() = recorder != null

    @Suppress("DEPRECATION")
    fun start(): Boolean {
        if (recorder != null) return false
        directory.mkdirs()
        val file = File.createTempFile("teswa-voice-", ".m4a", directory)
        val value = MediaRecorder()
        return try {
            value.setAudioSource(MediaRecorder.AudioSource.MIC)
            value.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            value.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            value.setAudioSamplingRate(44_100)
            value.setAudioEncodingBitRate(96_000)
            value.setMaxDuration(120_000)
            value.setMaxFileSize(15_728_640)
            value.setOutputFile(file.absolutePath)
            value.prepare()
            value.start()
            recorder = value
            output = file
            startedAt = SystemClock.elapsedRealtime()
            true
        } catch (_: Exception) {
            runCatching { value.release() }
            file.delete()
            false
        }
    }

    fun stop(): VoiceDraft? {
        val value = recorder ?: return null
        val file = output
        val duration = (SystemClock.elapsedRealtime() - startedAt).coerceAtMost(120_000).toInt()
        recorder = null
        output = null
        startedAt = 0L
        val stopped = runCatching { value.stop() }.isSuccess
        runCatching { value.release() }
        if (!stopped || file == null || !file.isFile) {
            file?.delete()
            return null
        }
        return VoiceDraft(file, duration).also { draft ->
            if (draft.validate() != null) draft.discard()
        }.takeIf { it.file.exists() }
    }

    fun cancel() {
        val value = recorder
        recorder = null
        runCatching { value?.stop() }
        runCatching { value?.release() }
        output?.delete()
        output = null
        startedAt = 0L
    }
}
