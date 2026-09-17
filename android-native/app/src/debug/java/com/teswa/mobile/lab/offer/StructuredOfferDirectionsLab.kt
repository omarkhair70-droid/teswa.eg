package com.teswa.mobile.lab.offer

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/**
 * P2 authored-direction lab.
 *
 * Three deliberately different relationship models rendered from the same fixture.
 * Debug source only: no navigation, repository, Oracle, or release-path ownership.
 */
enum class P2OfferDirection {
    PairObject,
    Crossing,
    Tension,
}

private data class DirectionItem(
    val title: String,
    val owner: String,
    val condition: String,
    val area: String,
    val openness: String? = null,
)

private val requestedFixture = DirectionItem(
    title = "كاميرا فيلم Yashica بعدسة أصلية",
    owner = "@nour",
    condition = "مستعمل بحالة كويسة",
    area = "بني سويف",
    openness = "مفتوحة لحاجة مفاجئة لو تستاهل",
)

private val mineFixture = DirectionItem(
    title = "Sony WH-1000XM4 مع الجراب",
    owner = "من حاجتي",
    condition = "فيها ملاحظات بسيطة",
    area = "بني سويف",
)

@Composable
fun StructuredOfferDirectionScreen(
    direction: P2OfferDirection,
    modifier: Modifier = Modifier,
) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        Column(
            modifier = modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("قدّم عرض", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                Text(
                    when (direction) {
                        P2OfferDirection.PairObject -> "الحاجتين بقوا عرض واحد"
                        P2OfferDirection.Crossing -> "اختار إيه من عندك هيدخل العرض"
                        P2OfferDirection.Tension -> "العرض موجود في العلاقة بين الحاجتين"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            when (direction) {
                P2OfferDirection.PairObject -> PairObjectDirection()
                P2OfferDirection.Crossing -> CrossingDirection()
                P2OfferDirection.Tension -> TensionDirection()
            }

            Spacer(Modifier.weight(1f))

            Button(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                Text("ابعت عرض التبديل")
            }
            Text(
                "الإرسال بيعمل عرض حقيقي ومستني رد الطرف التاني.",
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun PairObjectDirection() {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(30.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("العرض", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            DirectionItemBlock("إنت عايز", requestedFixture, emphasized = true)

            Surface(
                shape = RoundedCornerShape(18.dp),
                color = MaterialTheme.colorScheme.primaryContainer,
            ) {
                Text(
                    "دي ↔ مقابل دي",
                    modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }

            DirectionItemBlock("إنت بتقدّم", mineFixture, emphasized = false)

            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            Text(
                "رسالة اختيارية: حالتها كويسة ومتاح أقابلك بعد العصر.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun CrossingDirection() {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(28.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .45f),
        ) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("POSSIBLE", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                DirectionItemBlock("الحاجة اللي فتحت الاحتمال", requestedFixture, emphasized = true)
            }
        }

        Column(
            modifier = Modifier.fillMaxWidth(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Box(
                Modifier.size(42.dp).background(MaterialTheme.colorScheme.primary, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("↑", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.titleLarge)
            }
            Text(
                "حاجتك دخلت العرض",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
            )
        }

        OutlinedCard(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(28.dp),
            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = .55f)),
        ) {
            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("MINE → BETWEEN US", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                DirectionItemBlock("الحاجة اللي اخترت تحطها", mineFixture, emphasized = false)
            }
        }

        Text(
            "الاختيار نفسه مش الإرسال. لسه تقدر تغيّر الحاجة قبل ما تثبت العرض.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun TensionDirection() {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        DirectionItemBlock("الحاجة اللي عايزها", requestedFixture, emphasized = true)

        Column(
            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            HorizontalDivider(
                modifier = Modifier.fillMaxWidth(.72f),
                color = MaterialTheme.colorScheme.primary,
            )
            Surface(
                shape = RoundedCornerShape(999.dp),
                color = MaterialTheme.colorScheme.primaryContainer,
            ) {
                Text(
                    "عرض متكوّن — لسه مبعتش",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 9.dp),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
            HorizontalDivider(
                modifier = Modifier.fillMaxWidth(.72f),
                color = MaterialTheme.colorScheme.primary,
            )
        }

        DirectionItemBlock("الحاجة اللي بتحطها قصادها", mineFixture, emphasized = false)

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .6f),
        ) {
            Text(
                "مهم: تِسوى مش بتحكم إن القيمتين متساويتين. إنتوا اللي بتقرروا إذا العرض مناسب.",
                modifier = Modifier.padding(12.dp),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
    }
}

@Composable
private fun DirectionItemBlock(
    label: String,
    item: DirectionItem,
    emphasized: Boolean,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier
                    .size(if (emphasized) 86.dp else 72.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(20.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text("صورة", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(
                    item.title,
                    style = if (emphasized) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Text("${item.owner} • ${item.condition}", style = MaterialTheme.typography.bodySmall)
                Text(item.area, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        item.openness?.let {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = .65f)) {
                Text(
                    it,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                )
            }
        }
    }
}

@Preview(name = "P2 A — Pair Object", showBackground = true, widthDp = 390, heightDp = 844)
@Composable
private fun PairObjectPreview() {
    MaterialTheme { StructuredOfferDirectionScreen(P2OfferDirection.PairObject) }
}

@Preview(name = "P2 B — Crossing", showBackground = true, widthDp = 390, heightDp = 844)
@Composable
private fun CrossingPreview() {
    MaterialTheme { StructuredOfferDirectionScreen(P2OfferDirection.Crossing) }
}

@Preview(name = "P2 C — Tension", showBackground = true, widthDp = 390, heightDp = 844)
@Composable
private fun TensionPreview() {
    MaterialTheme { StructuredOfferDirectionScreen(P2OfferDirection.Tension) }
}
