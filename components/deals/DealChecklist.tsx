import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { colors } from "@/constants/colors";
import { radii } from "@/constants/radii";
import { spacing } from "@/constants/spacing";

type DealChecklistProps = {
  status: string;
  iConfirmed?: boolean;
  otherConfirmed?: boolean;
  canConfirmCompletion?: boolean;
  requestedItemTitle?: string | null;
  offeredItemTitle?: string | null;
  otherParticipantName?: string | null;
  compact?: boolean;
  alreadyRated?: boolean;
};

type StepState = "completed" | "current" | "inactive";
type Step = { key: string; title: string; description: string; state: StepState };

export function DealChecklist({
  status,
  iConfirmed = false,
  otherConfirmed = false,
  requestedItemTitle,
  offeredItemTitle,
  otherParticipantName,
  compact = false,
  alreadyRated,
}: DealChecklistProps) {
  const safeStatus = status || "coordinating";
  const isCompleted = safeStatus === "completed";
  const isPendingCompletion = safeStatus === "completed_pending_confirmation";
  const isCoordinating = safeStatus === "coordinating";
  const bothConfirmed = iConfirmed && otherConfirmed;

  const confirmDescription =
    isCompleted || bothConfirmed
      ? "الطرفين أكدوا الإتمام."
      : iConfirmed && !otherConfirmed
        ? "تأكيدك اتسجل، مستنيين الطرف التاني."
        : otherConfirmed && !iConfirmed
          ? "الطرف التاني أكد. أكد أنت بعد ما تتأكد إن التبديل تم."
          : "بعد التبديل، كل طرف يضغط تأكيد الإتمام.";

  const detailsDescription =
    requestedItemTitle || offeredItemTitle
      ? `اتأكدوا إن كل طرف فاهم الحاجة اللي هيستلمها والحالة المتفق عليها (${requestedItemTitle ?? "العنصر المطلوب"} ↔ ${offeredItemTitle ?? "العنصر المعروض"}).`
      : "اتأكدوا إن كل طرف فاهم الحاجة اللي هيستلمها والحالة المتفق عليها.";

  const steps: Step[] = [
    {
      key: "details",
      title: "راجعوا تفاصيل التبديل",
      description: detailsDescription,
      state: isPendingCompletion || isCompleted ? "completed" : "current",
    },
    {
      key: "schedule",
      title: "اتفقوا على المكان والميعاد",
      description: otherParticipantName
        ? `استخدموا المحادثة لتحديد مكان واضح ووقت مناسب للطرفين بينك وبين ${otherParticipantName}.`
        : "استخدموا المحادثة لتحديد مكان واضح ووقت مناسب للطرفين.",
      state: isCoordinating ? "current" : "completed",
    },
    {
      key: "safety",
      title: "قابلوا بعض بأمان",
      description:
        "اختاروا مكان عام وواضح. ما تضغطش تأكيد الإتمام غير بعد ما المقايضة تحصل فعلًا.",
      state: isCoordinating || isPendingCompletion ? "current" : "completed",
    },
    {
      key: "confirm",
      title: "تأكيد الإتمام",
      description: confirmDescription,
      state:
        isCompleted || bothConfirmed
          ? "completed"
          : isPendingCompletion
            ? "current"
            : "inactive",
    },
  ];

  if (isCompleted) {
    steps.push({
      key: "review",
      title: "قيّم التجربة",
      description: "التقييم بيساعد المجتمع يعرف الناس الموثوقة.",
      state: alreadyRated ? "completed" : "current",
    });
  }

  return (
    <AppCard>
      <View style={styles.header}>
        <AppText weight="semibold" style={styles.title}>
          قائمة الصفقة
        </AppText>
        <AppText muted>خطوات بسيطة تكملوا بيها التبديل بأمان.</AppText>
      </View>
      <View style={compact ? styles.compactList : styles.list}>
        {steps.map((step) => {
          const iconName =
            step.state === "completed"
              ? "checkmark-circle"
              : step.state === "current"
                ? "ellipse"
                : "ellipse-outline";
          const iconColor =
            step.state === "completed" || step.state === "current"
              ? colors.primary
              : colors.textMuted;

          return (
            <View
              key={step.key}
              style={[
                styles.stepRow,
                step.state === "current" ? styles.currentStep : null,
              ]}
            >
              <Ionicons name={iconName as any} size={18} color={iconColor} style={styles.icon} />
              <View style={styles.stepContent}>
                <AppText
                  weight="semibold"
                  style={step.state === "inactive" ? styles.inactiveText : undefined}
                >
                  {step.title}
                </AppText>
                <AppText muted style={styles.stepDescription}>
                  {step.description}
                </AppText>
              </View>
            </View>
          );
        })}
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.xs, marginBottom: spacing.md },
  title: { fontSize: 17 },
  list: { gap: spacing.sm },
  compactList: { gap: spacing.xs },
  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  currentStep: { backgroundColor: colors.primarySoft },
  icon: { marginTop: 2 },
  stepContent: { flex: 1, gap: spacing.xs },
  stepDescription: { lineHeight: 20 },
  inactiveText: { color: colors.textMuted },
});
