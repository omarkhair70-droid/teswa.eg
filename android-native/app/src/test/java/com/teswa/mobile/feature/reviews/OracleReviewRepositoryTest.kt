package com.teswa.mobile.feature.reviews

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleResponse
import com.teswa.mobile.core.network.OracleTransport
import com.teswa.mobile.core.network.OracleTransportResult
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OracleReviewRepositoryTest {
    private val me = "11111111-1111-1111-1111-111111111111"
    private val other = "22222222-2222-2222-2222-222222222222"
    private val deal = "33333333-3333-3333-3333-333333333333"
    private val session = AuthSession("token", "refresh", 9_999_999_999L, AuthUser(me, null, null, null, null))
    private val auth = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun loadsCompletedDealReviewContextBoundToCurrentActor() = runBlocking {
        val transport = ReviewQueueTransport(response(200, JSONObject("""{
          "dealId":"$deal","reviewerId":"$me","revieweeId":"$other",
          "reviewee":{"id":"$other","displayName":"سلمى","username":"salma","avatarUrl":null},
          "existingReview":null
        }""")))

        val result = OracleReviewRepository(auth, transport).load(session, deal) as ReviewResult.Success

        assertEquals("سلمى", result.value.reviewee.displayName)
        assertNull(result.value.existingReview)
        assertEquals("/v1/reviews/deals/$deal", transport.requests.single().path)
    }

    @Test
    fun submitUsesExactIdentityBoundReviewContract() = runBlocking {
        val transport = ReviewQueueTransport(response(201, JSONObject().put("ok", true)))
        val repository = OracleReviewRepository(auth, transport)
        val context = DealReviewContext(deal, me, Reviewee(other, "سلمى", "salma", null), null)
        val draft = ReviewDraft(
            rating = 5,
            comment = "  تجربة ممتازة  ",
            clearDescription = true,
            goodCommunication = true,
            onTime = false,
            respectfulSwapper = true,
        )

        val result = repository.submit(session, context, draft)

        assertTrue(result is ReviewResult.Success)
        val request = transport.requests.single()
        val body = requireNotNull(request.body)
        assertEquals("/v1/reviews", request.path)
        assertEquals(
            setOf(
                "dealId", "reviewerId", "revieweeId", "rating", "comment",
                "clearDescription", "goodCommunication", "onTime", "respectfulSwapper",
            ),
            body.keys().asSequence().toSet(),
        )
        assertEquals(me, body.getString("reviewerId"))
        assertEquals(other, body.getString("revieweeId"))
        assertEquals("تجربة ممتازة", body.getString("comment"))
    }

    private fun response(status: Int, body: JSONObject) = OracleTransportResult.Response(OracleResponse(status, body))
}

private class ReviewQueueTransport(vararg values: OracleTransportResult) : OracleTransport {
    private val remaining = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()
    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return remaining.removeFirst()
    }
}
