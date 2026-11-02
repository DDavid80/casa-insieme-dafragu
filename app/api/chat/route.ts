import { asc, lt } from "drizzle-orm";
import { getDb } from "../../../db";
import { chatMessages } from "../../../db/schema";
import {
  requireAppAccess,
  verifyRecoveryCode,
} from "../../../lib/app-security";

export async function GET(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  const db = await getDb();
  const rows = await db
    .select()
    .from(chatMessages)
    .orderBy(asc(chatMessages.id))
    .limit(300);
  return Response.json({ messages: rows });
}

export async function POST(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const payload = (await request.json()) as {
      author?: "Davide" | "Francesca";
      content?: string;
    };
    const content = payload.content?.trim() ?? "";
    if (!payload.author || !content || content.length > 1000)
      return Response.json({ error: "Messaggio non valido" }, { status: 400 });
    const db = await getDb();
    const [message] = await db
      .insert(chatMessages)
      .values({ author: payload.author, content })
      .returning();
    return Response.json({ message }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Errore inatteso" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const payload = (await request.json()) as {
      mode?: "all" | "before";
      beforeDate?: string;
      recoveryCode?: string;
    };
    if (!(await verifyRecoveryCode(payload.recoveryCode ?? "")))
      return Response.json(
        { error: "Codice di recupero errato" },
        { status: 401 },
      );
    const db = await getDb();
    if (payload.mode === "all") await db.delete(chatMessages);
    else if (
      payload.mode === "before" &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload.beforeDate ?? "")
    )
      await db
        .delete(chatMessages)
        .where(lt(chatMessages.createdAt, `${payload.beforeDate} 00:00:00`));
    else
      return Response.json(
        { error: "Seleziona una modalità valida" },
        { status: 400 },
      );
    const remaining = await db
      .select()
      .from(chatMessages)
      .orderBy(asc(chatMessages.id))
      .limit(300);
    return Response.json({ messages: remaining });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Errore inatteso" },
      { status: 500 },
    );
  }
}
