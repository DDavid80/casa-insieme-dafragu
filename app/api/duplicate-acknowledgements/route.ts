import { desc } from "drizzle-orm";
import { getDb } from "../../../db";
import { duplicateAcknowledgements } from "../../../db/schema";
import { requireAppAccess } from "../../../lib/app-security";

export async function GET(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  try {
    const db = await getDb();
    const acknowledgements = await db
      .select()
      .from(duplicateAcknowledgements)
      .orderBy(desc(duplicateAcknowledgements.createdAt));
    return Response.json({ acknowledgements });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Errore inatteso" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await requireAppAccess(request);
  if (denied) return denied;
  try {
    const payload = (await request.json()) as {
      duplicateKey?: string;
      author?: string;
    };
    const duplicateKey = payload.duplicateKey?.trim() ?? "";
    const author = payload.author === "Francesca" ? "Francesca" : "Davide";
    if (!duplicateKey)
      return Response.json({ error: "Gruppo non valido" }, { status: 400 });
    const db = await getDb();
    const [acknowledgement] = await db
      .insert(duplicateAcknowledgements)
      .values({ duplicateKey, author, createdAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: duplicateAcknowledgements.duplicateKey,
        set: { author, createdAt: new Date().toISOString() },
      })
      .returning();
    return Response.json({ acknowledgement });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Errore inatteso" },
      { status: 500 },
    );
  }
}
