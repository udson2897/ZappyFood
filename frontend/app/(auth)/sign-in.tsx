import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { colors, spacing, radius, font } from "@/src/theme";
import { useAuth } from "@/src/auth/AuthContext";

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      setError(e.message || "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (kind: "cliente" | "lojista") => {
    if (kind === "cliente") {
      setEmail("cliente@zappyfood.com");
      setPassword("cliente123");
    } else {
      setEmail("lojista@zappyfood.com");
      setPassword("lojista123");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandBox}>
            <View style={styles.logo}>
              <Text style={styles.logoText}>Z</Text>
            </View>
            <Text style={styles.title}>ZappyFood</Text>
            <Text style={styles.subtitle}>Delivery direto do lojista para você</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              testID="sign-in-email"
              style={styles.input}
              placeholder="voce@email.com"
              placeholderTextColor={colors.onSurfaceTertiary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Text style={styles.label}>Senha</Text>
            <TextInput
              testID="sign-in-password"
              style={styles.input}
              placeholder="••••••••"
              placeholderTextColor={colors.onSurfaceTertiary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error && <Text style={styles.error} testID="sign-in-error">{error}</Text>}
            <Pressable
              testID="sign-in-submit"
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={onSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Entrar</Text>
              )}
            </Pressable>

            <View style={styles.demoRow}>
              <Pressable
                testID="sign-in-demo-cliente"
                style={styles.demoBtn}
                onPress={() => fillDemo("cliente")}
              >
                <Text style={styles.demoText}>Usar demo Cliente</Text>
              </Pressable>
              <Pressable
                testID="sign-in-demo-lojista"
                style={styles.demoBtn}
                onPress={() => fillDemo("lojista")}
              >
                <Text style={styles.demoText}>Usar demo Lojista</Text>
              </Pressable>
            </View>

            <Link href="/(auth)/sign-up" asChild>
              <Pressable style={styles.linkRow} testID="sign-in-goto-signup">
                <Text style={styles.linkText}>
                  Não tem conta? <Text style={{ color: colors.brand, fontWeight: "700" }}>Cadastre-se</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  brandBox: { alignItems: "center", marginBottom: spacing.xl },
  logo: {
    width: 72, height: 72, borderRadius: radius.lg,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
    marginBottom: spacing.md,
  },
  logoText: { color: "#fff", fontSize: 40, fontWeight: "800" },
  title: { fontSize: font.size.huge, fontWeight: "800", color: colors.onSurface },
  subtitle: { color: colors.onSurfaceSecondary, marginTop: spacing.xs, fontSize: font.size.base },
  card: { gap: spacing.sm },
  label: { color: colors.onSurfaceSecondary, fontSize: font.size.sm, fontWeight: "600", marginTop: spacing.sm },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    fontSize: font.size.lg, color: colors.onSurface, backgroundColor: colors.surfaceSecondary,
  },
  button: {
    backgroundColor: colors.brand, borderRadius: radius.md,
    paddingVertical: spacing.lg, alignItems: "center", marginTop: spacing.lg,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: font.size.lg },
  error: { color: colors.error, fontSize: font.size.sm, marginTop: spacing.sm },
  demoRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  demoBtn: {
    flex: 1, backgroundColor: colors.brandTertiary,
    borderRadius: radius.md, paddingVertical: spacing.md, alignItems: "center",
  },
  demoText: { color: colors.brand, fontWeight: "600", fontSize: font.size.sm },
  linkRow: { alignItems: "center", marginTop: spacing.lg },
  linkText: { color: colors.onSurfaceSecondary },
});
