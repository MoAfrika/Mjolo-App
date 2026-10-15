import { createClient } from "@supabase/supabase-js";
import { safePhoto } from "../lib/image.ts";
import { z } from "zod";
const response = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
export default async function handler(req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return response(405, { error: "POST required" });
    const origin = process.env.APP_ORIGIN;
    if (!origin || req.headers.get("origin") !== origin)
      return response(403, { error: "Request origin is not allowed" });
    const url = process.env.SUPABASE_URL,
      key = process.env.SUPABASE_ANON_KEY,
      serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || !serviceKey)
      return response(503, { error: "Server integration is not configured" });
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer "))
      return response(401, { error: "Login required" });
    const userClient = createClient(url, key, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user },
      error,
    } = await userClient.auth.getUser();
    if (error || !user)
      return response(401, { error: "Session expired. Please log in again." });
    const { data: me, error: profileError } = await userClient.rpc("get_me");
    if (
      profileError ||
      !me ||
      me.status !== "active" ||
      me.must_change_password ||
      !me.verified
    )
      return response(403, {
        error:
          "Verify your email and complete any initial password change first.",
      });
    const action = new URL(req.url).searchParams.get("action");
    if (action === "upload") {
      if (Number(req.headers.get("content-length") || 0) > 8 * 1024 * 1024)
        return response(413, { error: "Choose a photo smaller than 6 MB" });
      const raw = Buffer.from(await req.arrayBuffer());
      if (raw.length > 6 * 1024 * 1024 || raw.length === 0)
        return response(413, { error: "Choose a photo smaller than 6 MB" });
      const { data: id, error: rateError } =
        await userClient.rpc("reserve_upload");
      if (rateError) return response(429, { error: rateError.message });
      let image: Buffer;
      try {
        image = safePhoto(raw);
      } catch {
        return response(400, {
          error: "Choose a valid JPEG or PNG photo up to 16 megapixels",
        });
      }
      if (image.length > 2097152)
        return response(413, { error: "Image is too large after compression" });
      const path = `${user.id}/${id}.jpg`;
      const uploaded = await service.storage
        .from("profile-photos")
        .upload(path, image, { contentType: "image/jpeg", upsert: false });
      if (uploaded.error)
        return response(502, {
          error: "Photo storage is unavailable. Please retry.",
        });
      const saved = await userClient.rpc("finish_upload", {
        photo_id: id,
        object_path: path,
      });
      if (saved.error) {
        await service.storage.from("profile-photos").remove([path]);
        return response(400, { error: saved.error.message });
      }
      return response(201, { id, path });
    }
    if (action === "delete-photo") {
      const { id } = z.object({ id: z.uuid() }).parse(await req.json());
      const { data: path, error } = await userClient.rpc("delete_photo", {
        photo_id: id,
      });
      if (error) return response(403, { error: error.message });
      const removal = await service.storage
        .from("profile-photos")
        .remove([path]);
      if (removal.error)
        return response(502, {
          error:
            "Photo hidden, but storage cleanup failed. Please contact support.",
        });
      return response(200, { ok: true });
    }
    if (action === "export") {
      const { data, error } = await userClient.rpc("export_account");
      if (error) return response(403, { error: error.message });
      return response(200, data);
    }
    if (action === "delete") {
      const { password } = z
        .object({ password: z.string().min(1).max(128) })
        .parse(await req.json());
      const verifier = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const checked = await verifier.auth.signInWithPassword({
        email: user.email!,
        password,
      });
      if (checked.error || checked.data.user?.id !== user.id)
        return response(403, { error: "Password is incorrect" });
      await verifier.auth.signOut();
      const photos = await service.storage
        .from("profile-photos")
        .list(user.id, { limit: 100 });
      if (photos.error)
        return response(502, {
          error: "Storage unavailable; account was not deleted. Retry later.",
        });
      if (photos.data.length) {
        const cleaned = await service.storage
          .from("profile-photos")
          .remove(photos.data.map((p) => `${user.id}/${p.name}`));
        if (cleaned.error)
          return response(502, {
            error:
              "Photo cleanup failed; account was not deleted. Retry later.",
          });
      }
      const deleted = await service.auth.admin.deleteUser(user.id);
      if (deleted.error)
        return response(502, {
          error: "Account deletion failed. Please retry.",
        });
      return response(200, { ok: true });
    }
    return response(404, { error: "Unknown operation" });
  } catch (e) {
    if (e instanceof z.ZodError)
      return response(400, { error: "Please check the submitted details" });
    console.error(
      "Account operation failed",
      e instanceof Error ? e.name : "UnknownError",
    );
    return response(500, {
      error: "Unable to complete this operation. Please retry.",
    });
  }
}
