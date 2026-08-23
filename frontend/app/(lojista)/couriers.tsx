import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Alert, RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { api } from "@/src/lib/api";

export default function Couriers() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [code, setCode] = useState("");
  const [inviting, setInviting] = useState(false);

  const load = useCallback(async () => {
    try { setList(await api.couriers()); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const invite = async () => {
    const c = code.trim().toUpperCase();
    if (!c) { Alert.alert("Atenção", "Informe o ID do entregador (ex: ZF-8A3K2)."); return; }
    setInviting(true);
    try {
      const r = await api.inviteCourier(c);
      Alert.alert("Convite enviado ✅", `Convite enviado para ${r.courier.name}. Ele precisa aceitar para receber pedidos.`);
      setCode("");
      load();
    } catch (e: any) {
      Alert.alert("Erro", e?.message || "Não foi possível convidar.");
    } finally { setInviting(false); }
  };

  const removeLink = (c: any) => {
    Alert.alert("Remover entregador", `Remover ${c.name} da sua equipe?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: async () => { await api.removeCourierLink(c.id); load(); } },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="couriers-back"><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Entregadores</Text>
        <Pressable onPress={() => router.push("/(lojista)/courier-report")} testID="couriers-report-link"><Ionicons name="cash-outline" size={22} color={colors.brand} /></Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brand} />}
        >
          <View style={styles.inviteBox}>
            <Text style={styles.inviteTitle}>Convidar entregador</Text>
            <Text style={styles.inviteHint}>Peça o ID de identificação do entregador (ex: ZF-8A3K2) e informe abaixo.</Text>
            <View style={styles.inviteRow}>
              <TextInput
                testID="courier-invite-code"
                style={styles.input}
                placeholder="ZF-8A3K2"
                placeholderTextColor={colors.onSurfaceTertiary}
                autoCapitalize="characters"
                value={code}
                onChangeText={setCode}
                onSubmitEditing={invite}
              />
              <Pressable testID="courier-invite-btn" style={styles.inviteBtn} onPress={invite} disabled={inviting}>
                {inviting ? <ActivityIndicator color="#fff" /> : <Text style={styles.inviteBtnText}>Convidar</Text>}
              </Pressable>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Sua equipe</Text>
          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 30 }} />
          ) : list.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={52} color={colors.onSurfaceTertiary} />
              <Text style={styles.emptyText}>Nenhum entregador ainda. Convide pelo ID acima.</Text>
            </View>
          ) : (
            list.map((c) => (
              <View key={c.id} style={styles.card} testID={`courier-row-${c.id}`}>
                <View style={styles.avatar}><Ionicons name="person" size={20} color={colors.brand} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.meta}>{c.courier_code} • Placa {c.plate}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: (c.status === "accepted" ? colors.success : colors.warning) + "22" }]}>
                  <Text style={[styles.statusText, { color: c.status === "accepted" ? colors.success : colors.warning }]}>
                    {c.status === "accepted" ? "Ativo" : "Aguardando aceite"}
                  </Text>
                </View>
                <Pressable testID={`courier-remove-${c.id}`} onPress={() => removeLink(c)} style={styles.iconBtn}><Ionicons name="trash-outline" size={20} color={colors.error} /></Pressable>
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  inviteBox: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg },
  inviteTitle: { fontWeight: "800", color: colors.onSurface, fontSize: font.size.lg },
  inviteHint: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginTop: 4, marginBottom: spacing.md },
  inviteRow: { flexDirection: "row", gap: spacing.sm },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: font.size.lg, color: colors.onSurface, backgroundColor: colors.surface, letterSpacing: 1, fontWeight: "700" },
  inviteBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", minWidth: 100 },
  inviteBtnText: { color: "#fff", fontWeight: "800" },
  sectionTitle: { fontWeight: "800", color: colors.onSurface, fontSize: font.size.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.base },
  meta: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { fontWeight: "700", fontSize: font.size.sm },
  iconBtn: { padding: 6 },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, textAlign: "center" },
});
