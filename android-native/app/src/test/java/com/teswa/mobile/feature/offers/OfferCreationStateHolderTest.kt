package com.teswa.mobile.feature.offers

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OfferCreationStateHolderTest {
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )
    private val requested = OfferItemSummary("22222222-2222-2222-2222-222222222222", "راديو", null)
    private val offered = OfferItemSummary("33333333-3333-3333-3333-333333333333", "كتاب", null)
    private val receiverId = "44444444-4444-4444-4444-444444444444"

    @Test
    fun selectsOwnedItemAndPublishesOffer() = runBlocking {
        val repository = CreationRepository(
            session,
            OfferCreationContext(requested, listOf(offered), receiverId),
        )
        val holder = OfferCreationStateHolder(session, requested.id, repository)
        holder.load()
        holder.select(offered.id)
        holder.updateMessage("تبديل مناسب")

        holder.submit()

        assertTrue(holder.state is OfferCreationUiState.Sent)
        assertEquals(offered.id, repository.createdOfferedId)
        assertEquals("تبديل مناسب", repository.createdMessage)
    }
}

private class CreationRepository(
    private val session: AuthSession,
    private val context: OfferCreationContext,
) : OffersRepository {
    var createdOfferedId: String? = null
    var createdMessage: String? = null
    override suspend fun load(session: AuthSession): OffersResult<OffersInbox> = error("Not used")
    override suspend fun act(session: AuthSession, offer: OfferSummary, action: OfferAction): OffersResult<OfferActionOutcome> = error("Not used")
    override suspend fun loadCreation(session: AuthSession, requestedItemId: String) = OffersResult.Success(context, this.session)
    override suspend fun create(
        session: AuthSession,
        requestedItemId: String,
        offeredItemId: String,
        receiverId: String,
        message: String,
    ): OffersResult<CreatedOffer> {
        createdOfferedId = offeredItemId
        createdMessage = message
        return OffersResult.Success(CreatedOffer("55555555-5555-5555-5555-555555555555"), this.session)
    }
}
