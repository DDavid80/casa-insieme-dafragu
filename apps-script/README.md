# Backend condiviso Google Apps Script

Questo backend conserva i dati della dashboard nel foglio Google condiviso di
DaFraguTravel. I record importati restano nel foglio; le password e le sessioni
sono salvate esclusivamente nelle proprietà protette dello script.

## Distribuzione attiva

- Foglio dati: `Casa Insieme DaFragu — Dati condivisi`
- Progetto Apps Script: `Casa Insieme DaFragu — API condivisa`
- Endpoint web: `https://script.google.com/macros/s/AKfycbzDdamH7lUicUX2RzqqlHtKtSUxf9TNSdHjNNtnCGvFjPBkQVS07L3qf_qqrnHjhhGQ7A/exec`

L'endpoint risponde correttamente e richiede ancora la configurazione della
password dell'app al primo accesso. L'URL può essere invocato pubblicamente,
ma backup, dati e modifiche sono protetti dalla password e da token di sessione.

## Struttura dati

- `Dati`: una riga per ogni record, con `dati_json` nel formato originale.
- `Configurazione`: versione dello schema e parametri tecnici.
- `Registro`: traccia delle operazioni effettuate dall'API.

Il backend accetta e restituisce il contenitore `CASA_INSIEME_BACKUP` v2:
l'importazione, le modifiche e un eventuale ripristino restano verificabili.
