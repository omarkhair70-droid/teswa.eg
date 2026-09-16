package com.teswa.mobile.feature.safety

import com.teswa.mobile.core.network.OracleHttpMethod
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ReportingModelsTest {
    @Test fun itemReasonsStayFocusedOnListingSafety() {
        val reasons = reasonsFor(ReportTarget.Item("item-1"))
        assertTrue(ReportReason.MISLEADING_ITEM in reasons)
        assertTrue(ReportReason.FRAUD in reasons)
        assertFalse(ReportReason.NO_SHOW in reasons)
    }
    @Test fun dealReasonsIncludeNoShow() { assertTrue(ReportReason.NO_SHOW in reasonsFor(ReportTarget.Deal("deal-1"))) }
    @Test fun directReportRequestCarriesExactContractIdentifiers() {
        val request = reportRequest(ReportTarget.DirectMessage("conversation-1", "message-1", "user-2"), ReportReason.HARASSMENT, "  تفاصيل  ")
        assertNotNull(request)
        assertEquals(OracleHttpMethod.POST, request.method)
        assertEquals("/v1/moderation/reports/direct-message", request.path)
        assertEquals("conversation-1", request.body?.optString("conversationId"))
        assertEquals("message-1", request.body?.optString("messageId"))
        assertEquals("user-2", request.body?.optString("reportedUserId"))
        assertEquals("harassment", request.body?.optString("reason"))
        assertEquals("تفاصيل", request.body?.optString("details"))
    }
    @Test fun dealMessageUsesDealMessageEndpoint() {
        val request = reportRequest(ReportTarget.DealMessage("deal-1", "message-2"), ReportReason.NO_SHOW, null)
        assertNotNull(request)
        assertEquals("/v1/moderation/reports/deal-message", request.path)
        assertEquals("deal-1", request.body?.optString("dealId"))
        assertEquals("message-2", request.body?.optString("dealMessageId"))
        assertTrue(request.body?.isNull("details") == true)
    }
    @Test fun invalidEmptyTargetIsRejectedBeforeNetwork() { assertNull(reportRequest(ReportTarget.User(""), ReportReason.OTHER, null)) }
    @Test fun targetKeyIsStableAcrossDisplayLabels() {
        assertEquals("user:u1", ReportTarget.User("u1", "أحمد").key)
        assertEquals("item:i1", ReportTarget.Item("i1", "كتاب").key)
    }
}
