package com.teswa.mobile.feature.messages

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.teswa.mobile.auth.AuthSession

sealed interface InboxUiState {
    data object Loading : InboxUiState
    data class Empty(val message: String) : InboxUiState
    data class Content(
        val items: List<DealConversation>,
        val hasMore: Boolean,
        val loadingMore: Boolean = false,
    ) : InboxUiState
    data class Error(val message: String) : InboxUiState
}

sealed interface ThreadUiState {
    data object Idle : ThreadUiState
    data object Loading : ThreadUiState
    data class Content(val messages: List<DealMessage>) : ThreadUiState
    data class Error(val message: String) : ThreadUiState
}

class MessagingStateHolder(
    initialSession: AuthSession,
    private val repository: MessagingRepository,
) {
    var session by mutableStateOf(initialSession)
        private set
    var inboxState by mutableStateOf<InboxUiState>(InboxUiState.Loading)
        private set
    var selectedConversation by mutableStateOf<DealConversation?>(null)
        private set
    var threadState by mutableStateOf<ThreadUiState>(ThreadUiState.Idle)
        private set
    var composer by mutableStateOf("")
        private set
    var sending by mutableStateOf(false)
        private set
    var banner by mutableStateOf<String?>(null)
        private set
    var sessionExpired by mutableStateOf(false)
        private set

    fun updateSession(updated: AuthSession) {
        if (updated.user.id == session.user.id && updated.accessToken != session.accessToken) session = updated
    }

    suspend fun load(silent: Boolean = false) {
        sessionExpired = false
        if (!silent || inboxState !is InboxUiState.Content) inboxState = InboxUiState.Loading
        when (val result = repository.loadInbox(session)) {
            is MessagingResult.Success -> {
                session = result.session
                banner = null
                inboxState = if (result.value.items.isEmpty()) {
                    InboxUiState.Empty("لما يبدأ تنسيق صفقة، محادثتها هتظهر هنا.")
                } else {
                    InboxUiState.Content(result.value.items, result.value.hasMore)
                }
            }
            is MessagingResult.Failure -> handleInboxFailure(result, silent)
        }
    }

    suspend fun loadMore() {
        val current = inboxState as? InboxUiState.Content ?: return
        if (!current.hasMore || current.loadingMore) return
        inboxState = current.copy(loadingMore = true)
        when (val result = repository.loadInbox(session, offset = current.items.size)) {
            is MessagingResult.Success -> {
                session = result.session
                inboxState = current.copy(
                    items = (current.items + result.value.items).distinctBy { it.dealId },
                    hasMore = result.value.hasMore,
                    loadingMore = false,
                )
            }
            is MessagingResult.Failure -> handleInboxFailure(result, silent = true)
        }
    }

    suspend fun open(conversation: DealConversation) {
        selectedConversation = conversation
        composer = ""
        banner = null
        loadThread(conversation, silent = false)
    }

    suspend fun reloadThread() {
        selectedConversation?.let { loadThread(it, silent = true) }
    }

    private suspend fun loadThread(conversation: DealConversation, silent: Boolean) {
        if (!silent || threadState !is ThreadUiState.Content) threadState = ThreadUiState.Loading
        when (val result = repository.loadMessages(session, conversation.dealId)) {
            is MessagingResult.Success -> {
                session = result.session
                threadState = ThreadUiState.Content(result.value)
                val read = repository.markRead(session, conversation.dealId)
                if (read is MessagingResult.Success) {
                    session = read.session
                    markSelectedRead(conversation.dealId)
                } else if (read is MessagingResult.Failure) {
                    read.session?.let { session = it }
                    sessionExpired = read.unauthorized
                    banner = if (read.unauthorized) null else read.message
                }
            }
            is MessagingResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                if (silent && threadState is ThreadUiState.Content && !result.unauthorized) {
                    banner = result.message
                } else {
                    threadState = ThreadUiState.Error(result.message)
                }
            }
        }
    }

    fun closeThread() {
        selectedConversation = null
        threadState = ThreadUiState.Idle
        composer = ""
        banner = null
    }

    fun updateComposer(value: String) {
        composer = value.take(2_000)
    }

    suspend fun send() {
        val conversation = selectedConversation ?: return
        val body = composer.trim()
        if (body.isEmpty() || sending) return
        sending = true
        banner = null
        when (val result = repository.sendText(session, conversation.dealId, body)) {
            is MessagingResult.Success -> {
                session = result.session
                composer = ""
                val current = threadState as? ThreadUiState.Content
                threadState = ThreadUiState.Content((current?.messages.orEmpty() + result.value).distinctBy { it.id })
                val preview = DealMessagePreview(
                    body = result.value.body,
                    createdAt = result.value.createdAt,
                    senderId = result.value.senderId,
                    messageType = result.value.messageType,
                )
                selectedConversation = conversation.copy(latestMessage = preview, lastActivityAt = result.value.createdAt)
                val inbox = inboxState as? InboxUiState.Content
                if (inbox != null) {
                    inboxState = inbox.copy(items = inbox.items.map {
                        if (it.dealId == conversation.dealId) it.copy(latestMessage = preview, lastActivityAt = result.value.createdAt)
                        else it
                    })
                }
            }
            is MessagingResult.Failure -> {
                result.session?.let { session = it }
                sessionExpired = result.unauthorized
                banner = if (result.unauthorized) null else result.message
            }
        }
        sending = false
    }

    private fun markSelectedRead(dealId: String) {
        val current = inboxState as? InboxUiState.Content ?: return
        inboxState = current.copy(items = current.items.map { if (it.dealId == dealId) it.copy(unreadCount = 0) else it })
        selectedConversation = selectedConversation?.copy(unreadCount = 0)
    }

    private fun handleInboxFailure(failure: MessagingResult.Failure, silent: Boolean) {
        failure.session?.let { session = it }
        sessionExpired = failure.unauthorized
        if (silent && inboxState is InboxUiState.Content && !failure.unauthorized) {
            val current = inboxState as InboxUiState.Content
            inboxState = current.copy(loadingMore = false)
            banner = failure.message
        } else {
            inboxState = InboxUiState.Error(failure.message)
        }
    }
}
