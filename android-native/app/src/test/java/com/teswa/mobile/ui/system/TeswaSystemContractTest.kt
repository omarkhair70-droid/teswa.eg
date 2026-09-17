package com.teswa.mobile.ui.system

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TeswaSystemContractTest {
    @Test
    fun rootWorldsAreExactlyTheFourProductRealities() {
        val roots = TeswaNavigationPolicy.rootDestinations

        assertEquals(
            listOf(
                TeswaRootDestination.POSSIBLE,
                TeswaRootDestination.MINE,
                TeswaRootDestination.BETWEEN_US,
                TeswaRootDestination.ME,
            ),
            roots,
        )
        assertEquals(listOf("اكتشف", "دولابي", "بيننا", "أنا"), roots.map { it.labelAr })
    }

    @Test
    fun putIntoPlayAndNotificationsAreNotPermanentRootWorlds() {
        val rootLabels = TeswaNavigationPolicy.rootDestinations.map { it.labelAr }

        assertFalse(TeswaNavigationPolicy.putIntoPlayLabelAr in rootLabels)
        assertFalse(TeswaNavigationPolicy.notificationsLabelAr in rootLabels)
        assertTrue(TeswaNavigationPolicy.rootChromeVisible(TeswaChromePolicy.Root))
        assertFalse(TeswaNavigationPolicy.rootChromeVisible(TeswaChromePolicy.Focused))
        assertFalse(TeswaNavigationPolicy.rootChromeVisible(TeswaChromePolicy.Immersive))
    }
}
