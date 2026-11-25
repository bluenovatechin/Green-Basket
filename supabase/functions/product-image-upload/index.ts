// POST multipart/form-data { file } (admin only) -> { url } of the image stored in Cloudflare R2.
// The admin panel shrinks photos to max 800 px WebP before uploading, so files are small.
// Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL (e.g. https://img.greenbasket.in)
import { AwsClient } from "npm:aws4fetch@1.0.20";
import { requireUser } from "../_shared/db.ts";
import { env, handleError, HttpError, json, preflight } from "../_shared/http.ts";

const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const MAX_BYTES = 2 * 1024 * 1024;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  try {
    const { role } = await requireUser(req);
    if (role !== "admin") throw new HttpError(403, "FORBIDDEN");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "INVALID_REQUEST");
    const ext = TYPES[file.type];
    if (!ext) throw new HttpError(400, "UNSUPPORTED_IMAGE_TYPE");
    if (file.size > MAX_BYTES) throw new HttpError(400, "IMAGE_TOO_LARGE");

    const key = `products/${crypto.randomUUID()}.${ext}`;
    const r2 = new AwsClient({
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      service: "s3",
      region: "auto",
    });
    const res = await r2.fetch(`https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${env("R2_BUCKET")}/${key}`, {
      method: "PUT",
      body: new Uint8Array(await file.arrayBuffer()),
      headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=31536000, immutable" },
    });
    if (!res.ok) throw new Error(`R2 upload failed: ${res.status} ${await res.text()}`);

    return json({ url: `${env("R2_PUBLIC_URL")}/${key}` });
  } catch (e) {
    return handleError(e);
  }
});
