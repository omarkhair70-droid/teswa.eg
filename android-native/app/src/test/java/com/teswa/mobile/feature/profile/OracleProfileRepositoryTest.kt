package com.teswa.mobile.feature.profile

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.network.OracleHttpMethod
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

class OracleProfileRepositoryTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val listingId = "22222222-2222-2222-2222-222222222222"
    private val session = AuthSession(
        "token",
        "refresh",
        9_999_999_999L,
        AuthUser(userId, "omar@example.com", null, "Omar", null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun loadsProfileThenOwnedListingsAndPreservesNullableFields() = runBlocking {
        val profile = JSONObject(
            """{
              "id":"$userId","displayName":"عمر","username":"omar_k","bio":null,
              "avatarUrl":"https://media.example/avatar.jpg","coverUrl":null,"city":"القاهرة",
              "area":null,"profileTagline":"بحب التبديل","successfulSwapsCount":4,
              "responseRate":92,"createdAt":"2026-09-01T10:00:00Z"
            }""",
        )
        val mine = JSONObject(
            """{"items":[{
              "id":"$listingId","title":"راديو قديم","imageUrl":null,"category":"إلكترونيات",
              "condition":"جيد","city":"القاهرة","area":null,"status":"active",
              "createdAt":"2026-09-15T10:00:00Z","openIncomingOffersCount":2
            }]}""",
        )
        val transport = ProfileQueueTransport(response(200, profile), response(200, mine))
        val repository = OracleProfileRepository(authenticator, transport)

        val result = repository.load(session) as ProfileResult.Success

        assertEquals("عمر", result.value.profile.displayName)
        assertEquals(92, result.value.profile.responseRate)
        assertNull(result.value.profile.bio)
        assertEquals(2, result.value.listings.single().openIncomingOffersCount)
        assertEquals(listOf("/v1/profiles/me", "/v1/marketplace/mine"), transport.requests.map { it.path })
    }

    @Test
    fun updateUsesExactOraclePayloadAndNormalizesOptionalFields() = runBlocking {
        val updated = JSONObject(
            """{
              "id":"$userId","displayName":"عمر خير","username":"omar_k","bio":null,
              "avatarUrl":null,"coverUrl":null,"city":"القاهرة","area":null,
              "profileTagline":"تبديل بهدوء","successfulSwapsCount":4,"responseRate":null,
              "createdAt":"2026-09-01T10:00:00Z"
            }""",
        )
        val transport = ProfileQueueTransport(response(200, updated))
        val repository = OracleProfileRepository(authenticator, transport)

        val result = repository.update(
            session,
            ProfileEditDraft("  عمر خير  ", "OMAR_K", "  تبديل بهدوء  ", "   ", " القاهرة ", ""),
        )

        assertTrue(result is ProfileResult.Success)
        val request = transport.requests.single()
        val body = requireNotNull(request.body)
        assertEquals(OracleHttpMethod.POST, request.method)
        assertEquals("/v1/profiles/update", request.path)
        assertEquals(
            setOf("userId", "displayName", "username", "profileTagline", "bio", "city", "area"),
            body.keys().asSequence().toSet(),
        )
        assertEquals(userId, body.getString("userId"))
        assertEquals("عمر خير", body.getString("displayName"))
        assertEquals("omar_k", body.getString("username"))
        assertEquals("تبديل بهدوء", body.getString("profileTagline"))
        assertTrue(body.isNull("bio"))
        assertTrue(body.isNull("area"))
    }

    @Test
    fun lifecycleBusinessCodeIsReturnedAsAUsefulFailure() = runBlocking {
        val transport = ProfileQueueTransport(response(200, JSONObject().put("code", "has_open_offers")))
        val repository = OracleProfileRepository(authenticator, transport)

        val result = repository.updateListing(session, listingId, ListingAction.ARCHIVE)

        assertTrue(result is ProfileResult.Failure)
        assertTrue((result as ProfileResult.Failure).message.contains("عروض مفتوحة"))
        assertEquals("/v1/marketplace/items/$listingId/archive", transport.requests.single().path)
        assertEquals(0, requireNotNull(transport.requests.single().body).length())
    }

    private fun response(status: Int, body: JSONObject) =
        OracleTransportResult.Response(OracleResponse(status, body))
}

private class ProfileQueueTransport(vararg values: OracleTransportResult) : OracleTransport {
    private val remaining = ArrayDeque(values.toList())
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        return remaining.removeFirst()
    }
}
