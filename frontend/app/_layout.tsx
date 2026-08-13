import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View, ActivityIndicator, StyleSheet, Platform, Alert, Linking } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth/AuthContext";
import { CartProvider } from "@/src/store/cart";
import { registerForPush } from "@/src/lib/push";
import { colors } from "@/src/theme";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Push: foreground display handler (module scope, before any component)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Push: Android channel (module scope)
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Padrão",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

function Gate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Register device for push whenever a user is present
  useEffect(() => {
    if (user) registerForPush(user.id);
  }, [user]);

  useEffect(() => {
    if (loading) return;
    const seg0 = segments[0] as string | undefined;
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
  const router = useRouter();

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Push: tap handlers (warm + cold start) and denied-permission nudge
  useEffect(() => {
    if (Platform.OS === "web") return;

    const openFromData = (data: any) => {
      if (!data) return;
      const url = data.deeplink || data.action_url;
      if (url) {
        if (url.startsWith("http")) Linking.openURL(url);
        else router.push(url);
      } else if (data.order_id) {
        router.push(`/(customer)/track/${data.order_id}`);
      }
    };

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      openFromData(response.notification.request.content.data || {});
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openFromData(response.notification.request.content.data || {});
    });

    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
      Alert.alert(
        "Ativar notificações",
        "Ative as notificações para acompanhar seus pedidos em tempo real.",
        [
          { text: "Agora não", style: "cancel", onPress: () => AsyncStorage.setItem("pushNudgeAt", String(Date.now())) },
          { text: "Abrir Ajustes", onPress: () => { AsyncStorage.setItem("pushNudgeAt", String(Date.now())); Linking.openSettings(); } },
        ],
      );
    })();

    return () => { tapSub.remove(); };
  }, [router]);

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
