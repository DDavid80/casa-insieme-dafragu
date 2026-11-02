import { getDb } from "../db";
import { appSecurity } from "../db/schema";

const COOKIE_NAME = "casa_access";
const COOKIE_DATA = "casa-insieme-unlocked";

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function derivePassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 100000 },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}

async function signCookie(secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(COOKIE_DATA));
  return toBase64Url(new Uint8Array(signature));
}

function readCookie(request: Request) {
  const cookies = request.headers.get("cookie") ?? "";
  const value = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`));
  return value?.slice(COOKIE_NAME.length + 1) ?? null;
}

export async function getSecurityRecord() {
  const db = await getDb();
  // Compatibilità con il database già in uso.
  // La sicurezza non la utilizza, quindi leggiamo solo i campi indispensabili.
  const rows = await db
    .select({
      id: appSecurity.id,
      passwordHash: appSecurity.passwordHash,
      salt: appSecurity.salt,
      cookieSecret: appSecurity.cookieSecret,
      recoveryHash: appSecurity.recoveryHash,
      recoverySalt: appSecurity.recoverySalt,
    })
    .from(appSecurity)
    .limit(1);
  return rows[0] ?? null;
}

export async function isAppUnlocked(request: Request) {
  const security = await getSecurityRecord();
  if (!security) return false;
  const cookie = readCookie(request);
  if (!cookie) return false;
  return cookie === await signCookie(security.cookieSecret);
}

export async function hashPassword(password: string, salt: string) {
  return derivePassword(password, salt);
}

export async function verifyRecoveryCode(code: string) {
  const security = await getSecurityRecord();
  if (!security?.recoveryHash || !security.recoverySalt) return false;
  return await derivePassword(code, security.recoverySalt) === security.recoveryHash;
}

export function randomSecret(size = 24) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

export async function accessCookie(secret: string) {
  const value = await signCookie(secret);
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAccessCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export async function requireAppAccess(request: Request) {
  if (await isAppUnlocked(request)) return null;
  return Response.json({ error: "Password richiesta" }, { status: 401 });
}
