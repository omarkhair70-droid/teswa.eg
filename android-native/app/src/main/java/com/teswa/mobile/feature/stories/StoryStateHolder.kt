package com.teswa.mobile.feature.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.voice.VoiceDraft

sealed interface StoryHomeState {
    data object Loading : StoryHomeState
    data class Ready(val groups: List<StoryGroup>) : StoryHomeState
    data class Error(val message: String) : StoryHomeState
}

class StoryStateHolder(
    initialSession: AuthSession,
    private val repository: StoryRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var homeState by mutableStateOf<StoryHomeState>(StoryHomeState.Loading)
        private set
    var viewer by mutableStateOf<StoryViewer?>(null)
        private set
    var activeIndex by mutableIntStateOf(0)
        private set
    var replyComposer by mutableStateOf("")
        private set
    var workingAction by mutableStateOf<String?>(null)
        private set
    var voiceUploadProgress by mutableStateOf<Int?>(null)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set
    private val viewedStoryIds = mutableSetOf<String>()

    fun updateSession(value: AuthSession) {
        if (value.user.id == session.user.id && value.accessToken != session.accessToken) session = value
    }

    suspend fun load(silent: Boolean = false) {
        if (!silent || homeState !is StoryHomeState.Ready) homeState = StoryHomeState.Loading
        when (val result = repository.loadHome(session)) {
            is StoryResult.Success -> {
                session = result.session
                homeState = StoryHomeState.Ready(result.value)
                message = null
            }
            is StoryResult.Failure -> {
                capture(result)
                if (!silent || homeState !is StoryHomeState.Ready) homeState = StoryHomeState.Error(result.message)
            }
        }
    }

    suspend fun open(group: StoryGroup) {
        if (workingAction != null) return
        workingAction = "open"
        message = null
        when (val result = repository.prepareViewer(session, group)) {
            is StoryResult.Success -> {
                session = result.session
                viewer = result.value
                activeIndex = 0
                replyComposer = ""
                markCurrentViewed()
            }
            is StoryResult.Failure -> capture(result)
        }
        workingAction = null
    }

    fun close() {
        viewer = null
        activeIndex = 0
        replyComposer = ""
        message = null
    }

    suspend fun move(delta: Int) {
        val current = viewer ?: return
        val next = (activeIndex + delta).coerceIn(0, current.slides.lastIndex)
        if (next == activeIndex) return
        activeIndex = next
        replyComposer = ""
        message = null
        markCurrentViewed()
    }

    fun composeReply(value: String) {
        replyComposer = value.take(800)
    }

    fun showMessage(value: String) {
        message = value
    }

    suspend fun toggleLike() {
        val currentViewer = viewer ?: return
        val slide = currentViewer.slides.getOrNull(activeIndex) ?: return
        if (workingAction != null) return
        val next = !slide.liked
        workingAction = "like"
        when (val result = repository.setLiked(session, slide.story.id, next)) {
            is StoryResult.Success -> {
                session = result.session
                val slides = currentViewer.slides.toMutableList()
                slides[activeIndex] = slide.copy(liked = result.value)
                viewer = currentViewer.copy(slides = slides)
            }
            is StoryResult.Failure -> capture(result)
        }
        workingAction = null
    }

    suspend fun sendReply(): String? {
        val slide = viewer?.slides?.getOrNull(activeIndex) ?: return null
        val body = replyComposer.trim()
        if (body.isEmpty() || workingAction != null || slide.story.userId == session.user.id) return null
        workingAction = "reply"
        message = null
        return when (val result = repository.reply(session, slide.story.id, body)) {
            is StoryResult.Success -> {
                session = result.session
                replyComposer = ""
                workingAction = null
                result.value.conversationId
            }
            is StoryResult.Failure -> {
                capture(result)
                workingAction = null
                null
            }
        }
    }

    suspend fun sendVoiceReply(draft: VoiceDraft): String? {
        val slide = viewer?.slides?.getOrNull(activeIndex) ?: return null
        if (workingAction != null || slide.story.userId == session.user.id) return null
        workingAction = "voice_reply"
        voiceUploadProgress = 0
        message = null
        val conversationId = when (val result = repository.replyVoice(session, slide.story.id, draft) { voiceUploadProgress = it }) {
            is StoryResult.Success -> {
                session = result.session
                result.value.conversationId
            }
            is StoryResult.Failure -> {
                capture(result)
                null
            }
        }
        workingAction = null
        voiceUploadProgress = null
        return conversationId
    }

    private suspend fun markCurrentViewed() {
        val story = viewer?.slides?.getOrNull(activeIndex)?.story ?: return
        if (story.userId == session.user.id || !viewedStoryIds.add(story.id)) return
        when (val result = repository.markViewed(session, story.id)) {
            is StoryResult.Success -> session = result.session
            is StoryResult.Failure -> if (result.unauthorized) capture(result)
        }
    }

    private fun capture(result: StoryResult.Failure) {
        result.session?.let { session = it }
        sessionExpired = result.unauthorized
        message = if (result.unauthorized) null else result.message
    }
}
