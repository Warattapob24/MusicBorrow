// ═══════════════════════════════════════════════════════════════════════════
// gcal-sync — เขียนกิจกรรมเข้า "ปฏิทิน Google เดิม" ของโรงเรียนโดยตรง
//
// ทำไมไม่ใช้ ICS: Google บังคับให้ ICS feed กลายเป็นปฏิทิน "ใหม่" เสมอ
// merge เข้าปฏิทินที่มีอยู่ไม่ได้ → ต้องเรียก Calendar API เขียนเข้าไปตรง ๆ
//
// ยืนยันตัวตนด้วย Service Account (ไม่ต้องให้ครูล็อกอินซ้ำ ไม่มี refresh token หมดอายุ)
// ต้องตั้ง Secrets ใน Supabase:
//   GCAL_SERVICE_ACCOUNT = เนื้อหาไฟล์ JSON ของ service account ทั้งก้อน
//   GCAL_CALENDAR_ID     = <id>@group.calendar.google.com
// และแชร์ปฏิทินให้อีเมลของ service account สิทธิ์ "แก้ไขกิจกรรม"
// ═══════════════════════════════════════════════════════════════════════════
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TYPE_LABEL: Record<string, string> = {
  practice: "🎵 ซ้อม", camp: "⛺ เข้าค่าย", performance: "🎭 ออกงาน",
  meeting: "📋 ประชุม", other: "📌 กิจกรรม",
};

const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** แปลง PEM (PKCS#8) เป็น CryptoKey สำหรับเซ็น JWT ด้วย RS256 */
async function importKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8", der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );
}

/** แลก service account เป็น access token ตามขั้นตอน OAuth2 JWT bearer */
async function getAccessToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));

  const key = await importKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(sig)}`,
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`token: ${json.error_description ?? json.error ?? res.status}`);
  return json.access_token;
}

/** แปลงกิจกรรมของเราเป็น body ของ Google Calendar event */
function toGoogleEvent(e: Record<string, unknown>) {
  const label = TYPE_LABEL[e.activity_type as string] ?? TYPE_LABEL.other;
  const desc: string[] = [];
  if (e.needs_instrument) desc.push("เบิกเครื่องดนตรี");
  if (e.needs_uniform) desc.push("เบิกชุด");
  if ((e.needs_instrument || e.needs_uniform) && e.return_due_at) {
    desc.push(`กำหนดคืน ${new Date(e.return_due_at as string).toLocaleString("th-TH", {
      timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short",
    })} น.`);
  }
  desc.push("— จากระบบยืมคืนเครื่องดนตรี");

  return {
    summary: `${label} ${e.name}`,
    location: (e.location as string) ?? undefined,
    description: desc.join("\n"),
    start: { dateTime: new Date(e.start_at as string).toISOString(), timeZone: "Asia/Bangkok" },
    end: {
      dateTime: new Date((e.end_at ?? e.return_due_at ?? e.start_at) as string).toISOString(),
      timeZone: "Asia/Bangkok",
    },
    status: e.status === "closed" ? "confirmed" : "confirmed",
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 24 * 60 }] },
    source: { title: "ระบบยืมคืนเครื่องดนตรี", url: "https://music-borrow.vercel.app" },
  };
}

Deno.serve(async (req) => {
  const saRaw = Deno.env.get("GCAL_SERVICE_ACCOUNT");
  const calId = Deno.env.get("GCAL_CALENDAR_ID");

  if (!saRaw || !calId) {
    return Response.json(
      { ok: false, error: "ยังไม่ได้ตั้ง GCAL_SERVICE_ACCOUNT / GCAL_CALENDAR_ID ใน Supabase Secrets" },
      { status: 503 },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const sa = JSON.parse(saRaw);
    const token = await getAccessToken(sa);
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`;
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    let created = 0, updated = 0, removed = 0;
    const errors: string[] = [];

    // 1) ลบกิจกรรมที่ถูกลบในแอปไปแล้ว
    const { data: dels } = await supabase.rpc("gcal_take_deletions");
    for (const d of dels ?? []) {
      const res = await fetch(`${base}/${encodeURIComponent(d.gcal_event_id)}`,
        { method: "DELETE", headers: auth });
      // 410 = ถูกลบไปแล้ว, 404 = ไม่มีอยู่ — ทั้งคู่ถือว่าสำเร็จ
      if (res.ok || res.status === 410 || res.status === 404) {
        await supabase.rpc("gcal_clear_deletion", { p_gcal_id: d.gcal_event_id });
        removed++;
      } else {
        errors.push(`delete ${d.gcal_event_id}: ${res.status}`);
      }
    }

    // 2) สร้าง / แก้ไข กิจกรรมที่ยังไม่ sync
    const { data: pending, error: pErr } = await supabase.rpc("gcal_pending");
    if (pErr) throw pErr;

    for (const e of pending ?? []) {
      // ติ๊ก "ไม่แสดงในปฏิทิน" ทีหลัง → ต้องเอาออกจากปฏิทิน
      if (!e.show_in_calendar) {
        if (e.gcal_event_id) {
          const res = await fetch(`${base}/${encodeURIComponent(e.gcal_event_id)}`,
            { method: "DELETE", headers: auth });
          if (res.ok || res.status === 410 || res.status === 404) removed++;
        }
        await supabase.rpc("gcal_mark_synced", { p_id: e.id, p_gcal_id: null });
        continue;
      }

      const body = JSON.stringify(toGoogleEvent(e));
      let res: Response;

      if (e.gcal_event_id) {
        res = await fetch(`${base}/${encodeURIComponent(e.gcal_event_id)}`,
          { method: "PATCH", headers: auth, body });
        // ถูกลบจากปฏิทินด้วยมือ → สร้างใหม่แทนที่จะ error ค้าง
        if (res.status === 404 || res.status === 410) {
          res = await fetch(base, { method: "POST", headers: auth, body });
        } else if (res.ok) {
          updated++;
        }
      } else {
        res = await fetch(base, { method: "POST", headers: auth, body });
      }

      if (!res.ok) {
        const t = await res.text();
        errors.push(`event ${e.id}: ${res.status} ${t.slice(0, 120)}`);
        continue;
      }

      const gEvent = await res.json();
      if (!e.gcal_event_id || gEvent.id !== e.gcal_event_id) created++;
      await supabase.rpc("gcal_mark_synced", { p_id: e.id, p_gcal_id: gEvent.id });
    }

    return Response.json({ ok: errors.length === 0, created, updated, removed, errors });
  } catch (err) {
    return Response.json({ ok: false, error: String((err as Error).message ?? err) }, { status: 500 });
  }
});
