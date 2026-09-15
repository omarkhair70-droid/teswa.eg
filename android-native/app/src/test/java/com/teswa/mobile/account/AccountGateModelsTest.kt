package com.teswa.mobile.account

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountGateModelsTest {
    @Test
    fun profileRequiresDisplayNameAndUsername() {
        assertTrue(AccountProfile("1", "Omar", "omarkhair00", null).isComplete)
        assertFalse(AccountProfile("1", "Omar", null, null).isComplete)
        assertFalse(AccountProfile("1", " ", "omarkhair00", null).isComplete)
    }

    @Test
    fun requiredPolicyFingerprintTracksBothCurrentPolicies() {
        assertTrue(RequiredPolicies.FINGERPRINT.contains("terms_of_use:${RequiredPolicies.VERSION}"))
        assertTrue(RequiredPolicies.FINGERPRINT.contains("community_guidelines:${RequiredPolicies.VERSION}"))
    }
}
