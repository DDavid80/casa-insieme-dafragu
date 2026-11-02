import { desc, eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { notes } from "../../../db/schema";
import { requireAppAccess } from "../../../lib/app-security";

export async function GET(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const db = await getDb();
    const rows = await db
      .select()
      .from(notes)
      .orderBy(desc(notes.date), desc(notes.id))
      .limit(500);
    return Response.json({ notes: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const payload = (await request.json()) as { date?: string; content?: string; author?: "Davide" | "Francesca" };
    const content = payload.content?.trim() ?? "";
    if (!payload.date || !content || !payload.author) {
      return Response.json({ error: "Data e testo sono obbligatori" }, { status: 400 });
    }
    const db = await getDb();
    const [note] = await db.insert(notes).values({
      date: payload.date,
      content,
      author: payload.author,
    }).returning();
    return Response.json({ note }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "Nota non valida" }, { status: 400 });
    }
    const db = await getDb();
    const deleted = await db.delete(notes).where(eq(notes.id, id)).returning({ id: notes.id });
    if (!deleted.length) {
      return Response.json({ error: "Nota non trovata" }, { status: 404 });
    }
    return Response.json({ deletedId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const denied = await requireAppAccess(request); if (denied) return denied;
    const payload = await request.json() as { id?: number; date?: string; content?: string; author?: "Davide" | "Francesca" };
    const id = Number(payload.id); const content = payload.content?.trim() ?? "";
    if (!Number.isInteger(id) || id <= 0 || !payload.date || !content || !payload.author) return Response.json({ error: "Nota non valida" }, { status: 400 });
    const db = await getDb(); const [note] = await db.update(notes).set({ date: payload.date, content, author: payload.author }).where(eq(notes.id, id)).returning();
    if (!note) return Response.json({ error: "Nota non trovata" }, { status: 404 });
    return Response.json({ note });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Errore inatteso" }, { status: 500 }); }
}
