package com.teswa.mobile.feature.safety

import com.teswa.mobile.core.network.OracleHttpMethod
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReportingModelsTest {
    @Test
    fun itemReasonsStayFocusedOnListingSafety() {
        val reasons = reasonsFor(ReportTarget.Item("item-1"))
        assertTrue(ReportReason.MISLEADING_ITEM in reasons)
        assertTrue(ReportReason.FRAUD in reasons)
        assertFalse(ReportReason.NO_SHOW in reasons)
    }

    @Test
    fun dealReasonsIncludeNoShow() {
        assertTrue(ReportReason.NO_SHOW in reasonsFor(ReportTarget.Deal("deal-1")))
    }

    @Test
    fun directReportRequestCarriesExactContractIdentifiers() {
        val request = requireNotNull(
            reportRequest(
                ReportTarget.DirectMessage("conversation-1", "message-1", "user-2"),
                ReportReason.HARASSMENT,
                "  تفاصيل  ",
            ),
        )
        assertEquals(OracleHttpMethod.POST, request.method)
        assertEquals("/v1/moderation/reports/direct-message", request.path)
        assertEquals("conversation-1", request.body?.optString("conversationId"))
        assertEquals("message-1", request.body?.optString("messageId"))
        assertEquals("user-2", request.body?.optString("reportedUserId"))
        assertEquals("harassment", request.body?.optString("reason"))
        assertEquals("تفاصيل", request.body?.optString("details"))
    }

    @Test
    fun contextualMessageUsesContextualMessageEndpoint() {
        val request = requireNotNull(
            reportRequest(
                ReportTarget.ContextualMessage("conversation-3", "message-4", "user-5"),
                ReportReason.HARASSMENT,
                "  إساءة داخل رد القصة  ",
            ),
        )
        assertEquals("/v1/moderation/reports/contextual-message", request.path)
        assertEquals("conversation-3", request.body?.optString("conversationId"))
        assertEquals("message-4", request.body?.optString("contextualMessageId"))
        assertEquals("harassment", request.body?.optString("reason"))
        assertEquals("إساءة داخل رد القصة", request.body?.optString("details"))
        assertTrue(ReportReason.INAPPROPRIATE_CONTENT in reasonsFor(
            ReportTarget.ContextualMessage("c", "m", "u"),
        ))
    }

    @Test
    fun dealMessageUsesDealMessageEndpoint() {
        val request = requireNotNull(
            reportRequest(
                ReportTarget.DealMessage("deal-1", "message-2"),
                ReportReason.NO_SHOW,
                null,
            ),
        )
        assertEquals("/v1/moderation/reports/deal-message", request.path)
        assertEquals("deal-1", request.body?.optString("dealId"))
        assertEquals("message-2", request.body?.optString("dealMessageId"))
        assertTrue(request.body?.isNull("details") == true)
    }

    @Test
    fun invalidEmptyTargetIsRejectedBeforeNetwork() {
        assertNull(reportRequest(ReportTarget.User(""), ReportReason.OTHER, null))
    }

    @Test
    fun targetKeyIsStableAcrossDisplayLabels() {
        assertEquals("user:u1", ReportTarget.User("u1", "أحمد").key)
        assertEquals("item:i1", ReportTarget.Item("i1", "كتاب").key)
    }
}
