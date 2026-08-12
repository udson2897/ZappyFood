import { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
  Modal, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl } from "@/src/theme";
import { api } from "@/src/lib/api";

type ProductForm = {
  id?: string;
  name: string;
  description: string;
  category: string;
  price: string;
  image_url: string;
  available: boolean;
};

const EMPTY: ProductForm = {
  name: "", description: "", category: "Geral", price: "", image_url: "", available: true,
};

export default function Products() {
  const [products, setProducts] = useState<any[]>([]);
  const [hasStore, setHasStore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const store = await api.myStore();
      if (!store) { setHasStore(false); setLoading(false); return; }
      setHasStore(true);
      const p = await api.myProducts();
      setProducts(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => { setForm(EMPTY); setModalOpen(true); };
  const openEdit = (p: any) => {
    setForm({
      id: p.id, name: p.name, description: p.description || "", category: p.category,
      price: String(p.price), image_url: p.image_url || "", available: p.available,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.name || !form.price) return;
    setSaving(true);
    try {
      const body = {
        name: form.name,
        description: form.description,
        category: form.category || "Geral",
        price: parseFloat(form.price.replace(",", ".")) || 0,
        image_url: form.image_url,
        available: form.available,
        stock: 100,
      };
      if (form.id) await api.updateProduct(form.id, body);
      else await api.createProduct(body);
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteProduct(id);
    load();
  };

  if (loading) {
    return <SafeAreaView style={styles.safe}><ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} /></SafeAreaView>;
  }

  if (!hasStore) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}><Text style={styles.title}>Produtos</Text></View>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Configure sua loja primeiro (aba Loja)</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Produtos</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {products.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="fast-food-outline" size={56} color={colors.onSurfaceTertiary} />
            <Text style={styles.emptyText}>Nenhum produto cadastrado</Text>
          </View>
        ) : (
          products.map((p) => (
            <View key={p.id} style={styles.row} testID={`product-item-${p.id}`}>
              <Image source={{ uri: p.image_url }} style={styles.thumb} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.pName}>{p.name}</Text>
                <Text style={styles.pCat}>{p.category}</Text>
                <Text style={styles.pPrice}>{brl(p.price)}</Text>
              </View>
              <View style={{ gap: spacing.sm }}>
                <Pressable testID={`product-edit-${p.id}`} onPress={() => openEdit(p)} style={styles.iconBtn}>
                  <Ionicons name="create-outline" size={20} color={colors.info} />
                </Pressable>
                <Pressable testID={`product-delete-${p.id}`} onPress={() => remove(p.id)} style={styles.iconBtn}>
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable testID="product-add-fab" style={styles.fab} onPress={openNew}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{form.id ? "Editar produto" : "Novo produto"}</Text>
              <Pressable testID="product-modal-close" onPress={() => setModalOpen(false)}>
                <Ionicons name="close" size={24} color={colors.onSurface} />
              </Pressable>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Field label="Nome" value={form.name} onChange={(t) => setForm({ ...form, name: t })} testID="product-name" />
              <Field label="Descrição" value={form.description} onChange={(t) => setForm({ ...form, description: t })} testID="product-desc" />
              <Field label="Categoria" value={form.category} onChange={(t) => setForm({ ...form, category: t })} testID="product-category" />
              <Field label="Preço (R$)" value={form.price} onChange={(t) => setForm({ ...form, price: t })} keyboardType="decimal-pad" testID="product-price" />
              <Field label="URL da imagem" value={form.image_url} onChange={(t) => setForm({ ...form, image_url: t })} testID="product-image" />
              <View style={styles.switchRow}>
                <Text style={styles.label}>Disponível</Text>
                <Switch value={form.available} onValueChange={(v) => setForm({ ...form, available: v })} trackColor={{ true: colors.brand }} />
              </View>
              <Pressable testID="product-save" style={styles.saveBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Salvar</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Field({ label, value, onChange, keyboardType, testID }: any) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        placeholderTextColor={colors.onSurfaceTertiary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  row: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.md, alignItems: "center" },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  pName: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  pCat: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  pPrice: { color: colors.brand, fontWeight: "700", marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  fab: {
    position: "absolute", right: spacing.lg, bottom: 84,
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  empty: { alignItems: "center", padding: spacing.xxl },
  emptyText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm, fontSize: font.size.lg, textAlign: "center" },
  modalWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  modal: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "88%" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  modalTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: spacing.xs, fontSize: font.size.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontSize: font.size.lg },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.lg },
  saveBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center", marginBottom: spacing.xl },
  saveText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
});
