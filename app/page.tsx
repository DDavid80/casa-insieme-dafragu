"use client";

import { useEffect, useState } from "react";

/**
 * Pagina di emergenza: la dashboard completa e stata accidentalmente
 * sostituita. Questo file evita la pagina bianca e spiega come ripristinare.
 * Il sorgente completo e disponibile nel commit 45b41bcf.
 */
export default function Home() {
  const [status, setStatus] = useState("controllo…");

  useEffect(() => {
    fetch("/api/movements")
      .then((r) => setStatus(r.ok ? "API movimenti raggiungibile" : `API status ${r.status}`))
      .catch((e) => setStatus(`API non raggiungibile: ${e.message}`));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 720, margin: "0 auto", lineHeight: 1.5 }}>
      <h1>Casa Insieme DaFragu — ripristino</h1>
      <p>
        La dashboard e stata sostituita per errore da un componente vuoto.
        Per ripristinarla al 100% esegui sul tuo computer:
      </p>
      <pre style={{ background: "#111", color: "#eee", padding: 16, borderRadius: 8, overflow: "auto" }}>{`git clone https://github.com/DDavid80/casa-insieme-dafragu.git
cd casa-insieme-dafragu
git checkout 45b41bcf7d6c772141449f2b54d849cb25e5637d -- app/page.tsx
git add app/page.tsx
git commit -m "Ripristina dashboard completa"
git push origin main`}</pre>
      <p>
        Oppure scarica il file completo da:
        <br />
        <a href="https://cdn.jsdelivr.net/gh/DDavid80/casa-insieme-dafragu@45b41bcf7d6c772141449f2b54d849cb25e5637d/app/page.tsx">
          page.tsx originale (cdn.jsdelivr)
        </a>
        <br />
        e sostituisci <code>app/page.tsx</code> nel repository.
      </p>
      <p><strong>Stato API:</strong> {status}</p>
      <p style={{ color: "#666", fontSize: 14 }}>
        Dopo il ripristino ricarica la pagina (Ctrl+Shift+R). I dati non passano piu da Google Sheets
        nel frontend: usano le API interne (/api/...). Google Apps Script resta per backup condiviso.
      </p>
    </main>
  );
}
