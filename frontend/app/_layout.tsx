import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth/AuthContext";
import { CartProvider } from "@/src/store/cart";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const seg0 = segments[0] as string | undefined;
    if (seg0 === "entregador") return; // rota pública do entregador
    const inAuth = seg0 === "(auth)";
    const inCustomer = seg0 === "(customer)";
    const inLojista = seg0 === "(lojista)";
    if (!user && !inAuth) {
      router.replace("/(auth)/sign-in");
      return;
    }
    if (user) {
      const target = user.active_role === "lojista" ? "(lojista)" : "(customer)";
      if (inAuth || (!inCustomer && !inLojista)) {
        router.replace(target === "(lojista)" ? "/(lojista)" : "/(customer)");
        return;
      }
      // If role changed while inside wrong group, redirect
      if (user.active_role === "lojista" && inCustomer) {
        router.replace("/(lojista)");
      } else if (user.active_role !== "lojista" && inLojista) {
        router.replace("/(customer)");
      }
    }
  }, [user, loading, segments, router]);

  if (loading) {
    return (
      <View style={styles.center} testID="app-loading">
        <ActivityIndicator color={colors.brand} size="large" />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <CartProvider>
            <Gate />
          </CartProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
