package com.teswa.mobile.feature.additem

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.media.BinaryUploadResult
import com.teswa.mobile.core.media.BinaryUploader
import com.teswa.mobile.core.network.OracleRequest
import com.teswa.mobile.core.network.OracleResponse
import com.teswa.mobile.core.network.OracleTransport
import com.teswa.mobile.core.network.OracleTransportResult
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream

class OracleAddItemRepositoryTest {
    private val session = AuthSession(
        accessToken = "access-token",
        refreshToken = "refresh-token",
        expiresAtEpochSeconds = 9_999_999_999L,
        user = AuthUser("11111111-1111-1111-1111-111111111111", null, null, "مريم", null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }

    @Test
    fun publishesStreamingMediaThenExactOracleListingContract() = runBlocking {
        val transport = PublishTransport()
        val uploads = mutableListOf<Long>()
        val repository = OracleAddItemRepository(
            authenticator = authenticator,
            contentSource = AddItemContentSource { ByteArrayInputStream(byteArrayOf(1, 2, 3)) },
            transport = transport,
            binaryUploader = BinaryUploader { request ->
                uploads += request.sizeBytes
                assertEquals(listOf<Byte>(1, 2, 3), request.openStream().use { it.readBytes().toList() })
                request.onProgress(3, 3)
                BinaryUploadResult.Success
            },
        )
        val draft = validDraft().copy(locationLatitude = 30.0444, locationLongitude = 31.2357)

        val result = repository.publish(session, draft) {}

        assertTrue(result is AddItemResult.Success)
        assertEquals(listOf(3L), uploads)
        assertEquals(
            listOf("/v1/media/uploads", "/v1/media/uploads/complete", "/v1/marketplace/items"),
            transport.requests.map { it.path },
        )
        val body = transport.requests.last().body!!
        assertEquals(
            setOf(
                "itemId", "ownerId", "title", "categoryId", "description", "condition", "conditionNotes",
                "city", "area", "locationLatitude", "locationLongitude", "desireMode", "desireText",
                "itemStory", "swapReason", "goodFor", "images",
            ),
            body.keys().asSequence().toSet(),
        )
        assertTrue(body.isNull("description"))
        assertEquals(30.0444, body.getDouble("locationLatitude"), 0.00001)
        assertEquals(31.2357, body.getDouble("locationLongitude"), 0.00001)
        assertEquals("good_used", body.getString("condition"))
        assertEquals("flexible", body.getString("desireMode"))
        val image = body.getJSONArray("images").getJSONObject(0)
        assertTrue(image.getBoolean("isPrimary"))
        assertEquals(0, image.getInt("sortOrder"))
        assertTrue(image.getString("imageUrl").contains("#teswa-object=item_image:"))
    }

    @Test
    fun cleansGrantedObjectsWhenBinaryUploadFails() = runBlocking {
        val transport = PublishTransport()
        val repository = OracleAddItemRepository(
            authenticator = authenticator,
            contentSource = AddItemContentSource { ByteArrayInputStream(byteArrayOf(1, 2, 3)) },
            transport = transport,
            binaryUploader = BinaryUploader { BinaryUploadResult.Failure(retryable = true) },
        )

        val result = repository.publish(session, validDraft()) {}

        assertTrue(result is AddItemResult.Failure)
        assertTrue((result as AddItemResult.Failure).network)
        assertEquals(listOf("/v1/media/uploads", "/v1/media/objects"), transport.requests.map { it.path })
        assertEquals(1, transport.requests.last().body!!.getJSONArray("objects").length())
    }

    @Test
    fun cancellationAlsoCleansGrantedObjects() = runBlocking {
        val transport = PublishTransport()
        val repository = OracleAddItemRepository(
            authenticator = authenticator,
            contentSource = AddItemContentSource { ByteArrayInputStream(byteArrayOf(1, 2, 3)) },
            transport = transport,
            binaryUploader = BinaryUploader { throw CancellationException("user cancelled") },
        )

        runCatching { repository.publish(session, validDraft()) {} }

        assertEquals(listOf("/v1/media/uploads", "/v1/media/objects"), transport.requests.map { it.path })
    }

    private fun validDraft() = AddItemDraft(
        images = listOf(AddItemImage("content://one", "camera.jpg", "image/jpeg", 3L)),
        title = "كاميرا فيلم",
        categoryId = "22222222-2222-2222-2222-222222222222",
        city = "القاهرة",
    )
}

private class PublishTransport : OracleTransport {
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        val body = when (request.path) {
            "/v1/media/uploads" -> JSONObject().put("uploadUrl", "https://uploads.example/object")
            "/v1/media/uploads/complete" -> {
                val key = request.body!!.getString("objectKey")
                JSONObject().put("objectKey", key).put("publicUrl", "https://media.example/item.jpg#teswa-object=item_image:$key")
            }
            "/v1/media/objects" -> JSONObject().put("deleted", request.body!!.getJSONArray("objects").length())
            "/v1/marketplace/items" -> JSONObject().put("itemId", request.body!!.getString("itemId"))
            else -> error("Unexpected path ${request.path}")
        }
        val status = when (request.path) {
            "/v1/media/uploads" -> 201
            "/v1/marketplace/items" -> 201
            else -> 200
        }
        return OracleTransportResult.Response(OracleResponse(status, body))
    }
}
