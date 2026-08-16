import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font } from "@/src/theme";
import { api } from "@/src/lib/api";

const EMPTY = { id: undefined as string | undefined, name: "", cpf: "", plate: "" };

export default function Couriers() {
  const router = useRouter();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setList(await api.couriers()); } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    if (!form.name || !form.cpf || !form.plate) return;
    setSaving(true);
    try {
      const body = { name: form.name, cpf: form.cpf, plate: form.plate };
      if (form.id) await api.updateCourier(form.id, body);
      else await api.createCourier(body);
      setOpen(false); setForm({ ...EMPTY }); load();
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="couriers-back"><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.headerTitle}>Entregadores</Text>
        <Pressable onPress={() => router.push("/(lojista)/courier-report")} testID="couriers-report-link"><Ionicons name="cash-outline" size={22} color={colors.brand} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        {loading ? <ActivityIndicator color={colors.brand} /> : list.length === 0 ? (
          <View style={styles.empty}><Ionicons name="bicycle-outline" size={56} color={colors.onSurfaceTertiary} /><Text style={styles.emptyText}>Nenhum entregador cadastrado</Text></View>
        ) : list.map((c) => (
          <View key={c.id} style={styles.card} testID={`courier-${c.id}`}>
            <View style={styles.avatar}><Ionicons name="person" size={20} color={colors.brand} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{c.name}</Text>
              <Text style={styles.meta}>CPF {c.cpf} • Placa {c.plate}</Text>
            </View>
            <Pressable testID={`courier-edit-${c.id}`} onPress={() => { setForm({ id: c.id, name: c.name, cpf: c.cpf, plate: c.plate }); setOpen(true); }} style={styles.iconBtn}><Ionicons name="create-outline" size={20} color={colors.info} /></Pressable>
            <Pressable testID={`courier-delete-${c.id}`} onPress={async () => { await api.deleteCourier(c.id); load(); }} style={styles.iconBtn}><Ionicons name="trash-outline" size={20} color={colors.error} /></Pressable>
          </View>
        ))}
        <Pressable testID="courier-add" style={styles.addBtn} onPress={() => { setForm({ ...EMPTY }); setOpen(true); }}>
          <Ionicons name="add" size={20} color={colors.brand} /><Text style={styles.addText}>Cadastrar entregador</Text>
        </Pressable>
      </ScrollView>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{form.id ? "Editar entregador" : "Novo entregador"}</Text>
              <Pressable testID="courier-modal-close" onPress={() => setOpen(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            </View>
            <Text style={styles.label}>Nome</Text>
            <TextInput testID="courier-name" style={styles.input} value={form.name} onChangeText={(t) => setForm({ ...form, name: t })} />
            <Text style={styles.label}>CPF</Text>
            <TextInput testID="courier-cpf" style={styles.input} value={form.cpf} onChangeText={(t) => setForm({ ...form, cpf: t })} keyboardType="number-pad" placeholder="Somente números" placeholderTextColor={colors.onSurfaceTertiary} />
            <Text style={styles.label}>Placa da moto</Text>
            <TextInput testID="courier-plate" style={styles.input} value={form.plate} onChangeText={(t) => setForm({ ...form, plate: t })} autoCapitalize="characters" placeholder="ABC1D23" placeholderTextColor={colors.onSurfaceTertiary} />
            <Pressable testID="courier-save" style={styles.saveBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salvar</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  meta: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brand, borderStyle: "dashed", marginTop: spacing.sm },
  addText: { color: colors.brand, fontWeight: "700", fontSize: font.size.lg },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: font.size.lg },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  modalTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: spacing.xs, marginTop: spacing.sm, fontSize: font.size.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: font.size.lg },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.xl },
  saveText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
});
