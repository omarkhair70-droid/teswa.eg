package com.teswa.mobile.feature.dolab

import android.content.Context
import androidx.core.content.edit

data class PendingDolabPublishLink(
    val dolabItemId: String,
    val publishedItemId: String?,
)

class DolabPublishContextStore(context: Context) {
    private val preferences = context.applicationContext.getSharedPreferences("teswa_dolab_publish_links", Context.MODE_PRIVATE)

    fun begin(userId: String, dolabItemId: String) {
        preferences.edit {
            putString(itemKey(userId), dolabItemId)
            remove(publishedKey(userId))
        }
    }

    fun markListingCreated(userId: String, publishedItemId: String) {
        if (preferences.getString(itemKey(userId), null).isNullOrBlank()) return
        preferences.edit { putString(publishedKey(userId), publishedItemId) }
    }

    fun pending(userId: String): PendingDolabPublishLink? {
        val dolabItemId = preferences.getString(itemKey(userId), null)?.takeIf(String::isNotBlank) ?: return null
        return PendingDolabPublishLink(
            dolabItemId = dolabItemId,
            publishedItemId = preferences.getString(publishedKey(userId), null)?.takeIf(String::isNotBlank),
        )
    }

    fun clear(userId: String) {
        preferences.edit {
            remove(itemKey(userId))
            remove(publishedKey(userId))
        }
    }

    private fun itemKey(userId: String) = "dolab_item_$userId"
    private fun publishedKey(userId: String) = "published_item_$userId"
}
