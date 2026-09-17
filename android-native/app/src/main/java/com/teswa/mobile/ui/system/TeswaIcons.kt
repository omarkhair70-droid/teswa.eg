package com.teswa.mobile.ui.system

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.AddCircle
import androidx.compose.material.icons.rounded.Archive
import androidx.compose.material.icons.rounded.Block
import androidx.compose.material.icons.rounded.ChatBubbleOutline
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Explore
import androidx.compose.material.icons.rounded.Forum
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.Image
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.MoreVert
import androidx.compose.material.icons.rounded.NearMe
import androidx.compose.material.icons.rounded.NotificationsNone
import androidx.compose.material.icons.rounded.PersonOutline
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Place
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Report
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.VerifiedUser
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Single icon authority for production UI.
 *
 * Screens should import semantic icons from here instead of mixing emoji,
 * unicode glyphs, custom one-offs and unrelated Material styles.
 */
object TeswaIcons {
    val Explore: ImageVector = Icons.Rounded.Explore
    val Search: ImageVector = Icons.Rounded.Search
    val Mine: ImageVector = Icons.Rounded.Inventory2
    val BetweenUs: ImageVector = Icons.Rounded.Forum
    val Conversation: ImageVector = Icons.Rounded.ChatBubbleOutline
    val Me: ImageVector = Icons.Rounded.PersonOutline
    val PutIntoPlay: ImageVector = Icons.Rounded.AddCircle
    val Notifications: ImageVector = Icons.Rounded.NotificationsNone

    val Back: ImageVector = Icons.AutoMirrored.Rounded.ArrowBack
    val More: ImageVector = Icons.Rounded.MoreVert
    val Clear: ImageVector = Icons.Rounded.Clear
    val Filter: ImageVector = Icons.Rounded.Tune
    val Location: ImageVector = Icons.Rounded.Place
    val Nearby: ImageVector = Icons.Rounded.NearMe
    val Exchange: ImageVector = Icons.Rounded.SwapHoriz
    val Waiting: ImageVector = Icons.Rounded.Schedule
    val Accepted: ImageVector = Icons.Rounded.CheckCircle

    val Camera: ImageVector = Icons.Rounded.PhotoCamera
    val Gallery: ImageVector = Icons.Rounded.Image
    val Voice: ImageVector = Icons.Rounded.Mic
    val Send: ImageVector = Icons.AutoMirrored.Rounded.Send
    val Edit: ImageVector = Icons.Rounded.Edit
    val Archive: ImageVector = Icons.Rounded.Archive
    val Delete: ImageVector = Icons.Rounded.DeleteOutline
    val Refresh: ImageVector = Icons.Rounded.Refresh
    val Share: ImageVector = Icons.Rounded.Share
    val Like: ImageVector = Icons.Rounded.Favorite
    val LikeOutline: ImageVector = Icons.Rounded.FavoriteBorder
    val Play: ImageVector = Icons.Rounded.PlayArrow
    val Review: ImageVector = Icons.Rounded.Star
    val Trust: ImageVector = Icons.Rounded.VerifiedUser
    val Safety: ImageVector = Icons.Rounded.Shield
    val Report: ImageVector = Icons.Rounded.Report
    val Block: ImageVector = Icons.Rounded.Block
    val Settings: ImageVector = Icons.Rounded.Settings
}
