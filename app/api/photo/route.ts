import { requireAppAccess } from "../../../lib/app-security";

const PHOTO_KEY = "family/profile-photo";

async function getBucket() {
  const { env } = await import("cloudflare:workers");
  if (!env.BUCKET) throw new Error("Archivio immagini non disponibile");
  return env.BUCKET;
}

export async function GET(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const bucket = await getBucket();
    const object = await bucket.get(PHOTO_KEY);
    if (!object) return new Response(null, { status: 404 });
    const headers = new Headers();
    headers.set("content-type", object.httpMetadata?.contentType ?? "image/jpeg");
    headers.set("cache-control", "private, max-age=300");
    return new Response(object.body, { headers });
  } catch {
    return new Response(null, { status: 404 });
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireAppAccess(request);
    if (denied) return denied;
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return Response.json({ error: "Seleziona un’immagine valida" }, { status: 400 });
    }
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 4 * 1024 * 1024) {
      return Response.json({ error: "La foto deve pesare meno di 4 MB" }, { status: 400 });
    }
    const bucket = await getBucket();
    await bucket.put(PHOTO_KEY, bytes, { httpMetadata: { contentType } });
    return Response.json({ uploaded: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore inatteso";
    return Response.json({ error: message }, { status: 500 });
  }
}
