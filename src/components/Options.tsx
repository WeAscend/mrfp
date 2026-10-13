"use client";
// Org dropdown options for client components (server components call opts(t.org) directly).
import { createContext, useContext } from "react";
import type { Options } from "@/lib/options";
const Ctx = createContext<Options | null>(null);
export const OptionsProvider = ({ value, children }: { value: Options; children: React.ReactNode }) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;
export function useOptions(): Options { const v = useContext(Ctx); if (!v) throw new Error("OptionsProvider missing"); return v; }
