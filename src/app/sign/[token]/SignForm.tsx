"use client";
import { useEffect, useRef, useState } from "react";
import { signAction } from "./actions";

/** Draw-to-sign pad (pointer events, works on phones) with a typed-name fallback. */
export function SignForm({ token, defaultName, org }: { token: string; defaultName: string; org: string }) {
  const canvas = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const [has, setHas] = useState(false);
  const [name, setName] = useState(defaultName); const [agreed, setAgreed] = useState(false); const [mode, setMode] = useState<"draw" | "type">("draw");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const c = canvas.current; if (!c) return; const r = c.getBoundingClientRect(); c.width = r.width * 2; c.height = 180 * 2; const x = c.getContext("2d")!; x.scale(2, 2); x.lineWidth = 2.2; x.lineCap = "round"; x.lineJoin = "round"; x.strokeStyle = "#0C3C60"; }, [mode]);
  const pos = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const down = (e: React.PointerEvent) => { drawing.current = true; const x = canvas.current!.getContext("2d")!; const [px, py] = pos(e); x.beginPath(); x.moveTo(px, py); canvas.current!.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const x = canvas.current!.getContext("2d")!; const [px, py] = pos(e); x.lineTo(px, py); x.stroke(); setHas(true); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHas(false); };
  const submit = async () => {
    setErr(null); setBusy(true);
    const sig = mode === "draw" ? (has ? canvas.current!.toDataURL("image/png") : "") : name.trim();
    const r = await signAction(token, { name, signatureData: sig, agreed });
    if (!r.ok) { setErr(r.error); setBusy(false); return; }
    window.location.reload();
  };
  return (
    <section className="card-plain mt-6">
      <h2>Sign</h2>
      <label className="label mt-3">Your full name<input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
      <div className="flex gap-2 mt-4 views"><button type="button" className={mode === "draw" ? "on" : ""} onClick={() => setMode("draw")}>Draw signature</button><button type="button" className={mode === "type" ? "on" : ""} onClick={() => setMode("type")}>Type my name instead</button></div>
      {mode === "draw" ? <div className="mt-3"><canvas ref={canvas} className="w-full h-[180px] rounded-[10px] border border-line bg-bg touch-none" style={{ touchAction: "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Signature pad" />
        <div className="flex justify-between items-center mt-2"><span className="meta">Sign with your finger or mouse</span><button type="button" className="btn btn-sm" onClick={clear}>Clear</button></div></div>
        : <div className="mt-3 rounded-[10px] border border-line px-4 py-5 font-head text-[30px] italic">{name || "Your name"}</div>}
      <label className="flex gap-3 items-start mt-5 text-[14.5px]"><input type="checkbox" className="mt-1" checked={agreed} onChange={e => setAgreed(e.target.checked)} /><span>I have read the Authority to Act above and agree to its terms. I understand this electronic signature is legally binding and that {org} will keep a signed copy.</span></label>
      {err && <div className="warn-box mt-4">{err}</div>}
      <button className="btn btn-primary mt-5" disabled={busy || !agreed} onClick={submit}>{busy ? "Signing…" : "Sign and send"}</button>
    </section>
  );
}
