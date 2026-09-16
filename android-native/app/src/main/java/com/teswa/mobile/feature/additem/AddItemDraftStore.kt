package com.teswa.mobile.feature.additem

import android.content.Context
import androidx.core.content.edit
import org.json.JSONArray
import org.json.JSONObject

class AddItemDraftStore(context: Context, private val userId: String) {
    private val preferences = context.getSharedPreferences("teswa_add_item_drafts", Context.MODE_PRIVATE)
    private val key = "draft_$userId"

    fun load(): AddItemDraft {
        val raw = preferences.getString(key, null) ?: return AddItemDraft()
        return runCatching {
            val json = JSONObject(raw)
            val imagesJson = json.optJSONArray("images") ?: JSONArray()
            val images = buildList {
                for (index in 0 until imagesJson.length()) {
                    val image = imagesJson.optJSONObject(index) ?: continue
                    val uri = image.optString("uri")
                    val type = image.optString("contentType")
                    val size = image.optLong("sizeBytes")
                    if (uri.isNotBlank() && type.isNotBlank() && size > 0L) {
                        add(AddItemImage(uri, image.optString("displayName", "item-image.jpg"), type, size))
                    }
                }
            }
            AddItemDraft(
                images = images.take(AddItemDraft.MAX_IMAGES),
                title = json.optString("title"),
                categoryId = json.optString("categoryId").takeIf(String::isNotBlank),
                city = json.optString("city"),
                area = json.optString("area"),
                locationLatitude = json.optDouble("locationLatitude").takeIf { json.has("locationLatitude") && !json.isNull("locationLatitude") && it.isFinite() },
                locationLongitude = json.optDouble("locationLongitude").takeIf { json.has("locationLongitude") && !json.isNull("locationLongitude") && it.isFinite() },
                condition = enumValueOrDefault(json.optString("condition"), ItemCondition.GOOD_USED),
                conditionNotes = json.optString("conditionNotes"),
                description = json.optString("description"),
                itemStory = json.optString("itemStory"),
                swapReason = json.optString("swapReason"),
                goodFor = json.optString("goodFor"),
                desireMode = enumValueOrDefault(json.optString("desireMode"), DesireMode.FLEXIBLE),
                desireText = json.optString("desireText"),
            )
        }.getOrElse {
            clear()
            AddItemDraft()
        }
    }

    fun save(draft: AddItemDraft) {
        val images = JSONArray().apply {
            draft.images.forEach { image ->
                put(
                    JSONObject()
                        .put("uri", image.uri)
                        .put("displayName", image.displayName)
                        .put("contentType", image.contentType)
                        .put("sizeBytes", image.sizeBytes),
                )
            }
        }
        val json = JSONObject()
            .put("images", images)
            .put("title", draft.title)
            .put("categoryId", draft.categoryId ?: "")
            .put("city", draft.city)
            .put("area", draft.area)
            .put("locationLatitude", draft.locationLatitude ?: JSONObject.NULL)
            .put("locationLongitude", draft.locationLongitude ?: JSONObject.NULL)
            .put("condition", draft.condition.name)
            .put("conditionNotes", draft.conditionNotes)
            .put("description", draft.description)
            .put("itemStory", draft.itemStory)
            .put("swapReason", draft.swapReason)
            .put("goodFor", draft.goodFor)
            .put("desireMode", draft.desireMode.name)
            .put("desireText", draft.desireText)
        preferences.edit { putString(key, json.toString()) }
    }

    fun clear() {
        preferences.edit { remove(key) }
    }

    private inline fun <reified T : Enum<T>> enumValueOrDefault(value: String, fallback: T): T {
        return enumValues<T>().firstOrNull { it.name == value } ?: fallback
    }
}
