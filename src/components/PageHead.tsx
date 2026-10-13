export function PageHead({ title, lede, right, count }: { title: string; lede?: string; right?: React.ReactNode; count?: string }) {
  return (
    <div className="flex flex-wrap justify-between items-end gap-4 mb-6">
      <div><h1>{title}{count && <span className="ml-3 text-[15px] font-body font-normal text-ink3 tracking-normal">{count}</span>}</h1>{lede && <p className="lede">{lede}</p>}</div>
      {right && <div className="flex flex-wrap gap-2 items-center">{right}</div>}
    </div>
  );
}
