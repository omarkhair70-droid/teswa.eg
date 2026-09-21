package com.teswa.mobile.feature.offers

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OffersStateHolderTest {
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )

    @Test
    fun acceptedDealCanBeConsumedOnlyOnce() = runBlocking {
        val dealId = "66666666-6666-6666-6666-666666666666"
        val offer = OfferSummary(
            "22222222-2222-2222-2222-222222222222",
            "pending",
            null,
            OfferItemSummary("33333333-3333-3333-3333-333333333333", "مطلوب", null),
            OfferItemSummary("44444444-4444-4444-4444-444444444444", "معروض", null),
            "55555555-5555-5555-5555-555555555555",
            session.user.id,
            null,
            null,
            OfferDirection.INCOMING,
        )
        val repository = object : OffersRepository {
            override suspend fun load(session: AuthSession) =
                OffersResult.Success(OffersInbox(listOf(offer), emptyList()), session)

            override suspend fun act(session: AuthSession, offer: OfferSummary, action: OfferAction) =
                OffersResult.Success(OfferActionOutcome(dealId), session)

            override suspend fun loadCreation(
                session: AuthSession,
                requestedItemId: String,
            ): OffersResult<OfferCreationContext> = error("Not used")

            override suspend fun create(
                session: AuthSession,
                requestedItemId: String,
                offeredItemId: String,
                receiverId: String,
                message: String,
            ): OffersResult<CreatedOffer> = error("Not used")
        }
        val holder = OffersStateHolder(session, repository)
        holder.load()
        holder.act(offer, OfferAction.ACCEPT)

        assertEquals(dealId, holder.consumeAcceptedDeal())
        assertNull(holder.consumeAcceptedDeal())
        val state = holder.state as OffersUiState.Content
        val accepted = state.inbox.incoming.single()
        assertEquals("accepted", accepted.status)
        assertEquals(dealId, accepted.dealId)
    }
}
