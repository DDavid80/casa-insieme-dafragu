# Backend condiviso Google Apps Script

Il file `Code.gs` è il backend del nuovo archivio Google Sheet. Mantiene i dati
nel profilo Google condiviso e richiede una password dell'app prima di esporre
backup, movimenti o impostazioni.

## Pubblicazione

1. Aprire il foglio dati con l'account `DaFraguTravel`.
2. Selezionare **Estensioni → Apps Script**.
3. Sostituire il contenuto di `Code.gs` con il file qui presente e salvare.
4. Da **Distribuisci → Nuova distribuzione**, scegliere **App web**.
5. Eseguire come `DaFraguTravel`; l'accesso deve essere limitato agli utenti che
   useranno davvero la dashboard. Copiare l'URL della distribuzione.

L'URL non contiene dati, ma non va reso pubblico: il backend ospita la
contabilità familiare. Il primo accesso alla dashboard configura la password.

## Struttura dati

- `Dati`: una riga per ogni record; la colonna `dati_json` conserva il formato
  del backup Casa Insieme senza perdere campi o collegamenti.
- `Configurazione`: versione dello schema e parametri tecnici.
- `Registro`: traccia delle modifiche effettuate dall'API.

Il backend accetta e restituisce lo stesso contenitore `CASA_INSIEME_BACKUP`
versione 2 usato dalla dashboard attuale, così il passaggio dei dati è
reversibile e verificabile.
