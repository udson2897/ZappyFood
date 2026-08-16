import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

export default function Dashboard() {
  const router = useRouter();
  const { switchRole } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.dashboard();
      setData(d);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  if (!data?.has_store) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Painel do Lojista</Text>
          <Pressable testID="dash-switch-customer" onPress={() => switchRole("cliente")}>
            <Ionicons name="swap-horizontal" size={22} color={colors.brand} />
          </Pressable>
        </View>
        <View style={styles.emptyStore}>
          <Ionicons name="storefront-outline" size={64} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Você ainda não tem uma loja</Text>
          <Text style={styles.emptySub}>Configure sua loja para começar a vender</Text>
          <Pressable testID="dash-create-store" style={styles.createBtn} onPress={() => router.push("/(lojista)/settings")}>
            <Text style={styles.createBtnText}>Configurar minha loja</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{data.store.fantasy_name}</Text>
          <View style={[styles.statusDot, { backgroundColor: data.store.status === "ABERTA" ? colors.success : colors.error }]} />
        </View>
        <Pressable testID="dash-switch-customer" style={styles.switchBtn} onPress={() => switchRole("cliente")}>
          <Ionicons name="swap-horizontal" size={18} color={colors.brand} />
          <Text style={styles.switchText}>Modo Cliente</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
      >
        <View style={styles.metricsRow}>
          <Metric label="Receita hoje" value={brl(data.revenue_today)} icon="cash" color={colors.success} />
          <Metric label="Pedidos hoje" value={String(data.orders_today)} icon="receipt" color={colors.info} />
        </View>
        <View style={styles.metricsRow}>
          <Metric label="Ativos agora" value={String(data.active_orders)} icon="flame" color={colors.brand} />
          <Metric label="Ticket médio" value={brl(data.avg_ticket)} icon="trending-up" color={colors.warning} />
        </View>

        <Pressable testID="dash-goto-queue" style={styles.bigCard} onPress={() => router.push("/(lojista)/queue")}>
          <View>
            <Text style={styles.bigCardTitle}>Fila de pedidos</Text>
            <Text style={styles.bigCardSub}>{data.active_orders} pedidos aguardando ação</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={32} color={colors.brand} />
        </Pressable>

        <Pressable testID="dash-goto-promotions" style={styles.promoCard} onPress={() => router.push("/(lojista)/promotions")}>
          <View style={styles.promoIcon}>
            <Ionicons name="pricetags" size={22} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigCardTitle}>Cupons / Promoções</Text>
            <Text style={styles.bigCardSub}>Crie descontos nos seus produtos</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.onSurfaceTertiary} />
        </Pressable>

        <Pressable testID="dash-goto-couriers" style={styles.promoCard} onPress={() => router.push("/(lojista)/couriers")}>
          <View style={styles.promoIcon}>
            <Ionicons name="bicycle" size={22} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bigCardTitle}>Entregadores</Text>
            <Text style={styles.bigCardSub}>Cadastre e gerencie sua equipe</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.onSurfaceTertiary} />
        </Pressable>

        <View style={styles.subCard}>
          <View style={styles.subHeader}>
            <Ionicons name="ribbon" size={20} color={colors.brand} />
            <Text style={styles.subTitle}>Assinatura</Text>
          </View>
          <Text style={styles.subPlan}>
            Plano {data.store.subscription?.plan === "monthly" ? "Mensal (R$ 99/mês)" : data.store.subscription?.plan === "trial" ? "Teste grátis" : "Anual"}
          </Text>
          <View style={styles.subBadge}>
            <Text style={styles.subBadgeText}>{data.store.subscription?.status || "ATIVA"}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <View style={styles.metric}>
      <View style={[styles.metricIcon, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
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
  title: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  switchBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill },
  switchText: { color: colors.brand, fontWeight: "700", fontSize: font.size.sm },
  metricsRow: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  metric: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg },
  metricIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  metricValue: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  metricLabel: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 2 },
  bigCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.brandSecondary,
  },
  bigCardTitle: { fontSize: font.size.lg, fontWeight: "800", color: colors.onSurface },
  bigCardSub: { color: colors.onSurfaceSecondary, marginTop: 2 },
  promoCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md },
  promoIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  subCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
  subHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  subTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  subPlan: { color: colors.onSurface, marginTop: spacing.sm, fontSize: font.size.lg, fontWeight: "600" },
  subBadge: { alignSelf: "flex-start", backgroundColor: colors.success + "22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, marginTop: spacing.sm },
  subBadgeText: { color: colors.success, fontWeight: "700", fontSize: font.size.sm },
  emptyStore: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md, textAlign: "center" },
  emptySub: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, textAlign: "center" },
  createBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, marginTop: spacing.xl },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
});
