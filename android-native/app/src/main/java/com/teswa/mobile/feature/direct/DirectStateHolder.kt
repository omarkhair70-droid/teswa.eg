package com.teswa.mobile.feature.direct

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface DirectUiState {
    data object Loading : DirectUiState
    data class Ready(val items: List<DirectConversation>) : DirectUiState
    data class Error(val message: String) : DirectUiState
}

class DirectStateHolder(
    initialSession: AuthSession,
    private val repository: DirectRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var state by mutableStateOf<DirectUiState>(DirectUiState.Loading)
        private set
    var selected by mutableStateOf<DirectConversation?>(null)
        private set
    var messages by mutableStateOf<List<DirectMessage>>(emptyList())
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

    suspend fun load() {
        state = DirectUiState.Loading
        when (val result = repository.loadInbox(session)) {
            is DirectResult.Success -> {
                session = result.session
                state = DirectUiState.Ready(result.value)
            }
            is DirectResult.Failure -> fail(result, hard = true)
        }
    }

    suspend fun open(value: DirectConversation) {
        selected = value
        composer = ""
        when (val result = repository.loadMessages(session, value.id)) {
            is DirectResult.Success -> {
                session = result.session
                messages = result.value
                when (val read = repository.markRead(session, value.id)) {
                    is DirectResult.Success -> session = read.session
                    is DirectResult.Failure -> fail(read)
                }
            }
            is DirectResult.Failure -> fail(result)
        }
    }

    suspend fun openById(conversationId: String): Boolean {
        if (state !is DirectUiState.Ready) load()
        val conversation = (state as? DirectUiState.Ready)?.items?.firstOrNull { it.id == conversationId }
        if (conversation == null) {
            message = "المحادثة مش موجودة أو لسه بتتجهز."
            return false
        }
        open(conversation)
        return true
    }

    fun close() {
        selected = null
        messages = emptyList()
        composer = ""
        message = null
    }

    fun compose(value: String) {
        composer = value.take(1_200)
    }

    suspend fun send() {
        val conversation = selected ?: return
        val body = composer.trim()
        if (working || body.isEmpty()) return
        working = true
        when (val result = repository.send(session, conversation, body)) {
            is DirectResult.Success -> {
                session = result.session
                composer = ""
                open(conversation)
            }
            is DirectResult.Failure -> fail(result)
        }
        working = false
    }

    suspend fun act(accept: Boolean) {
        val conversation = selected ?: return
        if (working) return
        working = true
        when (val result = repository.act(session, conversation.id, accept)) {
            is DirectResult.Success -> {
                session = result.session
                if (accept) {
                    val accepted = conversation.copy(status = "accepted", requiresAction = false)
                    selected = accepted
                    open(accepted)
                } else {
                    close()
                    load()
                }
            }
            is DirectResult.Failure -> fail(result)
        }
        working = false
    }

    private fun fail(result: DirectResult.Failure, hard: Boolean = false) {
        result.session?.let { session = it }
        sessionExpired = result.unauthorized
        if (hard || result.unauthorized) state = DirectUiState.Error(result.message) else message = result.message
    }
}
