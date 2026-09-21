package com.teswa.mobile.ui.system

import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Final semantic root worlds for Teswa.
 *
 * These are product realities, not a mirror of the current legacy screen tree.
 * Focused detail/commitment flows sit above these roots and may hide root chrome.
 */
enum class TeswaRootDestination(
    val labelAr: String,
    val accessibilityLabelAr: String,
    val icon: ImageVector,
) {
    POSSIBLE(
        labelAr = "اكتشف",
        accessibilityLabelAr = "اكتشف فرص التبديل",
        icon = TeswaIcons.Explore,
    ),
    MINE(
        labelAr = "دولابي",
        accessibilityLabelAr = "دولابي وحاجاتي",
        icon = TeswaIcons.Mine,
    ),
    BETWEEN_US(
        labelAr = "بيننا",
        accessibilityLabelAr = "العروض والتبديلات والرسائل بينكم",
        icon = TeswaIcons.BetweenUs,
    ),
    ME(
        labelAr = "أنا",
        accessibilityLabelAr = "حسابي وسمعتي وإعداداتي",
        icon = TeswaIcons.Me,
    ),
}

/**
 * Chrome policy keeps navigation behavior consistent across screens.
 */
enum class TeswaChromePolicy {
    Root,
    Focused,
    Immersive,
}

/**
 * Product-level navigation rules. Screen code should not invent new permanent
 * root tabs for actions such as Add, Nearby or Notifications.
 */
object TeswaNavigationPolicy {
    val rootDestinations: List<TeswaRootDestination> = TeswaRootDestination.entries

    const val putIntoPlayLabelAr = "حط حاجة"
    const val notificationsLabelAr = "التنبيهات"

    fun rootChromeVisible(policy: TeswaChromePolicy): Boolean = policy == TeswaChromePolicy.Root
}
