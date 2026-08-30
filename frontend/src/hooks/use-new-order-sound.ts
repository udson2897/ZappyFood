import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAudioPlayer } from "expo-audio";
import { api } from "@/src/lib/api";

const beepSound = require("../../assets/sounds/beep.wav");

/**
 * Polls the store's orders while the screen is focused and plays a beep
 * whenever a brand-new order (status AGUARDANDO_CONFIRMACAO) arrives.
 * Returns the latest orders list + a manual reload so screens can reuse the data.
 */
export function useNewOrderSound(intervalMs = 10000) {
  const player = useAudioPlayer(beepSound);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const poll = useCallback(async () => {
    try {
      const o = await api.storeOrders();
      setOrders(o);
      const pending = o
        .filter((x: any) => x.status === "AGUARDANDO_CONFIRMACAO")
        .map((x: any) => x.id);
      if (primed.current && pending.some((id: string) => !seen.current.has(id))) {
        try { player.seekTo(0); player.play(); } catch {}
      }
      seen.current = new Set(pending);
      primed.current = true;
    } catch {
    } finally {
      setLoading(false);
    }
  }, [player]);

  useFocusEffect(
    useCallback(() => {
      poll();
      const t = setInterval(poll, intervalMs);
      return () => clearInterval(t);
    }, [poll, intervalMs])
  );

  return { orders, loading, reload: poll };
}
