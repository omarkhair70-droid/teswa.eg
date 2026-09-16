package com.teswa.mobile.feature.dolab

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.feature.additem.AddItemCategory
import com.teswa.mobile.feature.additem.AddItemDraft
import com.teswa.mobile.feature.additem.AddItemPublishProgress
import com.teswa.mobile.feature.additem.AddItemRepository
import com.teswa.mobile.feature.additem.AddItemResult
import com.teswa.mobile.feature.additem.PublishedItem

class DolabAwareAddItemRepository(
    private val delegate: AddItemRepository,
    private val bridge: DolabPublishBridgeRepository,
    private val contextStore: DolabPublishContextStore,
) : AddItemRepository {
    override suspend fun loadCategories(session: AuthSession): AddItemResult<List<AddItemCategory>> {
        return delegate.loadCategories(reconcileExistingLink(session))
    }

    override suspend fun publish(
        session: AuthSession,
        draft: AddItemDraft,
        onProgress: (AddItemPublishProgress) -> Unit,
    ): AddItemResult<PublishedItem> {
        val activeSession = reconcileExistingLink(session)
        val source = contextStore.pending(activeSession.user.id)?.takeIf { it.publishedItemId == null }
        val result = delegate.publish(activeSession, draft, onProgress)
        if (result !is AddItemResult.Success || source == null) return result

        contextStore.markListingCreated(result.session.user.id, result.value.itemId)
        return when (val linked = bridge.markPublished(result.session, source.dolabItemId, result.value.itemId)) {
            is DolabResult.Success -> {
                contextStore.clear(linked.session.user.id)
                AddItemResult.Success(result.value, linked.session)
            }
            is DolabResult.Failure -> {
                // The marketplace listing is already live. Never convert this into a publish failure,
                // otherwise a retry could create a duplicate listing. Keep the persisted link for reconciliation.
                AddItemResult.Success(result.value, linked.session ?: result.session)
            }
        }
    }

    private suspend fun reconcileExistingLink(session: AuthSession): AuthSession {
        val pending = contextStore.pending(session.user.id) ?: return session
        val publishedItemId = pending.publishedItemId ?: return session
        return when (val result = bridge.markPublished(session, pending.dolabItemId, publishedItemId)) {
            is DolabResult.Success -> {
                contextStore.clear(result.session.user.id)
                result.session
            }
            is DolabResult.Failure -> result.session ?: session
        }
    }
}
