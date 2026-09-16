package com.teswa.mobile.feature.profile

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
import org.junit.Assert.assertTrue
import org.junit.Test

class OraclePublicProfileRepositoryTest {
    private val me = "11111111-1111-1111-1111-111111111111"
    private val other = "22222222-2222-2222-2222-222222222222"
    private val item = "33333333-3333-3333-3333-333333333333"
    private val session = AuthSession("token", "refresh", 9_999_999_999L, AuthUser(me, null, null, null, null))
    private val auth = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun loadsPublicProfilePresenceAndRelationshipState() = runBlocking {
        val transport = PublicProfileQueueTransport(
            response(200, JSONObject("""{
              "id":"$other","displayName":"سلمى","username":"salma","bio":null,"avatarUrl":null,
              "coverUrl":null,"city":"الجيزة","area":null,"profileTagline":null,
              "successfulSwapsCount":3,"responseRate":90,"createdAt":"2026-01-01T00:00:00Z"
            }""")),
            response(200, JSONObject("""{"items":[{"id":"$item","title":"كتاب","imageUrl":null,"category":"كتب","city":"الجيزة","area":null}]}""")),
            response(200, JSONObject("""{"followingByMe":true,"followsMe":false,"mutual":false,"followerCount":7,"followingCount":4}""")),
            response(200, JSONObject("""{"blockedByMe":false,"blockedMe":false,"isBlockedEitherDirection":false}""")),
            response(200, JSONObject("""{"metrics":{
              "userId":"$other","successfulSwapsCount":3,"completedDealsCount":4,"cancelledDealsCount":1,
              "totalReviewsReceived":3,"averageRating":4.7,"clearDescriptionCount":2,
              "goodCommunicationCount":3,"onTimeCount":2,"respectfulSwapperCount":3,
              "responseRate":90.5,"avgResponseTimeMinutes":18.0,"trustLevelKey":"reliable_swapper","trustScore":78
            }}""")),
            response(200, JSONObject("""{"items":[{
              "badgeKey":"reliable_swapper","labelAr":"موثوق في التبديل",
              "descriptionAr":"عنده سجل جيد","category":"trust","iconName":null,
              "priority":10,"awardedAt":"2026-09-01T00:00:00Z"
            }]}""")),
        )

        val result = OraclePublicProfileRepository(auth, transport).load(session, other) as ProfileResult.Success

        assertEquals("سلمى", result.value.profile.displayName)
        assertEquals("كتاب", result.value.listings.single().title)
        assertEquals(7, result.value.follow.followerCount)
        assertTrue(result.value.follow.followingByMe)
        assertEquals(78, result.value.trust?.trustScore)
        assertEquals("موثوق في التبديل", result.value.badges.single().labelAr)
        assertEquals(
            listOf(
                "/v1/profiles/$other",
                "/v1/marketplace/owners/$other/active?limit=12",
                "/v1/profiles/$other/follow-state",
                "/v1/profiles/$other/block-state",
                "/v1/profiles/$other/trust",
                "/v1/profiles/$other/badges",
            ),
            transport.requests.map { it.path },
        )
    }

    @Test
    fun followUsesExactActorPayload() = runBlocking {
        val transport = PublicProfileQueueTransport(response(200, JSONObject().put("ok", true)))

        val result = OraclePublicProfileRepository(auth, transport).setFollowing(session, other, true)

        assertTrue(result is ProfileResult.Success)
        val request = transport.requests.single()
        assertEquals("/v1/profiles/$other/follow", request.path)
        assertEquals(setOf("userId"), requireNotNull(request.body).keys().asSequence().toSet())
        assertEquals(me, request.body.getString("userId"))
    }

    private fun response(status: Int, body: JSONObject) = OracleTransportResult.Response(OracleResponse(status, body))
}

private class PublicProfileQueueTransport(vararg values: OracleTransportResult) : OracleTransport {
    private val remaining = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()
    override suspend fun execute(request: OracleRequest): OracleTransportResult { requests += request; return remaining.removeFirst() }
}
