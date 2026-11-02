import { getDb } from "../../../db";
import { appSecurity } from "../../../db/schema";
import { eq } from "drizzle-orm";
import {
  accessCookie,
  clearAccessCookie,
  getSecurityRecord,
  hashPassword,
  isAppUnlocked,
  randomSecret,
  requireAppAccess,
} from "../../../lib/app-security";

export async function GET(request: Request) {
  try {
    const security = await getSecurityRecord();
    return Response.json({
      configured: Boolean(security),
      unlocked: security ? await isAppUnlocked(request) : false,
      recoveryConfigured: Boolean(security?.recoveryHash),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { mode?: "setup" | "unlock" | "recover"; password?: string; recoveryCode?: string };
    const password = payload.password ?? "";
    if (password.length < 6 || password.length > 100) {
      return Response.json({ error: "La password deve contenere almeno 6 caratteri" }, { status: 400 });
    }
    const security = await getSecurityRecord();
    if (payload.mode === "setup") {
      if (security) return Response.json({ error: "Password già configurata" }, { status: 409 });
      const salt = randomSecret(18);
      const cookieSecret = randomSecret(32);
      const passwordHash = await hashPassword(password, salt);
      const db = await getDb();
      await db.insert(appSecurity).values({ id: 1, passwordHash, salt, cookieSecret });
      return Response.json({ unlocked: true }, { headers: { "set-cookie": await accessCookie(cookieSecret) } });
    }
    if (!security) return Response.json({ error: "Password non configurata" }, { status: 409 });
    if (payload.mode === "recover") {
      const recoveryCode = payload.recoveryCode ?? "";
      if (!security.recoveryHash || !security.recoverySalt) return Response.json({ error: "Codice di recupero non impostato" }, { status: 409 });
      if (await hashPassword(recoveryCode, security.recoverySalt) !== security.recoveryHash) return Response.json({ error: "Codice di recupero errato" }, { status: 401 });
      const salt = randomSecret(18); const cookieSecret = randomSecret(32); const passwordHash = await hashPassword(password, salt);
      const db = await getDb();
      await db.update(appSecurity).set({ passwordHash, salt, cookieSecret }).where(eq(appSecurity.id, 1));
      return Response.json({ unlocked: true }, { headers: { "set-cookie": await accessCookie(cookieSecret) } });
    }
    const candidate = await hashPassword(password, security.salt);
    if (candidate !== security.passwordHash) {
      return Response.json({ error: "Password errata" }, { status: 401 });
    }
    return Response.json({ unlocked: true }, { headers: { "set-cookie": await accessCookie(security.cookieSecret) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  void request;
  return Response.json({ locked: true }, { headers: { "set-cookie": clearAccessCookie() } });
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const payload = (await request.json()) as { currentPassword?: string; newPassword?: string; recoveryCode?: string; mode?: "password" | "recovery" };
    const currentPassword = payload.currentPassword ?? "";
    const newPassword = payload.newPassword ?? "";
    if (payload.mode === "recovery") {
      const recoveryCode = payload.recoveryCode ?? "";
      if (recoveryCode.length < 6 || recoveryCode.length > 100) return Response.json({ error: "Il codice deve contenere almeno 6 caratteri" }, { status: 400 });
      const recoverySalt = randomSecret(18); const recoveryHash = await hashPassword(recoveryCode, recoverySalt); const db = await getDb();
      await db.update(appSecurity).set({ recoveryHash, recoverySalt }).where(eq(appSecurity.id, 1));
      return Response.json({ recoveryConfigured: true });
    }
    if (newPassword.length < 6 || newPassword.length > 100) {
      return Response.json({ error: "La nuova password deve contenere almeno 6 caratteri" }, { status: 400 });
    }
    const security = await getSecurityRecord();
    if (!security) return Response.json({ error: "Password non configurata" }, { status: 409 });
    const currentHash = await hashPassword(currentPassword, security.salt);
    if (currentHash !== security.passwordHash) {
      return Response.json({ error: "La password attuale non è corretta" }, { status: 401 });
    }
    const salt = randomSecret(18);
    const cookieSecret = randomSecret(32);
    const passwordHash = await hashPassword(newPassword, salt);
    const db = await getDb();
    await db.update(appSecurity).set({ passwordHash, salt, cookieSecret }).where(eq(appSecurity.id, 1));
    return Response.json({ changed: true }, { headers: { "set-cookie": await accessCookie(cookieSecret) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}
