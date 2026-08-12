import React, { createContext, useContext, useState, useCallback } from 'react';

export type CartLine = {
  product_id: string;
  name: string;
  price: number;
  image_url?: string;
  quantity: number;
};

type CartCtx = {
  storeId: string | null;
  storeName: string | null;
  lines: CartLine[];
  addItem: (storeId: string, storeName: string, item: Omit<CartLine, 'quantity'>) => boolean;
  incItem: (product_id: string) => void;
  decItem: (product_id: string) => void;
  removeItem: (product_id: string) => void;
  clear: () => void;
  subtotal: number;
  count: number;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);

  const clear = useCallback(() => {
    setLines([]);
    setStoreId(null);
    setStoreName(null);
  }, []);

  const addItem = (sid: string, sname: string, item: Omit<CartLine, 'quantity'>) => {
    if (storeId && storeId !== sid) {
      return false; // caller must handle confirmation to switch store
    }
    setStoreId(sid);
    setStoreName(sname);
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.product_id === item.product_id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    return true;
  };

  const incItem = (pid: string) =>
    setLines((prev) => prev.map((l) => (l.product_id === pid ? { ...l, quantity: l.quantity + 1 } : l)));
  const decItem = (pid: string) =>
    setLines((prev) =>
      prev
        .map((l) => (l.product_id === pid ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0),
    );
  const removeItem = (pid: string) =>
    setLines((prev) => prev.filter((l) => l.product_id !== pid));

  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const count = lines.reduce((sum, l) => sum + l.quantity, 0);

  return (
    <Ctx.Provider
      value={{ storeId, storeName, lines, addItem, incItem, decItem, removeItem, clear, subtotal, count }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart within CartProvider');
  return v;
}
