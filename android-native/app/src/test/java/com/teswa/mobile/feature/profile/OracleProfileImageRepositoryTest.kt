package com.teswa.mobile.feature.profile

import com.teswa.mobile.auth.AuthResult
import com.teswa.mobile.auth.AuthSession
import com.teswa.mobile.auth.AuthUser
import com.teswa.mobile.auth.SessionAuthenticator
import com.teswa.mobile.core.media.BinaryUploadRequest
import com.teswa.mobile.core.media.BinaryUploadResult
import com.teswa.mobile.core.media.BinaryUploader
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
import java.io.ByteArrayInputStream

class OracleProfileImageRepositoryTest {
    private val userId = "11111111-1111-1111-1111-111111111111"
    private val session = AuthSession(
        "token", "refresh", 9_999_999_999L,
        AuthUser(userId, null, null, null, null),
    )
    private val authenticator = SessionAuthenticator { current, _ -> AuthResult.Success(current) }
    private val asset = ProfileImageAsset("content://avatar", "My Avatar.JPG", "image/jpeg", 4)

    @Test
    fun replaceStreamsOwnedImageSavesUrlThenCleansPreviousObject() = runBlocking {
        val transport = ProfileImageTransport(userId)
        val uploader = RecordingProfileUploader()
        val repository = OracleProfileImageRepository(
            authenticator = authenticator,
            contentSource = ProfileImageContentSource { ByteArrayInputStream(byteArrayOf(1, 2, 3, 4)) },
            transport = transport,
            uploader = uploader,
        )
        val oldKey = "profiles/$userId/avatar/old.jpg"

        val result = repository.replace(
            session,
            ProfileImageKind.AVATAR,
            asset,
            "https://media.example/old#teswa-object=profile_image:$oldKey",
        ) {} as ProfileResult.Success

        assertTrue(result.value.imageUrl?.contains("#teswa-object=profile_image:profiles/$userId/avatar/") == true)
        assertTrue(result.value.cleanupComplete)
        assertEquals(4L, uploader.request?.sizeBytes)
        assertEquals(
            listOf("/v1/media/uploads", "/v1/media/uploads/complete", "/v1/profiles/image", "/v1/media/objects"),
            transport.requests.map { it.path },
        )
        val save = requireNotNull(transport.requests[2].body)
        assertEquals(setOf("userId", "kind", "imageUrl"), save.keys().asSequence().toSet())
        assertEquals("avatar", save.getString("kind"))
        val cleanup = requireNotNull(transport.requests[3].body).getJSONArray("objects").getJSONObject(0)
        assertEquals(oldKey, cleanup.getString("objectKey"))
        assertEquals(setOf("purpose", "objectKey"), cleanup.keys().asSequence().toSet())
    }

    @Test
    fun removeClearsProfileBeforeOwnedStorageCleanup() = runBlocking {
        val transport = ProfileImageTransport(userId)
        val repository = OracleProfileImageRepository(
            authenticator,
            ProfileImageContentSource { ByteArrayInputStream(byteArrayOf()) },
            transport,
            RecordingProfileUploader(),
        )
        val current = "https://media.example/cover#teswa-object=profile_image:profiles/$userId/cover/current.jpg"

        val result = repository.remove(session, ProfileImageKind.COVER, current) as ProfileResult.Success

        assertNull(result.value.imageUrl)
        assertEquals(listOf("/v1/profiles/image", "/v1/media/objects"), transport.requests.map { it.path })
        assertTrue(requireNotNull(transport.requests.first().body).isNull("imageUrl"))
    }

    @Test
    fun externalLegacyUrlIsNeverGuessedForDeletion() = runBlocking {
        val transport = ProfileImageTransport(userId)
        val repository = OracleProfileImageRepository(
            authenticator,
            ProfileImageContentSource { ByteArrayInputStream(byteArrayOf()) },
            transport,
            RecordingProfileUploader(),
        )

        repository.remove(session, ProfileImageKind.AVATAR, "https://legacy.example/avatar.jpg")

        assertEquals(listOf("/v1/profiles/image"), transport.requests.map { it.path })
    }
}

private class RecordingProfileUploader : BinaryUploader {
    var request: BinaryUploadRequest? = null
    override suspend fun upload(request: BinaryUploadRequest): BinaryUploadResult {
        this.request = request
        request.openStream().use { assertEquals(4, it.readBytes().size) }
        request.onProgress(request.sizeBytes, request.sizeBytes)
        return BinaryUploadResult.Success
    }
}

private class ProfileImageTransport(private val userId: String) : OracleTransport {
    val requests = mutableListOf<OracleRequest>()

    override suspend fun execute(request: OracleRequest): OracleTransportResult {
        requests += request
        val body = when (request.path) {
            "/v1/media/uploads" -> JSONObject().put("uploadUrl", "https://upload.example/object")
            "/v1/media/uploads/complete" -> {
                val input = requireNotNull(request.body)
                val key = input.getString("objectKey")
                assertTrue(key.startsWith("profiles/$userId/"))
                JSONObject()
                    .put("objectKey", key)
                    .put("publicUrl", "https://media.example/object#teswa-object=profile_image:$key")
            }
            "/v1/profiles/image" -> JSONObject().put("ok", true)
            "/v1/media/objects" -> JSONObject().put("deleted", 1)
            else -> error("Unexpected path ${request.path}")
        }
        val status = if (request.path == "/v1/media/uploads") 201 else 200
        return OracleTransportResult.Response(OracleResponse(status, body))
    }
}
