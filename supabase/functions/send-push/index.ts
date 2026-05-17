// supabase/functions/send-push/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webPush from "https://esm.sh/web-push@3.6.7";

// 💡 ตั้งค่า CORS เพื่อให้หน้าเว็บ SPA ของเรา (ซึ่งอาจอยู่คนละโดเมน) สามารถเรียกใช้ Function นี้ได้
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // 1. จัดการคำขอแบบ OPTIONS (CORS Preflight) ที่เบราว์เซอร์มักจะส่งมาก่อน
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 2. รับข้อมูลที่หน้าเว็บหรือระบบส่งมาให้ (เช่น user_id ที่ต้องการแจ้งเตือน และข้อความ)
    const { user_id, title, body, url, icon } = await req.json();

    if (!user_id || !title) {
      throw new Error("Missing required fields: user_id or title");
    }

    // 3. ดึงค่า Environment Variables ที่ซ่อนไว้ใน Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@musicborrow.com";

    // 4. ตั้งค่า Web Push ด้วย VAPID Keys
    webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    // 5. เชื่อมต่อฐานข้อมูล Supabase ด้วย Service Role Key (เพื่อให้มีสิทธิ์อ่านตาราง push_subscriptions ทะลุ RLS ได้)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 6. ค้นหา Endpoints ทั้งหมดของ User คนนี้ (ผู้ใช้อาจล็อกอินทั้งในมือถือและคอมพิวเตอร์)
    const { data: subscriptions, error: dbError } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key")
      .eq("user_id", user_id);

    if (dbError) throw dbError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "ผู้ใช้รายนี้ยังไม่ได้อนุญาตรับการแจ้งเตือน (ไม่มี Subscription)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. เตรียมข้อมูลที่จะส่งไปให้ Service Worker (sw.js)
    const notificationPayload = JSON.stringify({
      title: title,
      body: body || "",
      url: url || "/",
      icon: icon || "assets/logo.png"
    });

    let successCount = 0;
    let failedCount = 0;

    // 8. ยิงการแจ้งเตือนไปยังทุกเครื่องที่ User ล็อกอินไว้แบบคู่ขนาน (Promise.all)
    const pushPromises = subscriptions.map(async (sub) => {
      const pushConfig = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh_key,
          auth: sub.auth_key,
        },
      };

      try {
        await webPush.sendNotification(pushConfig, notificationPayload);
        successCount++;
      } catch (error: any) {
        // 💡 [Creative Problem-Solving]: ทำความสะอาดฐานข้อมูลอัตโนมัติ
        // หากพบ Error 410 (Gone) หรือ 404 (Not Found) แปลว่าผู้ใช้บล็อก/ล้างข้อมูลไปแล้ว ให้ลบทิ้งทันที
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

    // 9. ส่งผลลัพธ์กลับ
    return new Response(
      JSON.stringify({ 
        message: "ดำเนินการส่ง Push Notification เสร็จสิ้น", 
        success: successCount, 
        failed: failedCount 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Function Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});