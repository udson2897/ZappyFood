import { useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator,
  Platform, Linking, KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { colors, spacing, radius, font, brl, STATUS_LABELS } from "@/src/theme";
import LiveMap from "@/src/components/LiveMap";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const API = `${BASE}/api`;

export default function Entregador() {
  const [code, setCode] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeStarted, setRouteStarted] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [gpsInfo, setGpsInfo] = useState<string>("");
  const webWatchId = useRef<number | null>(null);
  const nativeWatch = useRef<Location.LocationSubscription | null>(null);

  const search = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setError(null); setLoading(true); setOrder(null); setRouteStarted(false); setFinished(false);
    try {
      const r = await fetch(`${API}/courier/order/${c}`);
      if (!r.ok) { setError("Pedido não encontrado. Verifique o número."); return; }
      const d = await r.json();
      setOrder(d);
      if (d.status === "FINALIZADO") setFinished(true);
    } catch {
      setError("Falha ao buscar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const postLocation = (lat: number, lng: number) => {
    setGpsInfo(`Transmitindo: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    fetch(`${API}/courier/order/${order.code}/location`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng }),
    }).catch(() => {});
  };

  const openGoogleMaps = (lat: number, lng: number) => {
    const url = Platform.select({
      ios: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
      android: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    })!;
    Linking.openURL(url);
  };

  const startRoute = async () => {
    const addr = order?.address;
    if (!addr || addr.lat == null || addr.lng == null) {
      setError("Este pedido não tem coordenadas do cliente.");
      return;
    }
    setRouteStarted(true);
    openGoogleMaps(addr.lat, addr.lng);
    // start GPS streaming
    if (Platform.OS === "web") {
      if (navigator?.geolocation) {
        webWatchId.current = navigator.geolocation.watchPosition(
          (pos) => postLocation(pos.coords.latitude, pos.coords.longitude),
          () => setGpsInfo("GPS negado ou indisponível"),
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
        ) as unknown as number;
      } else {
        setGpsInfo("Navegador sem suporte a GPS");
      }
    } else {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setGpsInfo("Permissão de GPS negada"); return; }
      nativeWatch.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 5000 },
        (pos) => postLocation(pos.coords.latitude, pos.coords.longitude),
      );
    }
  };

  const stopWatch = () => {
    if (webWatchId.current != null && navigator?.geolocation) {
      navigator.geolocation.clearWatch(webWatchId.current);
      webWatchId.current = null;
    }
    if (nativeWatch.current) { nativeWatch.current.remove(); nativeWatch.current = null; }
  };

  useEffect(() => () => stopWatch(), []);

  const finish = async () => {
    setFinishing(true);
    try {
      await fetch(`${API}/courier/order/${order.code}/finish`, { method: "POST" });
      stopWatch();
      setFinished(true);
      setRouteStarted(false);
    } finally {
      setFinishing(false);
    }
  };

  const addr = order?.address;
  const hasCoords = addr && addr.lat != null && addr.lng != null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.logo}><Text style={styles.logoText}>Z</Text></View>
        <View>
          <Text style={styles.title}>ZappyFood Entregas</Text>
          <Text style={styles.subtitle}>Área do entregador</Text>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Número do pedido</Text>
          <View style={styles.searchRow}>
            <TextInput
              testID="courier-code-input"
              style={styles.input}
              placeholder="Ex: A1B2C3"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="characters"
              value={code}
              onChangeText={setCode}
              onSubmitEditing={search}
            />
            <Pressable testID="courier-search" style={styles.searchBtn} onPress={search} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Ionicons name="search" size={22} color="#fff" />}
            </Pressable>
          </View>
          {error && <Text style={styles.error} testID="courier-error">{error}</Text>}

          {order && (
            <View style={styles.card} testID="courier-order-card">
              <View style={styles.rowBetween}>
                <Text style={styles.orderCode}>#{order.code}</Text>
                <View style={styles.statusPill}><Text style={styles.statusText}>{STATUS_LABELS[order.status] || order.status}</Text></View>
              </View>
              <Text style={styles.storeLine}>{order.store?.name} → {order.customer_name}</Text>

              <View style={styles.addrBox}>
                <Ionicons name="location" size={20} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.addrTitle}>Endereço do cliente</Text>
                  {addr ? (
                    <Text style={styles.addrText} testID="courier-address">
                      {addr.street}, {addr.number}{addr.complement ? ` - ${addr.complement}` : ""}{"\n"}
                      {addr.neighborhood} • {addr.city}/{addr.state} {addr.zip ? `• ${addr.zip}` : ""}
                    </Text>
                  ) : (
                    <Text style={styles.addrText}>Endereço não informado</Text>
                  )}
                </View>
              </View>

              <Text style={styles.payLine}>Pagamento: {order.payment_method} • Total {brl(order.total)}</Text>

              {finished ? (
                <View style={styles.doneBox} testID="courier-done">
                  <Ionicons name="checkmark-circle" size={28} color={colors.success} />
                  <Text style={styles.doneText}>Entrega finalizada! Cliente notificado.</Text>
                </View>
              ) : (
                <>
                  {!routeStarted ? (
                    <Pressable
                      testID="courier-start-route"
                      style={[styles.primaryBtn, !hasCoords && { opacity: 0.5 }]}
                      disabled={!hasCoords}
                      onPress={startRoute}
                    >
                      <Ionicons name="navigate" size={20} color="#fff" />
                      <Text style={styles.primaryText}>Iniciar rota</Text>
                    </Pressable>
                  ) : (
                    <>
                      <View style={styles.gpsBadge}>
                        <View style={styles.gpsDot} />
                        <Text style={styles.gpsText}>{gpsInfo || "Ativando GPS..."}</Text>
                      </View>
                      {hasCoords && (
                        <View style={{ marginTop: spacing.md }}>
                          <LiveMap code={order.code} dest={{ lat: addr.lat, lng: addr.lng }} store={order.store} height={260} />
                        </View>
                      )}
                      <Pressable testID="courier-reopen-maps" style={styles.secondaryBtn} onPress={() => openGoogleMaps(addr.lat, addr.lng)}>
                        <Ionicons name="map" size={18} color={colors.brand} />
                        <Text style={styles.secondaryText}>Reabrir Google Maps</Text>
                      </Pressable>
                      <Pressable testID="courier-finish" style={styles.finishBtn} onPress={finish} disabled={finishing}>
                        {finishing ? <ActivityIndicator color="#fff" /> : (
                          <>
                            <Ionicons name="checkmark-done" size={20} color="#fff" />
                            <Text style={styles.primaryText}>Finalizar entrega</Text>
                          </>
                        )}
                      </Pressable>
                    </>
                  )}
                </>
              )}
            </View>
          )}

          {!order && !loading && (
            <View style={styles.hint}>
              <Ionicons name="bicycle-outline" size={48} color={colors.onSurfaceTertiary} />
              <Text style={styles.hintText}>Digite o número do pedido para ver o endereço e iniciar a rota.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  logo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  logoText: { color: "#fff", fontSize: 24, fontWeight: "800" },
  title: { fontSize: font.size.xl, fontWeight: "800", color: colors.onSurface },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: font.size.sm },
  label: { color: colors.onSurfaceSecondary, fontWeight: "600", marginBottom: spacing.xs },
  searchRow: { flexDirection: "row", gap: spacing.sm },
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: font.size.xl, letterSpacing: 2, color: colors.onSurface, backgroundColor: colors.surfaceSecondary, fontWeight: "700" },
  searchBtn: { width: 56, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  error: { color: colors.error, marginTop: spacing.sm },
  card: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderCode: { fontSize: font.size.xxl, fontWeight: "800", color: colors.onSurface, letterSpacing: 1 },
  statusPill: { backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  statusText: { color: colors.brand, fontWeight: "700", fontSize: font.size.sm },
  storeLine: { color: colors.onSurfaceSecondary, marginTop: spacing.xs },
  addrBox: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  addrTitle: { fontWeight: "700", color: colors.onSurface },
  addrText: { color: colors.onSurfaceSecondary, marginTop: 2, lineHeight: 20 },
  payLine: { color: colors.onSurfaceSecondary, marginTop: spacing.sm },
  primaryBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, marginTop: spacing.lg },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: font.size.lg },
  finishBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.success, borderRadius: radius.md, paddingVertical: spacing.lg, marginTop: spacing.md },
  secondaryBtn: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, marginTop: spacing.md },
  secondaryText: { color: colors.brand, fontWeight: "700" },
  gpsBadge: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.lg, backgroundColor: colors.success + "18", padding: spacing.md, borderRadius: radius.md },
  gpsDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  gpsText: { color: colors.onSurface, fontWeight: "600", fontSize: font.size.sm },
  doneBox: { flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.success + "18", borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
  doneText: { color: colors.success, fontWeight: "700", fontSize: font.size.lg, flex: 1 },
  hint: { alignItems: "center", padding: spacing.xxl, marginTop: spacing.lg },
  hintText: { color: colors.onSurfaceSecondary, textAlign: "center", marginTop: spacing.md },
});
