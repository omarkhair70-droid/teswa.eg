package com.teswa.mobile.feature.offers

import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OffersStateHolderTest {
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )

    @Test
    fun acceptedDealCanBeConsumedOnlyOnce() = runBlocking {
        val dealId = "66666666-6666-6666-6666-666666666666"
        val repository = object : OffersRepository {
            override suspend fun load(session: AuthSession) = OffersResult.Success(OffersInbox(emptyList(), emptyList()), session)
            override suspend fun act(session: AuthSession, offerId: String, action: OfferAction) =
                OffersResult.Success(OfferActionOutcome(dealId), session)
        }
        val holder = OffersStateHolder(session, repository)

        holder.act("offer", OfferAction.ACCEPT)

        assertEquals(dealId, holder.consumeAcceptedDeal())
        assertNull(holder.consumeAcceptedDeal())
        assertTrue(holder.state is OffersUiState.Empty)
    }
}
