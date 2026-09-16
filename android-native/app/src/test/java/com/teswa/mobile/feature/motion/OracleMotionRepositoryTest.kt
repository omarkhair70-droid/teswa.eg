package com.teswa.mobile.feature.motion

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

class OracleMotionRepositoryTest {
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser("11111111-1111-1111-1111-111111111111", null, null, null, null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun loadsMotionSectionsFromExistingMarketplaceContracts() = runBlocking {
        val transport = MotionQueueTransport(
            response(200, JSONObject("""{"items":[{
              "id":"22222222-2222-2222-2222-222222222222","title":"كاميرا","imageUrl":null,
              "category":"كاميرات","condition":"good_used","location":"بني سويف","ownerDisplayName":"عمر",
              "openInterestCount":3,"latestInterestAt":"2026-09-16T01:00:00Z","hasVideoTeaser":true
            }]}""")),
            response(200, JSONObject("""{"items":[{
              "id":"33333333-3333-3333-3333-333333333333","title":"كتاب","imageUrl":null,
              "category":"كتب","city":"القاهرة","area":"المعادي","ownerId":null,"ownerDisplayName":"سلمى",
              "storyLabel":"حكاية العنصر","storySnippet":"معايا من زمان","createdAt":"2026-09-16T00:00:00Z","hasVideoTeaser":false
            }]}""")),
            response(200, JSONObject("""{"items":[{
              "id":"44444444-4444-4444-4444-444444444444","title":"راديو","description":null,"imageUrl":null,
              "category":"إلكترونيات","condition":"good_used","location":"الجيزة","ownerDisplayName":"مريم",
              "videoDurationMs":12500,"videoCreatedAt":"2026-09-15T23:00:00Z"
            }]}""")),
        )
        val repository = OracleMotionRepository(authenticator, transport)

        val moving = repository.loadMoving(session) as MotionResult.Success
        val stories = repository.loadStoryItems(moving.session) as MotionResult.Success
        val videos = repository.loadVideoDrops(stories.session) as MotionResult.Success

        assertEquals(3, moving.value.single().openInterestCount)
        assertEquals("معايا من زمان", stories.value.single().storySnippet)
        assertEquals(12500, videos.value.single().durationMs)
        assertEquals(
            listOf(
                "/v1/marketplace/moving?limit=12",
                "/v1/marketplace/story-discovery?limit=12",
                "/v1/marketplace/video-discovery?limit=8",
            ),
            transport.requests.map { it.path },
        )
    }

    @Test
    fun cityPulseUsesDiscoveryContractAndNormalizesTerms() = runBlocking {
        val transport = MotionQueueTransport(
            response(200, JSONObject("""{
              "movingItems":[],"storyItems":[],
              "people":[{"id":"55555555-5555-5555-5555-555555555555","displayName":"سلمى","username":"salma","avatarUrl":null,"city":"بني سويف","area":null,"profileTagline":null,"activeItemsCount":2}],
              "activeStoryAuthors":[]
            }""")),
        )
        val repository = OracleMotionRepository(authenticator, transport)

        val result = repository.loadCityPulse(
            session,
            MotionCityLocation("بني سويف", listOf(" بني سويف ", "BENI SUEF", "بني سويف")),
        )

        assertTrue(result is MotionResult.Success)
        result as MotionResult.Success
        assertEquals("سلمى", result.value.people.single().displayName)
        val request = transport.requests.single()
        assertEquals("/v1/discovery/city-pulse", request.path)
        val body = requireNotNull(request.body)
        assertEquals(2, body.getJSONArray("matchTerms").length())
        assertEquals(8, body.getInt("movingItemsLimit"))
        assertEquals(8, body.getInt("storyItemsLimit"))
        assertEquals(8, body.getInt("peopleLimit"))
        assertEquals(10, body.getInt("storyAuthorsLimit"))
    }

    private fun response(status: Int, body: JSONObject) = OracleTransportResult.Response(OracleResponse(status, body))
}

private class MotionQueueTransport(vararg values: OracleTransportResult) : OracleTransport {
    private val values = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return values.removeFirst()
    }
}
