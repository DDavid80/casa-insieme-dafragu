/**
 * Casa Insieme DaFragu — backend Google Apps Script
 *
 * Questo file è pensato per essere associato al foglio "Casa Insieme DaFragu
 * — Dati condivisi" nel profilo Google condiviso. Non contiene password o
 * dati familiari: le proprietà sensibili restano nello Script Properties.
 */

const SHEETS = {
  records: 'Dati',
  config: 'Configurazione',
  log: 'Registro',
};
const FORMAT = 'CASA_INSIEME_BACKUP';
const VERSION = 2;

function doGet(e) {
  return respond_(dispatch_({ action: (e.parameter || {}).action || 'status', query: e.parameter || {} }));
}

function doPost(e) {
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    return respond_(dispatch_(body));
  } catch (error) {
    return respond_({ ok: false, error: String(error && error.message || error) });
  }
}

function dispatch_(request) {
  const action = String(request.action || 'status');
  if (action === 'status') return { ok: true, configured: Boolean(props_().getProperty('password_hash')), format: FORMAT, version: VERSION };
  if (action === 'setup') return setup_(request);
  if (action === 'unlock') return unlock_(request);
  if (!validSession_(request.token)) return { ok: false, status: 401, error: 'Accesso richiesto' };
  if (action === 'backup:get') return { ok: true, format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), data: readBackup_() };
  if (action === 'backup:restore') return restoreBackup_(request.payload);
  if (action === 'records:list') return { ok: true, records: list_(String(request.collection || '')) };
  if (action === 'records:put') return put_(request);
  if (action === 'records:delete') return remove_(request);
  return { ok: false, status: 400, error: 'Azione non riconosciuta' };
}

function setup_(request) {
  const password = String(request.password || '');
  if (password.length < 8) return { ok: false, status: 400, error: 'La password deve contenere almeno 8 caratteri' };
  const properties = props_();
  if (properties.getProperty('password_hash')) return { ok: false, status: 409, error: 'Accesso già configurato' };
  const salt = Utilities.getUuid();
  properties.setProperties({ password_salt: salt, password_hash: hash_(password, salt) });
  return { ok: true, token: createSession_(), configured: true };
}

function unlock_(request) {
  const properties = props_();
  const password = String(request.password || '');
  if (!properties.getProperty('password_hash')) return { ok: false, status: 409, error: 'Accesso non configurato' };
  if (hash_(password, properties.getProperty('password_salt')) !== properties.getProperty('password_hash')) return { ok: false, status: 401, error: 'Password errata' };
  return { ok: true, token: createSession_() };
}

function readBackup_() {
  const grouped = {};
  const rows = getSheet_(SHEETS.records).getDataRange().getValues().slice(1);
  rows.forEach(row => {
    const collection = String(row[0] || '');
    if (!collection) return;
    if (!grouped[collection]) grouped[collection] = [];
    try { grouped[collection].push(JSON.parse(String(row[2]))); } catch (_) {}
  });
  return grouped;
}

function restoreBackup_(payload) {
  if (!payload || payload.format !== FORMAT || payload.version !== VERSION || !payload.data) return { ok: false, status: 400, error: 'Backup Casa Insieme non compatibile' };
  const sheet = getSheet_(SHEETS.records);
  if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).clearContent();
  const stamp = new Date().toISOString();
  const rows = [];
  Object.keys(payload.data).sort().forEach(collection => {
    const records = Array.isArray(payload.data[collection]) ? payload.data[collection] : [];
    records.forEach((record, index) => rows.push([collection, String(record.id == null ? index + 1 : record.id), JSON.stringify(record), stamp, VERSION]));
  });
  if (rows.length) sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  audit_('backup:restore', 'backup', '', `Importate ${rows.length} righe`);
  return { ok: true, imported: rows.length, restoredAt: stamp };
}

function list_(collection) {
  const rows = getSheet_(SHEETS.records).getDataRange().getValues().slice(1);
  return rows.filter(row => String(row[0]) === collection).map(row => JSON.parse(String(row[2])));
}

function put_(request) {
  const collection = String(request.collection || '');
  const record = request.record;
  if (!collection || !record || typeof record !== 'object') return { ok: false, status: 400, error: 'Raccolta o record mancanti' };
  const sheet = getSheet_(SHEETS.records);
  const rows = sheet.getDataRange().getValues();
  const id = String(record.id == null ? Utilities.getUuid() : record.id);
  const values = [collection, id, JSON.stringify(record), new Date().toISOString(), VERSION];
  const index = rows.findIndex((row, n) => n > 0 && String(row[0]) === collection && String(row[1]) === id);
  if (index > 0) sheet.getRange(index + 1, 1, 1, 5).setValues([values]); else sheet.appendRow(values);
  audit_('records:put', collection, id, 'Record salvato');
  return { ok: true, record };
}

function remove_(request) {
  const collection = String(request.collection || '');
  const id = String(request.id || '');
  const sheet = getSheet_(SHEETS.records);
  const rows = sheet.getDataRange().getValues();
  const index = rows.findIndex((row, n) => n > 0 && String(row[0]) === collection && String(row[1]) === id);
  if (index < 1) return { ok: false, status: 404, error: 'Record non trovato' };
  sheet.deleteRow(index + 1);
  audit_('records:delete', collection, id, 'Record eliminato');
  return { ok: true };
}

function getSheet_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`Foglio mancante: ${name}`);
  return sheet;
}
function props_() { return PropertiesService.getScriptProperties(); }
function hash_(value, salt) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, `${salt}:${value}`)); }
function createSession_() { const token = Utilities.getUuid() + Utilities.getUuid(); props_().setProperty(`session:${token}`, String(Date.now() + 1000 * 60 * 60 * 24 * 30)); return token; }
function validSession_(token) { const expires = Number(props_().getProperty(`session:${String(token || '')}`) || 0); return expires > Date.now(); }
function audit_(action, collection, id, details) { getSheet_(SHEETS.log).appendRow([new Date().toISOString(), action, collection, id, '', details]); }
function respond_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
