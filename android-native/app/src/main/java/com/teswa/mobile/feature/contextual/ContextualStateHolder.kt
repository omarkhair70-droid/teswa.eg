package com.teswa.mobile.feature.contextual

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface ContextualUiState {
    data object Loading : ContextualUiState
    data class Ready(val items: List<ContextualConversation>) : ContextualUiState
    data class Error(val message: String) : ContextualUiState
}

class ContextualStateHolder(
    initialSession: AuthSession,
    private val repository: ContextualRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<ContextualUiState>(ContextualUiState.Loading)
        private set
    var thread by mutableStateOf<ContextualThread?>(null)
        private set
    var composer by mutableStateOf("")
        private set
    var working by mutableStateOf(false)
        private set
    var message by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(value: AuthSession) {
        if (value.user.id == session.user.id && value.accessToken != session.accessToken) session = value
    }

    suspend fun load(silent: Boolean = false) {
        if (!silent || state !is ContextualUiState.Ready) state = ContextualUiState.Loading
        when (val result = repository.loadInbox(session)) {
            is ContextualResult.Success -> {
                session = result.session
                state = ContextualUiState.Ready(result.value)
                message = null
            }
            is ContextualResult.Failure -> fail(result, hard = !silent)
        }
    }

    suspend fun open(value: ContextualConversation) {
        working = true
        message = null
        when (val result = repository.loadThread(session, value.id)) {
            is ContextualResult.Success -> {
                session = result.session
                thread = result.value
                composer = ""
                when (val read = repository.markRead(session, value.id)) {
                    is ContextualResult.Success -> session = read.session
                    is ContextualResult.Failure -> fail(read)
                }
            }
            is ContextualResult.Failure -> fail(result)
        }
        working = false
    }

    suspend fun openById(conversationId: String): Boolean {
        if (state !is ContextualUiState.Ready) load()
        val conversation = (state as? ContextualUiState.Ready)?.items?.firstOrNull { it.id == conversationId }
        if (conversation == null) {
            message = "رد القصة مش موجود أو لسه بيتجهز."
            return false
        }
        open(conversation)
        return true
    }

    fun close() {
        thread = null
        composer = ""
        message = null
    }

    fun compose(value: String) {
        composer = value.take(1_200)
    }

    suspend fun send() {
        val current = thread ?: return
        val body = composer.trim()
        if (working || body.isEmpty()) return
        working = true
        message = null
        when (val result = repository.sendText(session, current.conversation.id, body)) {
            is ContextualResult.Success -> {
                session = result.session
                composer = ""
                thread = current.copy(messages = (current.messages + result.value).distinctBy { it.id })
            }
            is ContextualResult.Failure -> fail(result)
        }
        working = false
    }

    suspend fun reloadThread() {
        val current = thread ?: return
        when (val result = repository.loadThread(session, current.conversation.id)) {
            is ContextualResult.Success -> {
                session = result.session
                thread = result.value
                when (val read = repository.markRead(session, current.conversation.id)) {
                    is ContextualResult.Success -> session = read.session
                    is ContextualResult.Failure -> fail(read)
                }
            }
            is ContextualResult.Failure -> fail(result)
        }
    }

    private fun fail(result: ContextualResult.Failure, hard: Boolean = false) {
        result.session?.let { session = it }
        sessionExpired = result.unauthorized
        if (hard || result.unauthorized) state = ContextualUiState.Error(result.message) else message = result.message
    }
}
