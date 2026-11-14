import React, { useState } from 'react';
import { X } from 'lucide-react';

/** A proof thumbnail that opens in an in-app, keyboard and touch friendly viewer. */
export const ProofImage: React.FC<{ src: string; label: string }> = ({ src, label }) => {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)} aria-label={`View ${label.toLowerCase()} picture larger`} className="group text-left">
      <img src={src} alt={`${label} proof`} className="h-24 w-32 rounded-xl border border-slate-200 bg-slate-50 object-cover transition group-hover:brightness-95" />
      <span className="mt-1 block text-xs font-semibold text-slate-600">{label} · tap to enlarge</span>
    </button>
    {open && <div role="dialog" aria-modal="true" aria-label={`${label} proof picture`} onClick={() => setOpen(false)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }} className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-4 sm:p-8">
      <button type="button" autoFocus onClick={() => setOpen(false)} aria-label="Close picture" className="absolute right-4 top-4 z-10 rounded-full bg-white/95 p-3 text-slate-900 shadow-lg"><X className="h-6 w-6" /></button>
      <img src={src} alt={`${label} proof enlarged`} onClick={(event) => event.stopPropagation()} className="max-h-[88dvh] max-w-full rounded-xl object-contain shadow-2xl" />
    </div>}
  </>;
};
