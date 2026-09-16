package com.teswa.mobile.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NativeRouteParserTest {
    private val id = "11111111-1111-1111-1111-111111111111"

    @Test
    fun parsesInternalCustomAndHttpsRoutes() {
        assertEquals(NativeRoute.Deal(id), NativeRouteParser.parse("/deal/$id"))
        assertEquals(NativeRoute.Direct(id), NativeRouteParser.parse("teswa://direct/$id"))
        assertEquals(NativeRoute.Profile(id), NativeRouteParser.parse("https://teswa.eg/profile/$id?from=push"))
        assertEquals(NativeRoute.Notifications, NativeRouteParser.parse("teswa://notifications"))
    }

    @Test
    fun rejectsForeignHostsUnknownRoutesAndBadIdentifiers() {
        assertNull(NativeRouteParser.parse("https://example.com/deal/$id"))
        assertNull(NativeRouteParser.parse("/admin/$id"))
        assertNull(NativeRouteParser.parse("/deal/not-an-id"))
    }
}
