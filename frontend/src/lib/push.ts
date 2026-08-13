import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

// Registers this device's native push token for the given user.
// Safe no-op on web. Never throws to callers.
export async function registerForPush(userId: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${BASE}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        platform: Platform.OS,
        device_token: tokenResp.data,
      }),
    });
  } catch {
    // non-blocking
  }
}
