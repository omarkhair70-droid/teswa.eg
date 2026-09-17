package com.teswa.mobile.lab.offer

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp

/**
 * Disposable P2 design lab.
 *
 * This file is debug-only on purpose. It does not call Oracle, does not replace the current
 * OfferCreationScreen, and is not part of the release path. Its only job is to render the
 * authored Pair Field composition described in docs/phase01.
 */
enum class StructuredOfferLabState {
    Entry,
    SelectingMine,
    PairFormed,
    WithMessage,
    Sending,
    Pending,
    NoEligibleMine,
    Conflict,
}

data class OfferLabItem(
    val title: String,
    val owner: String,
    val condition: String,
    val area: String,
    val openness: String? = null,
)

@Composable
fun StructuredOfferLabScreen(
    state: StructuredOfferLabState,
    modifier: Modifier = Modifier,
) {
    val requested = OfferLabItem(
        title = "كاميرا فيلم ياشيكا قديمة بحالة كويسة وعدسة أصلية",
        owner = "@nour",
        condition = "مستعمل بحالة كويسة",
        area = "بني سويف",
        openness = "مفتوحة لحاجة مفاجئة لو تستاهل",
    )
    val mine = OfferLabItem(
        title = "سماعة Sony WH-1000XM4 مع الجراب الأصلي",
        owner = "من حاجتي",
        condition = "فيها ملاحظات بسيطة",
        area = "بني سويف",
    )

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 18.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(onClick = {}) { Text("رجوع") }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("قدّم عرض", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "حط حاجة من عندك قدام الحاجة اللي عايزها",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        item {
            PairField(
                requested = requested,
                mine = when (state) {
                    StructuredOfferLabState.Entry,
                    StructuredOfferLabState.SelectingMine,
                    StructuredOfferLabState.NoEligibleMine -> null
                    else -> mine
                },
                state = state,
            )
        }

        when (state) {
            StructuredOfferLabState.SelectingMine -> item { MineSelectorPreview() }
            StructuredOfferLabState.NoEligibleMine -> item { NoEligibleMinePanel() }
            StructuredOfferLabState.Conflict -> item { ConflictPanel() }
            else -> Unit
        }

        if (state == StructuredOfferLabState.WithMessage) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("رسالة مع العرض", style = MaterialTheme.typography.titleMedium)
                    OutlinedTextField(
                        value = "حالته كويسة جدًا ومتاح أقابلك بعد العصر.",
                        onValueChange = {},
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3,
                        maxLines = 4,
                    )
                }
            }
        } else if (state in setOf(
                StructuredOfferLabState.PairFormed,
                StructuredOfferLabState.Sending,
            )
        ) {
            item {
                OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                    Text("+ ضيف رسالة")
                }
            }
        }

        item {
            CommitmentFooter(state)
        }
    }
}

@Composable
private fun PairField(
    requested: OfferLabItem,
    mine: OfferLabItem?,
    state: StructuredOfferLabState,
) {
    val border = when (state) {
        StructuredOfferLabState.Pending -> MaterialTheme.colorScheme.primary
        StructuredOfferLabState.Conflict -> MaterialTheme.colorScheme.error
        else -> MaterialTheme.colorScheme.outlineVariant
    }

    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        border = BorderStroke(1.dp, border),
        shape = RoundedCornerShape(28.dp),
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(
                "الحاجة اللي عايزها",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OfferObject(item = requested, dominant = true)

            RelationshipSeam(state = state, formed = mine != null)

            if (mine == null) {
                EmptyMineSlot(noEligible = state == StructuredOfferLabState.NoEligibleMine)
            } else {
                Text(
                    "الحاجة اللي هتقدمها",
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OfferObject(item = mine, dominant = false)
                if (state !in setOf(StructuredOfferLabState.Pending, StructuredOfferLabState.Sending)) {
                    OutlinedButton(onClick = {}, modifier = Modifier.fillMaxWidth()) {
                        Text("غيّر الحاجة")
                    }
                }
            }
        }
    }
}

@Composable
private fun OfferObject(item: OfferLabItem, dominant: Boolean) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(if (dominant) 1.55f else 2.15f)
                .background(
                    MaterialTheme.colorScheme.surfaceVariant,
                    RoundedCornerShape(22.dp),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                if (dominant) "صورة الحاجة المطلوبة" else "صورة حاجتي",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            item.title,
            style = if (dominant) MaterialTheme.typography.titleLarge else MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(item.owner, style = MaterialTheme.typography.bodySmall)
            Text("•", style = MaterialTheme.typography.bodySmall)
            Text(item.condition, style = MaterialTheme.typography.bodySmall)
        }
        Text(
            item.area,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        item.openness?.let {
            Surface(
                shape = RoundedCornerShape(16.dp),
                color = MaterialTheme.colorScheme.secondaryContainer,
            ) {
                Text(
                    it,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 9.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
        }
    }
}

@Composable
private fun RelationshipSeam(state: StructuredOfferLabState, formed: Boolean) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        HorizontalDivider(
            modifier = Modifier.fillMaxWidth(.42f),
            color = when {
                state == StructuredOfferLabState.Conflict -> MaterialTheme.colorScheme.error
                formed -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.outlineVariant
            },
        )
        Text(
            when (state) {
                StructuredOfferLabState.Pending -> "مستني الرد"
                StructuredOfferLabState.Sending -> "بنثبت العرض بينكم…"
                StructuredOfferLabState.Conflict -> "الحالة اتغيرت"
                else -> if (formed) "إنت عايز دي — وبتقدّم دي" else "إنت عايز دي — هتحط إيه قدامها؟"
            },
            style = MaterialTheme.typography.labelLarge,
            color = when (state) {
                StructuredOfferLabState.Pending -> MaterialTheme.colorScheme.primary
                StructuredOfferLabState.Conflict -> MaterialTheme.colorScheme.error
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
        HorizontalDivider(
            modifier = Modifier.fillMaxWidth(.42f),
            color = when {
                state == StructuredOfferLabState.Conflict -> MaterialTheme.colorScheme.error
                formed -> MaterialTheme.colorScheme.primary
                else -> MaterialTheme.colorScheme.outlineVariant
            },
        )
    }
}

@Composable
private fun EmptyMineSlot(noEligible: Boolean) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = .55f)),
        shape = RoundedCornerShape(22.dp),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                if (noEligible) "مفيش حاجة معروضة عندك تنفع للعرض ده" else "اختار حاجة من عندك",
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                if (noEligible) "جهّز حاجة في Mine وحطها في اللعب الأول." else "هنجيب بس الحاجات النشطة اللي ينفع تحطها في عرض.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = {}) {
                Text(if (noEligible) "روح لـ Mine" else "اختار من حاجتي")
            }
        }
    }
}

@Composable
private fun MineSelectorPreview() {
    OutlinedCard(shape = RoundedCornerShape(28.dp)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("من حاجتك المعروضة", style = MaterialTheme.typography.titleLarge)
            Text(
                "الاختيار هنا بس — الإرسال لسه خطوة تانية.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            SelectorRow("Sony WH-1000XM4", "فيها ملاحظات بسيطة")
            SelectorRow("جاكيت جينز أزرق", "مستعمل بحالة كويسة")
            SelectorRow("كيبورد ميكانيكال", "شبه جديد")
        }
    }
}

@Composable
private fun SelectorRow(title: String, subtitle: String) {
    OutlinedCard(onClick = {}, modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().padding(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                Modifier.size(56.dp).background(
                    MaterialTheme.colorScheme.surfaceVariant,
                    RoundedCornerShape(14.dp),
                ),
            )
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleSmall)
                Text(
                    subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text("اختار", style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
private fun NoEligibleMinePanel() {
    Text(
        "الحالة دي بتثبت إن عدم وجود عنصر مؤهل مشكلة Product State، مش error تقني.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun ConflictPanel() {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        color = MaterialTheme.colorScheme.errorContainer,
    ) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("العرض اتغيّر قبل ما يتبعت", fontWeight = FontWeight.SemiBold)
            Text("واحدة من الحاجتين مبقتش بنفس الحالة. حدّث الاختيارات قبل ما تكمل.")
        }
    }
}

@Composable
private fun CommitmentFooter(state: StructuredOfferLabState) {
    when (state) {
        StructuredOfferLabState.Pending -> {
            Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("تابع العرض") }
            Spacer(Modifier.height(6.dp))
            Text(
                "العرض بقى موجود ومستني رد الطرف التاني.",
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        StructuredOfferLabState.Sending -> {
            Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text("جاري تثبيت العرض…") }
        }
        StructuredOfferLabState.PairFormed,
        StructuredOfferLabState.WithMessage -> {
            Button(onClick = {}, modifier = Modifier.fillMaxWidth()) { Text("ابعت عرض التبديل") }
            Spacer(Modifier.height(6.dp))
            Text(
                "الإرسال بيعمل عرض حقيقي؛ صاحب الحاجة يقدر يفكر أو يرفض أو يقبل.",
                modifier = Modifier.fillMaxWidth(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        StructuredOfferLabState.Entry,
        StructuredOfferLabState.SelectingMine,
        StructuredOfferLabState.NoEligibleMine,
        StructuredOfferLabState.Conflict -> {
            Button(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text("ابعت عرض التبديل") }
        }
    }
}

@Composable
private fun RtlLab(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
        MaterialTheme { content() }
    }
}

@Preview(name = "P2 — Entry", showBackground = true, widthDp = 360, heightDp = 800)
@Composable
private fun PreviewEntry() = RtlLab {
    StructuredOfferLabScreen(StructuredOfferLabState.Entry)
}

@Preview(name = "P2 — Pair formed", showBackground = true, widthDp = 360, heightDp = 800)
@Composable
private fun PreviewPairFormed() = RtlLab {
    StructuredOfferLabScreen(StructuredOfferLabState.PairFormed)
}

@Preview(name = "P2 — Pending", showBackground = true, widthDp = 360, heightDp = 800)
@Composable
private fun PreviewPending() = RtlLab {
    StructuredOfferLabScreen(StructuredOfferLabState.Pending)
}

@Preview(name = "P2 — No eligible Mine", showBackground = true, widthDp = 360, heightDp = 800)
@Composable
private fun PreviewNoEligibleMine() = RtlLab {
    StructuredOfferLabScreen(StructuredOfferLabState.NoEligibleMine)
}
