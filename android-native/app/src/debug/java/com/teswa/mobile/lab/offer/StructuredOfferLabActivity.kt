package com.teswa.mobile.lab.offer

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier

/**
 * Debug-only host used to render P2 offer directions on a real Android runtime.
 *
 * It is deliberately isolated from production navigation and Oracle. CI launches this activity
 * three times with a different `direction` intent extra and captures device screenshots.
 */
class StructuredOfferLabActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val direction = runCatching {
            P2OfferDirection.valueOf(intent.getStringExtra("direction") ?: P2OfferDirection.PairObject.name)
        }.getOrDefault(P2OfferDirection.PairObject)

        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    StructuredOfferDirectionScreen(direction = direction)
                }
            }
        }
    }
}
