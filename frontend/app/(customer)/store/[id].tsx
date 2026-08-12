import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl } from "@/src/theme";
import { api } from "@/src/lib/api";
import { useCart } from "@/src/store/cart";

export default function StoreDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { addItem, storeId, storeName, count, subtotal, clear } = useCart();
  const [store, setStore] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.storeDetail(id as string);
        setStore(s);
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading || !store) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const productsByCategory: Record<string, any[]> = {};
  for (const p of store.products || []) {
    productsByCategory[p.category] = productsByCategory[p.category] || [];
    productsByCategory[p.category].push(p);
  }

  const handleAdd = (p: any) => {
    if (storeId && storeId !== store.id) {
      setWarn(true);
      return;
    }
    addItem(store.id, store.fantasy_name, {
      product_id: p.id,
      name: p.name,
      price: p.price,
      image_url: p.image_url,
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View>
          <Image source={{ uri: store.banner_url }} style={styles.banner} contentFit="cover" transition={200} />
          <SafeAreaView edges={["top"]} style={styles.overlayBar}>
            <Pressable style={styles.backBtn} onPress={() => router.back()} testID="store-back">
              <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
            </Pressable>
          </SafeAreaView>
        </View>

        <View style={styles.storeHead}>
          <Text style={styles.title}>{store.fantasy_name}</Text>
          <Text style={styles.desc}>{store.description}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="star" size={14} color={colors.warning} />
            <Text style={styles.metaText}>{(store.rating || 0).toFixed(1)}</Text>
            <Text style={styles.metaText}>• {store.est_delivery_min} min</Text>
            <Text style={styles.metaText}>• Entrega {brl(store.delivery_fee)}</Text>
          </View>
        </View>

        {Object.entries(productsByCategory).map(([cat, items]) => (
          <View key={cat} style={styles.section}>
            <Text style={styles.sectionTitle}>{cat}</Text>
            {items.map((p) => (
              <Pressable
                key={p.id}
                testID={`product-${p.id}`}
                style={styles.productRow}
                onPress={() => handleAdd(p)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{p.name}</Text>
                  <Text style={styles.productDesc} numberOfLines={2}>{p.description}</Text>
                  <Text style={styles.productPrice}>{brl(p.price)}</Text>
                </View>
                <View style={styles.productImgWrap}>
                  <Image source={{ uri: p.image_url }} style={styles.productImg} contentFit="cover" />
                  <View style={styles.plusBtn}>
                    <Ionicons name="add" size={18} color="#fff" />
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      {warn && (
        <View style={styles.warnOverlay} testID="store-switch-modal">
          <View style={styles.warnBox}>
            <Text style={styles.warnTitle}>Nova loja?</Text>
            <Text style={styles.warnText}>
              Você já tem itens de {storeName} no carrinho. Ao adicionar produtos daqui, seu carrinho será esvaziado.
            </Text>
            <View style={styles.warnActions}>
              <Pressable style={styles.warnCancel} onPress={() => setWarn(false)}>
                <Text style={styles.warnCancelText}>Manter</Text>
              </Pressable>
              <Pressable style={styles.warnOk} onPress={() => {
                // Just clear; user needs to tap product again
                clear(); setWarn(false);
              }}>
                <Text style={styles.warnOkText}>Esvaziar carrinho</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {count > 0 && storeId === store.id && (
        <Pressable
          testID="store-cart-cta"
          style={styles.cartBanner}
          onPress={() => router.push("/(customer)/checkout")}
        >
          <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{count}</Text></View>
          <Text style={styles.cartText}>Ver carrinho</Text>
          <Text style={styles.cartTotal}>{brl(subtotal)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  banner: { width: "100%", height: 200, backgroundColor: colors.surfaceTertiary },
  overlayBar: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: spacing.md },
  backBtn: {
    marginTop: spacing.sm, width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center", justifyContent: "center",
  },
  storeHead: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  title: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface },
  desc: { color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontSize: font.size.sm },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  metaText: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  sectionTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface, marginBottom: spacing.md },
  productRow: {
    flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
  },
  productName: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  productDesc: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  productPrice: { color: colors.brand, fontWeight: "700", marginTop: spacing.sm, fontSize: font.size.lg },
  productImgWrap: { position: "relative" },
  productImg: { width: 100, height: 100, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary },
  plusBtn: {
    position: "absolute", right: -8, bottom: -8,
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff",
  },
  cartBanner: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: spacing.lg,
    backgroundColor: colors.brand, borderRadius: radius.md,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  cartBadge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  cartBadgeText: { color: colors.brand, fontWeight: "800" },
  cartText: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  cartTotal: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  warnOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: spacing.xl,
  },
  warnBox: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: "100%" },
  warnTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  warnText: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  warnActions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  warnCancel: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  warnCancelText: { color: colors.onSurface, fontWeight: "700" },
  warnOk: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.md, backgroundColor: colors.brand },
  warnOkText: { color: "#fff", fontWeight: "700" },
});
