// supabase/functions/send-push/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webPush from "https://esm.sh/web-push@3.6.7";

// 🔒 CORS จำกัดเฉพาะโดเมนของแอป — เดิมเป็น "*" ทำให้เว็บไหนก็ยิงฟังก์ชันนี้
// จากเบราว์เซอร์ของเหยื่อได้ ผู้เรียกจริง (DB trigger) เรียกจากฝั่ง server ไม่ใช้ CORS อยู่แล้ว
const ALLOWED_ORIGINS = new Set([
  "https://music-borrow.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
]);

function corsFor(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsFor(req) });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  try {
    // ── 1. ตรวจตัวตนผู้เรียกก่อนทำอะไรทั้งสิ้น ────────────────────────────────
    // เดิมไม่ตรวจเลย: ใครถือ anon key (ซึ่งเป็น public อยู่ใน config.js) ก็ POST
    // user_id + title + body + url ของใครก็ได้ แล้ว push จะถูกส่งด้วย VAPID identity
    // ของโรงเรียนเอง — เป็นช่องทางฟิชชิงที่หน้าตาเหมือนแอปจริงทุกอย่าง
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(req, { error: "Unauthorized" }, 401);

    // ผู้เรียกที่ถูกต้องมีสองแบบ: DB trigger (service_role) กับผู้ใช้ที่ล็อกอินแล้ว
    // เทียบทั้งตัว key ตรง ๆ และ role claim ใน JWT เผื่อ key ใน push_config ถูก rotate
    // คนละรอบกับ env — ลายเซ็น JWT ถูกตรวจโดย gateway ก่อนถึงฟังก์ชันนี้แล้ว
    const roleClaim = (() => {
      try {
        const part = token.split(".")[1];
        if (!part) return "";
        const pad = part.replace(/-/g, "+").replace(/_/g, "/");
        return JSON.parse(atob(pad + "=".repeat((4 - (pad.length % 4)) % 4)))?.role ?? "";
      } catch { return ""; }
    })();
    const isServiceRole = token === supabaseServiceKey || roleClaim === "service_role";

    const body = await req.json().catch(() => null);
    if (!body) return json(req, { error: "Invalid JSON body" }, 400);
    const { user_id, title, body: message, url, icon } = body;

    if (!user_id || !title) {
      return json(req, { error: "Missing required fields: user_id or title" }, 400);
    }

    if (!isServiceRole) {
      // ยืนยัน JWT จริงกับ GoTrue — anon key จะไม่ผ่านเพราะไม่มี user ผูกอยู่
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData, error: userErr } = await authClient.auth.getUser(token);
      const caller = userData?.user;
      if (userErr || !caller) return json(req, { error: "Unauthorized" }, 401);

      if (caller.id !== user_id) {
        // ส่งหาคนอื่นได้เฉพาะแอดมิน
        const admin = createClient(supabaseUrl, supabaseServiceKey);
        const { data: row } = await admin
          .from("users").select("role").eq("id", caller.id).single();
        if (row?.role !== "admin") return json(req, { error: "Forbidden" }, 403);
      }
    }

    // ── 2. ตั้งค่า VAPID ────────────────────────────────────────────────────
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@musicborrow.com";
    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // ── 3. อ่าน subscription ทั้งหมดของ user (service role เพื่อทะลุ RLS) ────
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: subscriptions, error: dbError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key")
      .eq("user_id", user_id);

    if (dbError) throw dbError;

    if (!subscriptions || subscriptions.length === 0) {
      // ตอบรูปแบบเดียวกับกรณีสำเร็จ เพื่อไม่ให้ใช้เป็น oracle เช็คว่าใครเปิด push ไว้
      return json(req, { message: "ดำเนินการส่ง Push Notification เสร็จสิ้น", success: 0, failed: 0 });
    }

    // ── 4. เตรียม payload ──────────────────────────────────────────────────
    // url ถูกจำกัดให้เป็น path ภายในแอปเท่านั้น (sw.js กันซ้ำอีกชั้น)
    const safePath = typeof url === "string" && /^\/[^/\\]/.test(url) ? url : "/";
    const notificationPayload = JSON.stringify({
      title: String(title),
      body: message ? String(message) : "",
      url: safePath,
      icon: typeof icon === "string" && icon.startsWith("assets/") ? icon : "assets/logo.png",
    });

    let successCount = 0;
    let failedCount = 0;

    const pushPromises = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
      };
      try {
        await webPush.sendNotification(pushConfig, notificationPayload);
        successCount++;
      } catch (error: any) {
        // 410 Gone / 404 Not Found = ผู้ใช้บล็อกหรือล้างข้อมูลแล้ว ลบทิ้งอัตโนมัติ
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`[Cleanup] ลบ Subscription ที่หมดอายุแล้ว (ID: ${sub.id})`);
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("Push failed for one endpoint:", error);
        }
        failedCount++;
      }
    });

    await Promise.all(pushPromises);

    return json(req, {
      message: "ดำเนินการส่ง Push Notification เสร็จสิ้น",
      success: successCount,
      failed: failedCount,
    });
  } catch (error: any) {
    console.error("Function Error:", error?.message);
    return json(req, { error: "Internal error" }, 500);
  }
});
