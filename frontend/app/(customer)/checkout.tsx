import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, font, brl } from "@/src/theme";
import { useCart } from "@/src/store/cart";
import { api } from "@/src/lib/api";

const PAYMENTS = [
  { id: "PIX", label: "Pix", icon: "flash" as const },
  { id: "CARTAO", label: "Cartão na entrega", icon: "card" as const },
  { id: "DINHEIRO", label: "Dinheiro", icon: "cash" as const },
];

export default function Checkout() {
  const router = useRouter();
  const { lines, storeId, storeName, subtotal, incItem, decItem, removeItem, clear, count } = useCart();
  const [payment, setPayment] = useState<"PIX" | "CARTAO" | "DINHEIRO">("PIX");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deliveryFee = 6.9;
  const total = subtotal + (count > 0 ? deliveryFee : 0);

  const placeOrder = async () => {
    if (!storeId || lines.length === 0) return;
    setError(null);
    setPlacing(true);
    try {
      const order = await api.createOrder({
        store_id: storeId,
        items: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
        payment_method: payment,
        notes,
      });
      clear();
      router.replace(`/(customer)/track/${order.id}`);
    } catch (e: any) {
      setError(e.message || "Falha ao criar pedido");
    } finally {
      setPlacing(false);
    }
  };

  if (count === 0) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="checkout-back">
            <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
          </Pressable>
          <Text style={styles.headerTitle}>Carrinho</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.empty}>
          <Ionicons name="basket-outline" size={64} color={colors.onSurfaceTertiary} />
          <Text style={styles.emptyTitle}>Seu carrinho está vazio</Text>
          <Text style={styles.emptySub}>Escolha uma loja e adicione produtos</Text>
          <Pressable style={styles.emptyBtn} onPress={() => router.replace("/(customer)")}>
            <Text style={styles.emptyBtnText}>Explorar lojas</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="checkout-back">
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }}>
        <Text style={styles.storeLabel}>Loja: <Text style={{ fontWeight: "800" }}>{storeName}</Text></Text>

        <Text style={styles.section}>Itens</Text>
        {lines.map((l) => (
          <View key={l.product_id} style={styles.line} testID={`cart-line-${l.product_id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName}>{l.name}</Text>
              <Text style={styles.linePrice}>{brl(l.price)}</Text>
            </View>
            <View style={styles.qtyBox}>
              <Pressable onPress={() => decItem(l.product_id)} style={styles.qtyBtn} testID={`cart-dec-${l.product_id}`}>
                <Ionicons name="remove" size={16} color={colors.brand} />
              </Pressable>
              <Text style={styles.qtyText}>{l.quantity}</Text>
              <Pressable onPress={() => incItem(l.product_id)} style={styles.qtyBtn} testID={`cart-inc-${l.product_id}`}>
                <Ionicons name="add" size={16} color={colors.brand} />
              </Pressable>
            </View>
            <Pressable onPress={() => removeItem(l.product_id)} style={{ marginLeft: 8 }} testID={`cart-remove-${l.product_id}`}>
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </Pressable>
          </View>
        ))}

        <Text style={styles.section}>Endereço de entrega</Text>
        <View style={styles.addressCard}>
          <Ionicons name="location" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addressTitle}>Endereço principal</Text>
            <Text style={styles.addressSub}>Rua Exemplo, 123 - São Paulo/SP</Text>
          </View>
        </View>

        <Text style={styles.section}>Forma de pagamento</Text>
        {PAYMENTS.map((p) => (
          <Pressable
            key={p.id}
            testID={`payment-${p.id}`}
            style={[styles.paymentRow, payment === p.id && styles.paymentRowActive]}
            onPress={() => setPayment(p.id as any)}
          >
            <Ionicons name={p.icon} size={20} color={payment === p.id ? colors.brand : colors.onSurfaceSecondary} />
            <Text style={[styles.paymentLabel, payment === p.id && { color: colors.brand, fontWeight: "700" }]}>{p.label}</Text>
            <View style={[styles.radio, payment === p.id && styles.radioActive]}>
              {payment === p.id && <View style={styles.radioDot} />}
            </View>
          </Pressable>
        ))}

        <Text style={styles.section}>Observações</Text>
        <TextInput
          testID="checkout-notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Ex: sem cebola, ponto da carne..."
          placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.notesInput}
          multiline
        />

        <View style={styles.summary}>
          <SumRow label="Subtotal" value={brl(subtotal)} />
          <SumRow label="Taxa de entrega" value={brl(deliveryFee)} />
          <View style={styles.divider} />
          <SumRow label="Total" value={brl(total)} bold />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          testID="checkout-confirm"
          style={styles.confirmBtn}
          disabled={placing}
          onPress={placeOrder}
        >
          {placing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.confirmText}>Confirmar pedido • {brl(total)}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SumRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ color: bold ? colors.onSurface : colors.onSurfaceSecondary, fontWeight: bold ? "700" : "500", fontSize: bold ? 16 : 14 }}>{label}</Text>
      <Text style={{ color: bold ? colors.brand : colors.onSurface, fontWeight: bold ? "800" : "600", fontSize: bold ? 18 : 14 }}>{value}</Text>
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
  headerTitle: { fontSize: font.size.lg, fontWeight: "700", color: colors.onSurface },
  storeLabel: { color: colors.onSurfaceSecondary },
  section: { marginTop: spacing.xl, marginBottom: spacing.sm, fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  line: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  lineName: { fontWeight: "700", color: colors.onSurface, fontSize: font.size.lg },
  linePrice: { color: colors.onSurfaceSecondary, marginTop: 2 },
  qtyBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 4 },
  qtyBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  qtyText: { fontWeight: "700", color: colors.onSurface, minWidth: 20, textAlign: "center" },
  addressCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  addressTitle: { fontWeight: "700", color: colors.onSurface },
  addressSub: { color: colors.onSurfaceSecondary, marginTop: 2, fontSize: font.size.sm },
  paymentRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: radius.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  paymentRowActive: { borderColor: colors.brand, backgroundColor: colors.brandTertiary },
  paymentLabel: { flex: 1, color: colors.onSurface, fontSize: font.size.lg },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: colors.brand },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand },
  notesInput: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    minHeight: 80, textAlignVertical: "top", color: colors.onSurface,
  },
  summary: { marginTop: spacing.xl, padding: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  error: { color: colors.error, marginTop: spacing.md, textAlign: "center" },
  footer: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider,
  },
  confirmBtn: { backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: "center" },
  confirmText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  emptyTitle: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface, marginTop: spacing.md },
  emptySub: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  emptyBtn: { marginTop: spacing.xl, backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  emptyBtnText: { color: "#fff", fontWeight: "700" },
});
