import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, ORDER_FLOW, STATUS_LABELS, STATUS_COLORS } from "@/src/theme";
import { api } from "@/src/lib/api";

export default function Track() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const o = await api.order(id as string);
      setOrder(o);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const currentIdx = ORDER_FLOW.indexOf(order.status);
  const cancelled = order.status === "CANCELADO";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="track-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Acompanhar pedido</Text>
        <Pressable onPress={() => router.push(`/(customer)/chat/${order.id}`)} testID="track-open-chat">
          <Ionicons name="chatbubble-ellipses" size={22} color={colors.brand} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}>
        <View style={styles.card}>
          <Text style={styles.storeName}>{order.store_name}</Text>
          <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[order.status] || colors.info) + "22" }]}>
            <Text style={[styles.pillText, { color: STATUS_COLORS[order.status] || colors.info }]}>
              {STATUS_LABELS[order.status]}
            </Text>
          </View>
        </View>

        {!cancelled ? (
          <View style={styles.timeline}>
            {ORDER_FLOW.map((st, idx) => {
              const done = idx <= currentIdx;
              const active = idx === currentIdx;
              return (
                <View key={st} style={styles.step}>
                  <View style={styles.stepLeft}>
                    <View
                      style={[
                        styles.dot,
                        done && { backgroundColor: colors.brand, borderColor: colors.brand },
                        active && { transform: [{ scale: 1.15 }] },
                      ]}
                    >
                      {done && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                    {idx < ORDER_FLOW.length - 1 && (
                      <View style={[styles.stepLine, done && { backgroundColor: colors.brand }]} />
                    )}
                  </View>
                  <View style={{ flex: 1, paddingBottom: spacing.md }}>
                    <Text style={[styles.stepLabel, done && { color: colors.onSurface, fontWeight: "700" }]}>
                      {STATUS_LABELS[st]}
                    </Text>
                    {active && <Text style={styles.stepHint}>Em andamento agora</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.cancelBox}>
            <Ionicons name="close-circle" size={40} color={colors.error} />
            <Text style={styles.cancelText}>Pedido cancelado</Text>
          </View>
        )}

        <View style={styles.itemsCard}>
          <Text style={styles.sectionTitle}>Resumo</Text>
          {order.items.map((it: any, i: number) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemQty}>{it.quantity}×</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it.name}</Text>
                {it.options && it.options.length > 0 && (
                  <Text style={styles.itemOptions}>{it.options.join(" • ")}</Text>
                )}
              </View>
              <Text style={styles.itemPrice}>{brl(it.line_total)}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <Row label="Subtotal" value={brl(order.subtotal)} />
          <Row label="Entrega" value={brl(order.delivery_fee)} />
          {order.discount > 0 && <Row label="Desconto" value={`- ${brl(order.discount)}`} />}
          {order.points_discount > 0 && <Row label={`Pontos (${order.points_redeemed})`} value={`- ${brl(order.points_discount)}`} />}
          <Row label="Total" value={brl(order.total)} bold />
          <Text style={styles.paymentText}>Pagamento: {order.payment_method}</Text>
          {order.points_earned > 0 && order.status === "FINALIZADO" && (
            <Text style={styles.earnedText}>+{order.points_earned} pontos ganhos 🎉</Text>
          )}
        </View>

        {order.status === "AGUARDANDO_CONFIRMACAO" && (
          <Pressable
            testID="track-cancel"
            style={styles.cancelBtn}
            onPress={async () => {
              await api.updateOrderStatus(order.id, "CANCELADO");
              load();
            }}
          >
            <Text style={styles.cancelBtnText}>Cancelar pedido</Text>
          </Pressable>
        )}

        {order.status === "FINALIZADO" && !order.rating && (
          <View style={styles.ratingBox}>
            <Text style={styles.ratingTitle}>Como foi seu pedido?</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, justifyContent: "center", marginTop: spacing.md }}>
              {[1, 2, 3, 4, 5].map((s) => (
                <Pressable key={s} testID={`rate-${s}`} onPress={async () => { await api.rateOrder(order.id, s); load(); }}>
                  <Ionicons name="star" size={32} color={colors.warning} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.sumRow}>
      <Text style={[styles.sumLabel, bold && { fontWeight: "800", color: colors.onSurface }]}>{label}</Text>
      <Text style={[styles.sumValue, bold && { fontWeight: "800", color: colors.brand, fontSize: 18 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  title: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  card: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  storeName: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  pillText: { fontWeight: "700", fontSize: font.size.sm },
  timeline: { marginVertical: spacing.md },
  step: { flexDirection: "row", gap: spacing.md },
  stepLeft: { alignItems: "center", width: 24 },
  dot: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.borderStrong,
    backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
  },
  stepLine: { width: 2, flex: 1, backgroundColor: colors.borderStrong, minHeight: 24 },
  stepLabel: { color: colors.onSurfaceSecondary, fontSize: font.size.lg },
  stepHint: { color: colors.brand, fontSize: font.size.sm, marginTop: 2 },
  cancelBox: { alignItems: "center", padding: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, marginBottom: spacing.lg },
  cancelText: { color: colors.error, fontWeight: "700", marginTop: spacing.sm, fontSize: font.size.lg },
  itemsCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  sectionTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg, marginBottom: spacing.sm },
  itemRow: { flexDirection: "row", paddingVertical: 4 },
  itemQty: { color: colors.brand, fontWeight: "700", width: 28 },
  itemName: { flex: 1, color: colors.onSurface },
  itemOptions: { color: colors.onSurfaceTertiary, fontSize: font.size.sm, marginTop: 2 },
  itemPrice: { color: colors.onSurface, fontWeight: "600" },
  earnedText: { color: colors.success, fontWeight: "700", marginTop: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  sumLabel: { color: colors.onSurfaceSecondary },
  sumValue: { color: colors.onSurface, fontWeight: "600" },
  paymentText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  cancelBtn: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.error, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  cancelBtnText: { color: colors.error, fontWeight: "700" },
  ratingBox: { marginTop: spacing.xl, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg },
  ratingTitle: { textAlign: "center", fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
});
