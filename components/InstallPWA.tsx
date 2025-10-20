"use client";
import { useEffect, useState } from "react";

export default function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem("pwa_hint_date");
    const okToShow =
      !seen || Date.now() - Number(seen) > 7 * 24 * 60 * 60 * 1000;

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (okToShow) setShow(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 inset-x-4 z-50 rounded-2xl border border-border bg-background/90 backdrop-blur p-3 md:hidden">
      <div className="flex items-center gap-3">
        <div className="text-sm">Instale o app para acesso mais rápido.</div>
        <div className="ml-auto flex gap-2">
          <button
            className="rounded-lg border px-3 py-1.5 text-sm"
            onClick={() => {
              setShow(false);
              localStorage.setItem("pwa_hint_date", String(Date.now()));
            }}
          >
            Agora não
          </button>
          <button
            className="rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium"
            onClick={async () => {
              deferredPrompt?.prompt();
              await deferredPrompt?.userChoice;
              setShow(false);
              localStorage.setItem("pwa_hint_date", String(Date.now()));
            }}
          >
            Instalar
          </button>
        </div>
      </div>
    </div>
  );
}
