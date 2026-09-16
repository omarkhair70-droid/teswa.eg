package com.teswa.mobile.feature.profile

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ProfileConnectionsTest {
    @Test
    fun `parser keeps contract fields and deduplicates profiles`() {
        val id = "11111111-1111-1111-1111-111111111111"
        val body = JSONObject().put(
            "items",
            JSONArray()
                .put(
                    JSONObject()
                        .put("profileId", id)
                        .put("displayName", "أحمد")
                        .put("username", "ahmed")
                        .put("avatarUrl", JSONObject.NULL)
                        .put("city", "بني سويف")
                        .put("area", "شرق النيل"),
                )
                .put(JSONObject().put("profileId", id).put("displayName", "مكرر")),
        )

        val rows = requireNotNull(parseProfileConnections(body))

        assertEquals(1, rows.size)
        assertEquals("أحمد", rows.single().displayName)
        assertEquals("ahmed", rows.single().username)
        assertEquals("بني سويف", rows.single().city)
        assertNull(rows.single().avatarUrl)
    }

    @Test
    fun `parser rejects malformed profile identifiers`() {
        val body = JSONObject().put(
            "items",
            JSONArray().put(JSONObject().put("profileId", "not-a-profile-id")),
        )

        assertNull(parseProfileConnections(body))
    }

    @Test
    fun `modes map to existing oracle values`() {
        assertEquals("followers", ProfileConnectionsMode.FOLLOWERS.apiValue)
        assertEquals("following", ProfileConnectionsMode.FOLLOWING.apiValue)
    }
}
