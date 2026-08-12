import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";

export default function Profile() {
  const { user, signOut, switchRole } = useAuth();

  const toggle = async () => {
    const target = user?.active_role === "lojista" ? "cliente" : "lojista";
    await switchRole(target as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <View style={styles.userBox}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{user?.name?.[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <Pressable
          testID="profile-switch-role"
          style={styles.switchCard}
          onPress={toggle}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>
              {user?.active_role === "lojista" ? "Modo Lojista ativo" : "Ir para Modo Lojista"}
            </Text>
            <Text style={styles.switchSub}>
              {user?.active_role === "lojista"
                ? "Toque para voltar ao modo Cliente"
                : "Gerencie sua loja e receba pedidos"}
            </Text>
          </View>
          <Ionicons name="swap-horizontal" size={22} color={colors.brand} />
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fidelidade ZappyFood</Text>
          <Text style={styles.loyaltyText}>0 pontos acumulados</Text>
          <Text style={styles.loyaltyHint}>Cada R$ 1,00 gasto = 1 ponto. 100 pontos = R$ 10,00 de desconto.</Text>
        </View>

        <View style={styles.rows}>
          <Row icon="person-outline" label="Dados pessoais" />
          <Row icon="location-outline" label="Meus endereços" />
          <Row icon="heart-outline" label="Favoritos" />
          <Row icon="help-circle-outline" label="Ajuda" />
        </View>

        <Pressable testID="profile-logout" style={styles.logout} onPress={signOut}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Sair da conta</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ icon, label }: { icon: any; label: string }) {
  return (
    <Pressable style={styles.row}>
      <Ionicons name={icon} size={22} color={colors.onSurfaceSecondary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  userBox: { alignItems: "center", padding: spacing.xl },
  avatar: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.md,
  },
  avatarText: { color: "#fff", fontSize: 36, fontWeight: "800" },
  name: { fontSize: font.size.xl, fontWeight: "700", color: colors.onSurface },
  email: { color: colors.onSurfaceSecondary, marginTop: 2 },
  switchCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.brandTertiary, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: colors.brandSecondary,
  },
  switchTitle: { fontWeight: "700", color: colors.brand, fontSize: font.size.lg },
  switchSub: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  sectionTitle: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  loyaltyText: { fontSize: font.size.xl, color: colors.brand, fontWeight: "800", marginTop: spacing.xs },
  loyaltyHint: { color: colors.onSurfaceSecondary, marginTop: 4, fontSize: font.size.sm },
  rows: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  rowLabel: { flex: 1, color: colors.onSurface, fontSize: font.size.lg },
  logout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    marginTop: spacing.xl, paddingVertical: spacing.md,
  },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: font.size.lg },
});
