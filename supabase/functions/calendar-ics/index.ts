// ═══════════════════════════════════════════════════════════════════════════
// calendar-ics — ปฏิทินกิจกรรมวงโยธวาทิตในรูปแบบ iCalendar (.ics)
//
// ใช้ subscribe เข้า Google Calendar / Apple Calendar ครั้งเดียว แล้วอัปเดตเอง
// ครูกรอกกิจกรรมในแอปที่เดียว ไม่ต้องมากรอกซ้ำในปฏิทิน
//
// ⚠️ verify_jwt = false เพราะ Google ส่ง Authorization header ไม่ได้
//    จึงยืนยันตัวตนด้วย token ลับใน query string แทน
//    (ตรวจฝั่ง DB ใน calendar_feed_events — เดา URL ไม่ได้)
//
//    GET /functions/v1/calendar-ics?token=<token>
// ═══════════════════════════════════════════════════════════════════════════
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TYPE_LABEL: Record<string, string> = {
  practice:    "🎵 ซ้อม",
  camp:        "⛺ เข้าค่าย",
  performance: "🎭 ออกงาน",
  meeting:     "📋 ประชุม",
  other:       "📌 กิจกรรม",
};

/** iCalendar ต้อง escape , ; \ และขึ้นบรรทัดใหม่ */
function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** UTC แบบ basic format: 20260815T010000Z */
function ts(d: string | Date): string {
  return new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 บังคับบรรทัดยาวไม่เกิน 75 ไบต์ ต้องตัดแล้วขึ้นบรรทัดใหม่ด้วยเว้นวรรค */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 74) return line;

  const out: string[] = [];
  let buf = "";
  let len = 0;
  for (const ch of line) {           // วนทีละ code point กัน emoji ขาดกลาง
    const n = new TextEncoder().encode(ch).length;
    if (len + n > 73) { out.push(buf); buf = " "; len = 1; }
    buf += ch; len += n;
  }
  out.push(buf);
  return out.join("\r\n");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("missing token", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("calendar_feed_events", { p_token: token });

  if (error) {
    // token ผิดจะเด้งมาที่นี่ — อย่าบอกรายละเอียดว่าเพราะอะไร
    return new Response("unauthorized", { status: 401 });
  }

  const now = ts(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MusicBorrow//Marching Band Schedule//TH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:วงโยธวาทิต — ตารางกิจกรรม",
    "X-WR-TIMEZONE:Asia/Bangkok",
    "REFRESH-INTERVAL;VALUE=DURATION:PT4H",
    "X-PUBLISHED-TTL:PT4H",
  ];

  for (const e of data ?? []) {
    const label = TYPE_LABEL[e.activity_type] ?? TYPE_LABEL.other;
    const desc: string[] = [];
    if (e.needs_instrument) desc.push("เบิกเครื่องดนตรี");
    if (e.needs_uniform)    desc.push("เบิกชุด");
    if ((e.needs_instrument || e.needs_uniform) && e.return_due_at) {
      desc.push(`กำหนดคืน ${new Date(e.return_due_at).toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "short",
      })} น.`);
    }
    if (e.status === "closed") desc.push("(ปิดงานแล้ว)");

    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:event-${e.id}@music-borrow.vercel.app`),
      `DTSTAMP:${now}`,
      `DTSTART:${ts(e.start_at)}`,
      `DTEND:${ts(e.end_at ?? e.return_due_at ?? e.start_at)}`,
      fold(`SUMMARY:${esc(`${label} ${e.name}`)}`),
      ...(e.location ? [fold(`LOCATION:${esc(e.location)}`)] : []),
      ...(desc.length ? [fold(`DESCRIPTION:${esc(desc.join(" · "))}`)] : []),
      `LAST-MODIFIED:${ts(e.updated_at ?? e.start_at)}`,
      e.status === "closed" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      // เตือนในปฏิทินล่วงหน้า 1 วัน — เสริมกับ push ของแอปเอง
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:${esc(e.name)}`),
      "END:VALARM",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="marching-band.ics"',
      "Cache-Control": "public, max-age=1800",
    },
  });
});
