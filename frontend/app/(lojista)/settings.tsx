import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useAuth } from "@/src/auth/AuthContext";

const STORE_STATUS = [
  { id: "ABERTA", label: "Aberta", color: colors.success },
  { id: "PAUSA", label: "Em pausa", color: colors.warning },
  { id: "FECHADA", label: "Fechada", color: colors.error },
  { id: "FERIAS", label: "Férias", color: colors.info },
];

export default function Settings() {
  const { signOut, switchRole } = useAuth();
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fantasy_name: "", category: "", description: "", phone: "",
    delivery_fee: "", est_delivery_min: "", banner_url: "", logo_url: "",
  });

  const load = useCallback(async () => {
    try {
      const s = await api.myStore();
      setStore(s);
      if (s) {
        setForm({
          fantasy_name: s.fantasy_name || "",
          category: s.category || "",
          description: s.description || "",
          phone: s.phone || "",
          delivery_fee: String(s.delivery_fee ?? ""),
          est_delivery_min: String(s.est_delivery_min ?? ""),
          banner_url: s.banner_url || "",
          logo_url: s.logo_url || "",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!form.fantasy_name || !form.category) return;
    setSaving(true);
    try {
      const saved = await api.saveStore({
        fantasy_name: form.fantasy_name,
        category: form.category,
        description: form.description,
        phone: form.phone,
        delivery_fee: parseFloat(form.delivery_fee.replace(",", ".")) || 0,
        est_delivery_min: parseInt(form.est_delivery_min) || 30,
        min_order: 0,
        banner_url: form.banner_url,
        logo_url: form.logo_url,
      });
      setStore(saved);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (status: string) => {
    await api.storeStatus(status);
    load();
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Minha Loja</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {store && (
            <>
              <Text style={styles.section}>Status da loja</Text>
              <View style={styles.statusRow}>
                {STORE_STATUS.map((s) => (
                  <Pressable
                    key={s.id}
                    testID={`store-status-${s.id}`}
                    style={[styles.statusChip, store.status === s.id && { backgroundColor: s.color, borderColor: s.color }]}
                    onPress={() => setStatus(s.id)}
                  >
                    <Text style={[styles.statusChipText, store.status === s.id && { color: "#fff" }]}>{s.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.section}>Dados da loja</Text>
          <Field label="Nome fantasia" value={form.fantasy_name} onChange={(t: string) => setForm({ ...form, fantasy_name: t })} testID="store-name" />
          <Field label="Categoria" value={form.category} onChange={(t: string) => setForm({ ...form, category: t })} testID="store-category" />
          <Field label="Descrição" value={form.description} onChange={(t: string) => setForm({ ...form, description: t })} testID="store-desc" />
          <Field label="Telefone / WhatsApp" value={form.phone} onChange={(t: string) => setForm({ ...form, phone: t })} testID="store-phone" keyboardType="phone-pad" />
          <Field label="Taxa de entrega (R$)" value={form.delivery_fee} onChange={(t: string) => setForm({ ...form, delivery_fee: t })} testID="store-fee" keyboardType="decimal-pad" />
          <Field label="Tempo estimado (min)" value={form.est_delivery_min} onChange={(t: string) => setForm({ ...form, est_delivery_min: t })} testID="store-time" keyboardType="number-pad" />
          <Field label="URL do banner" value={form.banner_url} onChange={(t: string) => setForm({ ...form, banner_url: t })} testID="store-banner" />
          <Field label="URL do logo" value={form.logo_url} onChange={(t: string) => setForm({ ...form, logo_url: t })} testID="store-logo" />

          <Pressable testID="store-save" style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{store ? "Salvar alterações" : "Criar loja"}</Text>}
          </Pressable>

          <Pressable testID="settings-switch-customer" style={styles.switchBtn} onPress={() => switchRole("cliente")}>
            <Ionicons name="swap-horizontal" size={20} color={colors.brand} />
            <Text style={styles.switchText}>Voltar para modo Cliente</Text>
          </Pressable>

          <Pressable testID="settings-logout" style={styles.logout} onPress={signOut}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
            <Text style={styles.logoutText}>Sair da conta</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, keyboardType, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput testID={testID} style={styles.input} value={value} onChangeText={onChange} keyboardType={keyboardType} placeholderTextColor={colors.onSurfaceTertiary} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  section: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg, marginTop: spacing.md, marginBottom: spacing.md },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  statusChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  statusChipText: { color: colors.onSurface, fontWeight: "600" },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: spacing.xs, fontSize: font.size.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: font.size.lg },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.md },
  saveText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  switchBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandTertiary },
  switchText: { color: colors.brand, fontWeight: "700", fontSize: font.size.lg },
  logout: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.md, paddingVertical: spacing.md },
  logoutText: { color: colors.error, fontWeight: "700", fontSize: font.size.lg },
});
