package com.teswa.mobile.feature.notifications

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushRouteResolverTest {
    private val id = "11111111-1111-1111-1111-111111111111"

    @Test
    fun acceptsKnownExplicitRouteAndRejectsForeignUrl() {
        assertEquals("/deal/$id", PushRouteResolver.resolve(mapOf("route" to "teswa://deal/$id")))
        assertNull(PushRouteResolver.resolve(mapOf("route" to "https://example.com/deal/$id")))
    }

    @Test
    fun resolvesStructuredPayloadInConversationFirstOrder() {
        val data = mapOf(
            "conversationId" to id,
            "dealId" to "22222222-2222-2222-2222-222222222222",
            "itemId" to "33333333-3333-3333-3333-333333333333",
        )

        assertEquals("/direct/$id", PushRouteResolver.resolve(data))
    }

    @Test
    fun rejectsMalformedIdentifiers() {
        assertNull(PushRouteResolver.resolve(mapOf("dealId" to "not-a-uuid")))
        assertNull(PushRouteResolver.resolve(mapOf("actorUserId" to "11111111-1111-1111-1111-11111111111z")))
    }
}
