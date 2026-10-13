"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ActionResult } from "@/actions";

type Ctx = { toast: (msg: string, kind?: "ok" | "err") => void; report: (r: ActionResult, fallback?: string) => boolean };
const ToastCtx = createContext<Ctx>({ toast: () => {}, report: () => true });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: "ok" | "err" }[]>([]);
  const n = useRef(0);
  const toast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = ++n.current; setItems(x => [...x, { id, msg, kind }]);
    setTimeout(() => setItems(x => x.filter(i => i.id !== id)), kind === "err" ? 6000 : 2800);
  }, []);
  const report = useCallback((r: ActionResult, fallback?: string) => { if (r.ok) { if (r.message || fallback) toast(r.message || fallback!); return true; } toast(r.error, "err"); return false; }, [toast]);
  return (
    <ToastCtx.Provider value={{ toast, report }}>
      {children}
      <div className="fixed left-1/2 bottom-5 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none" aria-live="polite">
        {items.map(i => <div key={i.id} className={`px-4 py-2.5 rounded-lg text-[14px] text-white shadow-lg max-w-[90vw] ${i.kind === "err" ? "bg-red" : "bg-navy"}`}>{i.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
