package com.teswa.mobile.auth

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthSessionTest {
    private val user = AuthUser(
        id = "user-1",
        email = "user@example.com",
        phone = null,
        displayName = "User",
        avatarUrl = null,
    )

    @Test
    fun usableSessionMustClearFifteenSecondSkew() {
        val now = 1_000L
        assertTrue(
            AuthSession("a", "r", now + 16L, user).isUsable(now),
        )
        assertFalse(
            AuthSession("a", "r", now + 15L, user).isUsable(now),
        )
    }

    @Test
    fun missingExpiryIsNotUsable() {
        assertFalse(AuthSession("a", "r", null, user).isUsable(1_000L))
    }
}
