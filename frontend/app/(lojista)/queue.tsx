import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl, STATUS_LABELS, STATUS_COLORS } from "@/src/theme";
import { api } from "@/src/lib/api";

const NEXT_ACTION: Record<string, { status: string; label: string } | null> = {
  AGUARDANDO_CONFIRMACAO: { status: "ACEITO", label: "Aceitar pedido" },
  ACEITO: { status: "EM_PREPARO", label: "Iniciar preparo" },
  EM_PREPARO: { status: "SAIU_PARA_ENTREGA", label: "Saiu para entrega" },
  SAIU_PARA_ENTREGA: { status: "FINALIZADO", label: "Finalizar" },
  FINALIZADO: null,
  CANCELADO: null,
};

const FILTERS = ["ATIVOS", "AGUARDANDO_CONFIRMACAO", "EM_PREPARO", "FINALIZADO"];

export default function Queue() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("ATIVOS");

  const load = useCallback(async () => {
    try {
      const o = await api.storeOrders();
      setOrders(o);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const advance = async (order: any) => {
    const next = NEXT_ACTION[order.status];
    if (!next) return;
    await api.updateOrderStatus(order.id, next.status);
    load();
  };

  const filtered = orders.filter((o) => {
    if (filter === "ATIVOS") return ["AGUARDANDO_CONFIRMACAO", "ACEITO", "EM_PREPARO", "SAIU_PARA_ENTREGA"].includes(o.status);
    return o.status === filter;
  });

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Fila de Pedidos</Text>
      </View>

      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {FILTERS.map((f) => (
            <Pressable
              key={f}
              testID={`queue-filter-${f}`}
              style={[styles.chip, filter === f && styles.chipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
                {f === "ATIVOS" ? "Ativos" : STATUS_LABELS[f] || f}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Nenhum pedido aqui</Text>
          </View>
        ) : (
          filtered.map((o) => {
            const next = NEXT_ACTION[o.status];
            return (
              <View key={o.id} style={styles.card} testID={`queue-order-${o.id}`}>
                <Pressable onPress={() => router.push(`/(lojista)/order/${o.id}`)}>
                  <View style={styles.cardTop}>
                    <Text style={styles.customer}>{o.customer_name}{o.code ? ` • #${o.code}` : ""}</Text>
                    <View style={[styles.pill, { backgroundColor: (STATUS_COLORS[o.status] || colors.info) + "22" }]}>
                      <Text style={[styles.pillText, { color: STATUS_COLORS[o.status] || colors.info }]}>{STATUS_LABELS[o.status]}</Text>
                    </View>
                  </View>
                  <Text style={styles.items} numberOfLines={2}>
                    {o.items.map((i: any) => `${i.quantity}x ${i.name}`).join(", ")}
                  </Text>
                  <Text style={styles.total}>{brl(o.total)} • {o.payment_method}</Text>
                </Pressable>
                {next && (
                  <View style={styles.actionsRow}>
                    <Pressable
                      testID={`queue-advance-${o.id}`}
                      style={styles.advanceBtn}
                      onPress={() => advance(o)}
                    >
                      <Text style={styles.advanceText}>{next.label}</Text>
                    </Pressable>
                    {o.status === "AGUARDANDO_CONFIRMACAO" && (
                      <Pressable
                        testID={`queue-reject-${o.id}`}
                        style={styles.rejectBtn}
                        onPress={async () => { await api.updateOrderStatus(o.id, "CANCELADO"); load(); }}
                      >
                        <Ionicons name="close" size={20} color={colors.error} />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  chipsWrap: { height: 56, borderBottomWidth: 1, borderBottomColor: colors.divider },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, alignItems: "center" },
  chip: {
    flexShrink: 0, height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { color: colors.onSurface, fontWeight: "600", fontSize: font.size.sm },
  chipTextActive: { color: "#fff" },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  customer: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg, flex: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  pillText: { fontWeight: "700", fontSize: font.size.sm },
  items: { color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  total: { color: colors.onSurface, fontWeight: "700", marginTop: spacing.xs },
  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  advanceBtn: { flex: 1, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center" },
  advanceText: { color: "#fff", fontWeight: "700" },
  rejectBtn: { width: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: font.size.lg },
});
