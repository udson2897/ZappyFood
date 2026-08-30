import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useAudioPlayer } from "expo-audio";
import { api } from "@/src/lib/api";

const beepSound = require("../../assets/sounds/beep.wav");

/**
 * Polls the store's orders while the screen is focused and plays a beep
 * whenever a brand-new order (status AGUARDANDO_CONFIRMACAO) arrives.
 * Also tracks the ids of new orders so the UI can highlight them.
 */
export function useNewOrderSound(intervalMs = 10000) {
  const player = useAudioPlayer(beepSound);
  const seen = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState<string[]>([]);

  const poll = useCallback(async () => {
    try {
      const o = await api.storeOrders();
      setOrders(o);
      const pending = o
        .filter((x: any) => x.status === "AGUARDANDO_CONFIRMACAO")
        .map((x: any) => x.id);
      const fresh = pending.filter((id: string) => !seen.current.has(id));
      if (primed.current && fresh.length) {
        try { player.seekTo(0); player.play(); } catch {}
      }
      setNewIds((prev) => {
        // keep only ids that are still pending, then add fresh ones
        let next = prev.filter((id) => pending.includes(id));
        if (primed.current && fresh.length) {
          next = Array.from(new Set([...next, ...fresh]));
        }
        return next;
      });
      seen.current = new Set(pending);
      primed.current = true;
    } catch {
    } finally {
      setLoading(false);
    }
  }, [player]);

  const clearNew = useCallback((id: string) => {
    setNewIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const clearAllNew = useCallback(() => setNewIds([]), []);

  useFocusEffect(
    useCallback(() => {
      poll();
      const t = setInterval(poll, intervalMs);
      return () => clearInterval(t);
    }, [poll, intervalMs])
  );

  return { orders, loading, reload: poll, newIds, newCount: newIds.length, clearNew, clearAllNew };
}
