import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
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
    base_delivery_fee: "", price_per_km: "", max_radius_km: "", free_above: "",
    lat: null as number | null, lng: null as number | null,
  });
  const [gpsLoading, setGpsLoading] = useState(false);

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
          base_delivery_fee: String(s.base_delivery_fee ?? s.delivery_fee ?? ""),
          price_per_km: String(s.price_per_km ?? "1.5"),
          max_radius_km: String(s.max_radius_km ?? "8"),
          free_above: String(s.free_above ?? "0"),
          lat: s.lat ?? null,
          lng: s.lng ?? null,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const useStoreGps = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    setGpsLoading(true);
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setForm((f) => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude }));
    } catch {} finally {
      setGpsLoading(false);
    }
  };

  const save = async () => {
    if (!form.fantasy_name || !form.category) return;
    setSaving(true);
    try {
      const base = parseFloat(form.base_delivery_fee.replace(",", ".")) || 0;
      const saved = await api.saveStore({
        fantasy_name: form.fantasy_name,
        category: form.category,
        description: form.description,
        phone: form.phone,
        delivery_fee: base,
        est_delivery_min: parseInt(form.est_delivery_min) || 30,
        min_order: 0,
        banner_url: form.banner_url,
        logo_url: form.logo_url,
        base_delivery_fee: base,
        price_per_km: parseFloat(form.price_per_km.replace(",", ".")) || 0,
        min_delivery_fee: base,
        max_radius_km: parseFloat(form.max_radius_km.replace(",", ".")) || 8,
        free_above: parseFloat(form.free_above.replace(",", ".")) || 0,
        lat: form.lat,
        lng: form.lng,
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
          <Field label="Tempo estimado base (min)" value={form.est_delivery_min} onChange={(t: string) => setForm({ ...form, est_delivery_min: t })} testID="store-time" keyboardType="number-pad" />
          <Field label="URL do banner" value={form.banner_url} onChange={(t: string) => setForm({ ...form, banner_url: t })} testID="store-banner" />
          <Field label="URL do logo" value={form.logo_url} onChange={(t: string) => setForm({ ...form, logo_url: t })} testID="store-logo" />

          <Text style={styles.section}>Entrega por distância</Text>
          <Text style={styles.helpText}>Taxa automática = taxa base + (km × valor por km), respeitando o raio de atendimento.</Text>
          <Pressable testID="store-use-gps" style={styles.gpsBtn} onPress={useStoreGps} disabled={gpsLoading}>
            {gpsLoading ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="navigate" size={18} color={colors.brand} />}
            <Text style={styles.gpsText}>
              {form.lat != null ? "Localização definida ✓ (tocar para atualizar)" : "Definir localização da loja (GPS)"}
            </Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Taxa base (R$)" value={form.base_delivery_fee} onChange={(t: string) => setForm({ ...form, base_delivery_fee: t })} testID="store-base-fee" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Valor por km (R$)" value={form.price_per_km} onChange={(t: string) => setForm({ ...form, price_per_km: t })} testID="store-per-km" keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Raio de atendimento (km)" value={form.max_radius_km} onChange={(t: string) => setForm({ ...form, max_radius_km: t })} testID="store-radius" keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Frete grátis acima de (R$)" value={form.free_above} onChange={(t: string) => setForm({ ...form, free_above: t })} testID="store-free-above" keyboardType="decimal-pad" />
            </View>
          </View>
          <Text style={styles.helpText}>Deixe o campo de frete grátis em 0 para desativar. Ex: base R$ 5,00 + R$ 1,50/km, então 3 km = R$ 9,50.</Text>


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
  helpText: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, marginBottom: spacing.md },
  gpsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, paddingVertical: spacing.md, marginBottom: spacing.md },
  gpsText: { color: colors.brand, fontWeight: "700" },
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
