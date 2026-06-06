/**
 * 📘 build-docx.js
 * สร้างคู่มือ "ระบบยืมคืนเครื่องดนตรี v5.2" — ใช้สำหรับประกวดสื่อและนวัตกรรม
 *
 * Run: node build-docx.js
 */
const fs = require('fs');
const path = require('path');
const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
    BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
    TableOfContents, ExternalHyperlink, PageOrientation
} = require('docx');

// ═══════════════════════════════════════════════════════════════
// 🎨 STYLE HELPERS
// ═══════════════════════════════════════════════════════════════
const BLUE = "2563EB";
const DEEP_BLUE = "1E3A8A";
const LIGHT_BLUE = "DBEAFE";
const PURPLE = "7C3AED";
const PINK = "EC4899";
const ORANGE = "F59E0B";
const GREEN = "10B981";
const GRAY = "64748B";
const DARK = "1E293B";
const LIGHT_GRAY = "F1F5F9";

const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E1" };
const borderAll = { top: border, bottom: border, left: border, right: border };

// Heading helper
const H1 = (text, color = DEEP_BLUE) => new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, size: 36, color, font: "Sarabun" })]
});
const H2 = (text, color = BLUE) => new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, size: 28, color, font: "Sarabun" })]
});
const H3 = (text) => new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24, color: DARK, font: "Sarabun" })]
});

// Body paragraph
const P = (text, opts = {}) => new Paragraph({
    spacing: { after: 120, line: 320 },
    alignment: opts.center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    children: [new TextRun({
        text,
        size: opts.size || 22,
        color: opts.color || DARK,
        bold: opts.bold || false,
        italics: opts.italic || false,
        font: "Sarabun"
    })]
});

// Multiple runs
const PR = (runs, opts = {}) => new Paragraph({
    spacing: { after: 120, line: 320 },
    alignment: opts.center ? AlignmentType.CENTER : (opts.align || AlignmentType.JUSTIFIED),
    children: runs.map(r => new TextRun({
        text: r.text || '',
        bold: r.bold || false,
        size: r.size || 22,
        color: r.color || DARK,
        italics: r.italic || false,
        font: "Sarabun",
        break: r.break || 0
    }))
});

// Bullet list item
const BULLET = (text, level = 0) => new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { after: 80, line: 300 },
    children: [new TextRun({ text, size: 22, color: DARK, font: "Sarabun" })]
});

// Numbered list item
const NUM = (text, level = 0) => new Paragraph({
    numbering: { reference: "numbers", level },
    spacing: { after: 80, line: 300 },
    children: [new TextRun({ text, size: 22, color: DARK, font: "Sarabun" })]
});

// Callout box (highlighted paragraph)
const CALLOUT = (text, color = LIGHT_BLUE, textColor = DEEP_BLUE) => new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    borders: {
        top:    { style: BorderStyle.SINGLE, size: 12, color: BLUE },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: BLUE },
        left:   { style: BorderStyle.SINGLE, size: 24, color: BLUE },
        right:  { style: BorderStyle.SINGLE, size: 4, color: BLUE },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
    },
    rows: [
        new TableRow({
            children: [new TableCell({
                width: { size: 9360, type: WidthType.DXA },
                shading: { fill: color, type: ShadingType.CLEAR },
                margins: { top: 200, bottom: 200, left: 280, right: 200 },
                children: [new Paragraph({
                    spacing: { after: 0, line: 320 },
                    children: [new TextRun({
                        text, size: 22, color: textColor, bold: false, font: "Sarabun"
                    })]
                })]
            })]
        })
    ]
});

// Feature spec table
const featureSpecTable = (features) => new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [3120, 6240],
    rows: features.map((f, i) => new TableRow({
        children: [
            new TableCell({
                width: { size: 3120, type: WidthType.DXA },
                borders: borderAll,
                shading: { fill: i % 2 === 0 ? LIGHT_BLUE : "FFFFFF", type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 160, right: 100 },
                children: [new Paragraph({
                    spacing: { after: 0 },
                    children: [new TextRun({ text: f[0], bold: true, size: 22, color: DEEP_BLUE, font: "Sarabun" })]
                })]
            }),
            new TableCell({
                width: { size: 6240, type: WidthType.DXA },
                borders: borderAll,
                shading: { fill: i % 2 === 0 ? "FFFFFF" : LIGHT_GRAY, type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 160, right: 100 },
                children: [new Paragraph({
                    spacing: { after: 0 },
                    children: [new TextRun({ text: f[1], size: 22, color: DARK, font: "Sarabun" })]
                })]
            })
        ]
    }))
});

// Step-by-step instruction (numbered + description)
const stepBox = (n, title, desc) => new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [800, 8560],
    borders: {
        top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
        left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
    },
    rows: [new TableRow({
        children: [
            new TableCell({
                width: { size: 800, type: WidthType.DXA },
                shading: { fill: BLUE, type: ShadingType.CLEAR },
                margins: { top: 120, bottom: 120, left: 100, right: 100 },
                children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({ text: String(n), bold: true, size: 32, color: "FFFFFF", font: "Sarabun" })]
                })]
            }),
            new TableCell({
                width: { size: 8560, type: WidthType.DXA },
                margins: { top: 80, bottom: 120, left: 240, right: 100 },
                children: [
                    new Paragraph({
                        spacing: { after: 60 },
                        children: [new TextRun({ text: title, bold: true, size: 24, color: DEEP_BLUE, font: "Sarabun" })]
                    }),
                    new Paragraph({
                        spacing: { after: 0, line: 300 },
                        children: [new TextRun({ text: desc, size: 22, color: DARK, font: "Sarabun" })]
                    })
                ]
            })
        ]
    })]
});

// Page break helper
const PB = () => new Paragraph({ children: [new PageBreak()] });

// ═══════════════════════════════════════════════════════════════
// 📖 CONTENT
// ═══════════════════════════════════════════════════════════════
const content = [];

// ─────── COVER PAGE ───────
content.push(
    new Paragraph({ spacing: { before: 2400 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "🎵", size: 144, font: "Sarabun" })] }),
    new Paragraph({ spacing: { before: 200, after: 100 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "ระบบยืมคืนเครื่องดนตรี v5.2", bold: true, size: 56, color: DEEP_BLUE, font: "Sarabun" })] }),
    new Paragraph({ spacing: { after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Gamified Music Learning Ecosystem", bold: true, size: 32, color: BLUE, italics: true, font: "Sarabun" })] }),
    new Paragraph({ spacing: { after: 800 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "นวัตกรรมเปลี่ยนการเรียนดนตรีให้เป็นเกม", size: 24, color: GRAY, font: "Sarabun" })] }),
    new Paragraph({ spacing: { after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "📘 คู่มือการใช้งาน + ข้อเสนอนวัตกรรม", bold: true, size: 28, color: PURPLE, font: "Sarabun" })] }),
    new Paragraph({ spacing: { after: 100 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "สำหรับการประกวดสื่อและนวัตกรรมการเรียนรู้", size: 22, color: DARK, font: "Sarabun" })] }),
    new Paragraph({ spacing: { before: 1600 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "🌐 ใช้งานจริงที่: music-borrow.vercel.app", bold: true, size: 22, color: BLUE, font: "Sarabun" })] }),
    new Paragraph({ spacing: { after: 0 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "Powered by Supabase + Vercel + PWA", size: 20, color: GRAY, font: "Sarabun" })] }),
    PB()
);

// ─────── TABLE OF CONTENTS ───────
content.push(
    H1("📑 สารบัญ"),
    P("เอกสารนี้แบ่งออกเป็น 4 ส่วนหลัก:", { size: 22 }),
    NUM("ส่วนที่ 1: Executive Summary — ภาพรวมและจุดขายของนวัตกรรม"),
    NUM("ส่วนที่ 2: Innovation Highlights — เทคโนโลยีและจุดเด่นที่แตกต่าง"),
    NUM("ส่วนที่ 3: คู่มือการใช้งานสำหรับนักเรียน — 8 ฟีเจอร์หลัก"),
    NUM("ส่วนที่ 4: Technical Architecture — สถาปัตยกรรมระบบ + ภาคผนวก"),
    PB()
);

// ═══════════════════════════════════════════════════════════════
// SECTION 1: EXECUTIVE SUMMARY
// ═══════════════════════════════════════════════════════════════
content.push(
    H1("ส่วนที่ 1: Executive Summary"),
    H2("🎯 ที่มาของนวัตกรรม"),
    P("การเรียนดนตรีในโรงเรียนมัธยม มักประสบปัญหา 4 ประการสำคัญ:"),
    BULLET("นักเรียน ขาดแรงจูงใจ ในการซ้อมสม่ำเสมอ — ซ้อมเฉพาะวันก่อนสอบ"),
    BULLET("ครู เสียเวลามาก กับงานเอกสาร: จดทะเบียนยืม-คืนเครื่อง, จัดการคิวซ่อม, ตรวจสอบการสอบ"),
    BULLET("เครื่องดนตรี สูญหาย/ชำรุด โดยไม่รู้ตัว — ไม่มีระบบติดตามสภาพ"),
    BULLET("การเรียนดนตรีถูกจำกัด อยู่แค่ในห้องเรียน — ไม่ต่อเนื่องที่บ้าน"),
    P(""),
    P("ระบบยืมคืนเครื่องดนตรี v5.2 ถูกออกแบบเพื่อแก้ปัญหาทั้ง 4 ข้อในระบบเดียว ผ่านการผสานเทคโนโลยี Web Application สมัยใหม่กับหลักการ Gamification (เกมมิฟิเคชัน)", { bold: true }),
    P(""),

    H2("✨ จุดขายหลัก (Unique Selling Points)"),
    CALLOUT("\"เปลี่ยนการเรียนดนตรีเป็นเกม\" — ระบบเดียวที่รวม Boss Raid, XP Level, Streak, Leaderboard, Push Notification, และ QR Code Borrowing เข้าไว้ด้วยกัน บน Progressive Web App ที่ใช้งานได้ทั้ง Online และ Offline"),
    P(""),

    featureSpecTable([
        ["🐉 Boss Raid (Multiplayer)", "เปลี่ยนการสอบดนตรีเป็นการ \"ล่าบอส\" 4 คนพร้อมกัน ผ่าน Realtime Lobby — สนุก ยุติธรรม รวดเร็ว"],
        ["⚡ Gamification XP/Level", "ทุกการซ้อม การดูคลิป การยืมคืน ได้รับ EXP จริง สะสมเป็น Level สร้างแรงจูงใจระยะยาว"],
        ["🔥 Streak System", "ซ้อมต่อเนื่อง 7 วัน → ได้ EXP×2 — กลไกเดียวกับ Duolingo ที่ทำให้ไม่หยุดเรียน"],
        ["🎺 QR Code Borrowing", "สแกนเครื่องดนตรี → ยืม/คืน อัตโนมัติ — ครูประหยัดเวลาเอกสาร 80%"],
        ["📚 Learning Feed", "ครูและเพื่อนแชร์คลิปสอน → ดูแล้วได้ XP — เปลี่ยน YouTube เป็น \"คลังความรู้ของโรงเรียน\""],
        ["🔔 Push Notification", "เด้งแจ้งเตือนถึงมือถือแม้ปิดแอป — เตือนซ้อม, แจ้งบอสใหม่, เตือนใกล้คืน"],
        ["🌓 3 ธีม", "Light / Dark / Rainbow — รองรับการใช้งานทุกสภาพแสง ทุกบุคลิก"],
        ["📱 Progressive Web App", "ติดตั้งได้บนหน้าจอมือถือเหมือน App จริง — ไม่ต้องผ่าน App Store"]
    ]),
    P(""),

    H2("📊 ผลลัพธ์ที่คาดหวัง"),
    P("เมื่อใช้งานระบบนี้ในโรงเรียน เราคาดหวังผลลัพธ์ดังนี้:"),
    P(""),

    new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [3120, 3120, 3120],
        rows: [
            new TableRow({ tableHeader: true, children: [
                new TableCell({ width: { size: 3120, type: WidthType.DXA }, borders: borderAll,
                    shading: { fill: BLUE, type: ShadingType.CLEAR }, margins: { top: 120, bottom: 120, left: 120, right: 120 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: "ตัวชี้วัด", bold: true, size: 22, color: "FFFFFF", font: "Sarabun" })] })] }),
                new TableCell({ width: { size: 3120, type: WidthType.DXA }, borders: borderAll,
                    shading: { fill: BLUE, type: ShadingType.CLEAR }, margins: { top: 120, bottom: 120, left: 120, right: 120 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: "ก่อนใช้ระบบ", bold: true, size: 22, color: "FFFFFF", font: "Sarabun" })] })] }),
                new TableCell({ width: { size: 3120, type: WidthType.DXA }, borders: borderAll,
                    shading: { fill: BLUE, type: ShadingType.CLEAR }, margins: { top: 120, bottom: 120, left: 120, right: 120 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: "หลังใช้ระบบ", bold: true, size: 22, color: "FFFFFF", font: "Sarabun" })] })] })
            ]}),
            ...[
                ["เวลาเอกสาร/ครั้ง", "5-10 นาที", "30 วินาที (-95%)"],
                ["ความถี่ซ้อม", "1-2 ครั้ง/สัปดาห์", "5-7 ครั้ง/สัปดาห์"],
                ["จำนวนคลิปเรียนรู้", "0-3 คลิป", "10+ คลิป/เดือน"],
                ["เครื่องสูญหาย/เสีย", "ไม่ทราบที่มา", "ติดตามได้ 100%"],
                ["การมีส่วนร่วมของนักเรียน", "ครู push", "นักเรียน pull"]
            ].map(row => new TableRow({ children: row.map((cell, idx) => new TableCell({
                width: { size: 3120, type: WidthType.DXA }, borders: borderAll,
                shading: { fill: idx === 2 ? "DCFCE7" : "FFFFFF", type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 120, right: 120 },
                children: [new Paragraph({ alignment: idx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
                    children: [new TextRun({ text: cell, size: 22, bold: idx === 2,
                        color: idx === 2 ? "047857" : DARK, font: "Sarabun" })] })]
            })) }))
        ]
    }),
    PB()
);

// ═══════════════════════════════════════════════════════════════
// SECTION 2: INNOVATION HIGHLIGHTS
// ═══════════════════════════════════════════════════════════════
content.push(
    H1("ส่วนที่ 2: Innovation Highlights"),
    P("ส่วนนี้อธิบาย 5 จุดเด่นที่ทำให้ระบบนี้ \"ว้าว\" และแตกต่างจากระบบยืมคืนทั่วไปในตลาด"),
    P(""),

    H2("🐉 1. Boss Raid — เปลี่ยนการสอบเป็นเกม"),
    CALLOUT("Boss Raid คือระบบสอบดนตรีแบบ Multiplayer ที่นักเรียนรวมกลุ่ม 4 คน เข้าห้องสอบเดียวกันด้วย \"รหัส 4 หลัก\" ครูตัดสินผลพร้อมกันทั้งกลุ่มผ่าน Realtime Database",
        "F3E8FF", "6B21A8"),
    P(""),
    P("ทำไมถึงเป็นนวัตกรรม:"),
    BULLET("ลดความตึงเครียดของการสอบ — สอบเป็นกลุ่ม สนุกกว่าเดี่ยว"),
    BULLET("ครูประหยัดเวลา — สอบ 4 คน/ครั้ง แทน 1 คน/ครั้ง"),
    BULLET("Realtime Sync — ใช้ Supabase Realtime channel ดูสถานะเข้าห้องสด ๆ"),
    BULLET("Reward เป็น XP + Stars + ปลดล็อก Badge — กลไกเกมแท้ๆ"),
    P(""),

    H2("⚡ 2. Gamification Layer — XP / Level / Streak"),
    P("ระบบจะให้คะแนน EXP ทุกการกระทำ:"),
    P(""),
    new Table({
        width: { size: 9360, type: WidthType.DXA },
        columnWidths: [4680, 2340, 2340],
        rows: [
            new TableRow({ tableHeader: true, children: [
                ["กิจกรรม", "EXP ที่ได้", "เงื่อนไขพิเศษ"].map(t => new TableCell({
                    width: { size: 3120, type: WidthType.DXA }, borders: borderAll,
                    shading: { fill: PURPLE, type: ShadingType.CLEAR },
                    margins: { top: 120, bottom: 120, left: 120, right: 120 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: t, bold: true, color: "FFFFFF", size: 22, font: "Sarabun" })] })]
                }))
            ].flat() }),
            ...[
                ["ดูคลิปจบ 1 คลิป", "+30 ถึง +75 XP", "ตามความยาว"],
                ["แชร์คลิปการเรียนรู้", "+100 XP", "เมื่อครูอนุมัติ"],
                ["ผ่าน Boss (ขั้นต้น)", "+80 XP, +1 ⭐", "ไม่จำกัดครั้ง"],
                ["ผ่าน Boss (ขั้นกลาง)", "+200 XP, +3 ⭐", "ครั้งแรก: ×2"],
                ["ซ้อมต่อเนื่อง 7 วัน", "EXP×2 ทั้งวัน", "Streak Bonus"],
                ["คืนเครื่องตรงเวลา", "+20 XP", "ป้องกันลืมคืน"]
            ].map(row => new TableRow({ children: [
                new TableCell({ width: { size: 4680, type: WidthType.DXA }, borders: borderAll, margins: { top: 100, bottom: 100, left: 120, right: 120 },
                    children: [new Paragraph({ children: [new TextRun({ text: row[0], size: 22, font: "Sarabun" })] })] }),
                new TableCell({ width: { size: 2340, type: WidthType.DXA }, borders: borderAll, margins: { top: 100, bottom: 100, left: 120, right: 120 },
                    shading: { fill: "FEF3C7", type: ShadingType.CLEAR },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: row[1], bold: true, size: 22, color: "B45309", font: "Sarabun" })] })] }),
                new TableCell({ width: { size: 2340, type: WidthType.DXA }, borders: borderAll, margins: { top: 100, bottom: 100, left: 120, right: 120 },
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: row[2], size: 20, italics: true, color: GRAY, font: "Sarabun" })] })] })
            ] }))
        ]
    }),
    P(""),

    H2("🔔 3. Push Notification (PWA) — ถึงมือถือแม้ปิดแอป"),
    CALLOUT("ระบบใช้ Web Push API + VAPID + Service Worker — เด้งแจ้งเตือนเหมือน Native App แต่ไม่ต้องโหลดผ่าน App Store ติดตั้งบนหน้าจอมือถือได้ทันทีจากเบราว์เซอร์"),
    P(""),
    P("ตัวอย่างการแจ้งเตือนที่ระบบส่งอัตโนมัติ:"),
    BULLET("\"⏰ ใกล้ครบกำหนดคืน 2 วัน — ฟลู้ท #003\""),
    BULLET("\"🐉 ครูเปิดบอสใหม่ — เข้าห้องด้วยรหัส A7K3\""),
    BULLET("\"🏆 คุณได้เหรียญ \"นักเรียนรู้\" — ดูคลิปครบ 10 คลิป!\""),
    BULLET("\"📚 ครูอนุมัติคลิปของคุณแล้ว — รับ +100 XP\""),
    P(""),

    H2("🎺 4. QR Code Borrowing — ครูประหยัดเวลา 95%"),
    P("ทุกเครื่องดนตรีมี QR Code ติดอยู่ — สแกนแล้วระบบบันทึก:"),
    NUM("ผู้ยืม (auto-detect จาก login)"),
    NUM("เวลาที่ยืม"),
    NUM("กำหนดคืน (auto +7 วัน)"),
    NUM("สภาพเครื่องตอนยืม"),
    NUM("Push Notification → ครู (รู้ทันที)"),
    P(""),
    P("เปรียบเทียบ:"),
    P("• แบบเดิม (จดมือ): 5-10 นาที/ครั้ง", { color: "B91C1C" }),
    P("• แบบใหม่ (สแกน QR): 30 วินาที/ครั้ง — ลด 95%", { color: "047857", bold: true }),
    P(""),

    H2("📚 5. Community Learning Feed — นักเรียนเป็นผู้สร้างคอนเทนต์"),
    P("จุดเด่นที่ทำให้ระบบนี้ต่างจากระบบจัดการคลังทั่วไป:"),
    BULLET("นักเรียนแชร์คลิป YouTube/Drive ได้เอง"),
    BULLET("ครูตรวจสอบ → อนุมัติ → คลิปเข้าฟีดให้ทุกคนเห็น"),
    BULLET("นักเรียนผู้แชร์ได้รับ +100 XP เมื่ออนุมัติ"),
    BULLET("ผู้ดูคลิปได้รับ EXP ตามความยาวคลิป"),
    BULLET("เปลี่ยน YouTube/TikTok เป็น \"แหล่งเรียนรู้ของโรงเรียน\""),
    PB()
);

// ═══════════════════════════════════════════════════════════════
// SECTION 3: USER MANUAL FOR STUDENTS
// ═══════════════════════════════════════════════════════════════
content.push(
    H1("ส่วนที่ 3: คู่มือใช้งานสำหรับนักเรียน"),
    CALLOUT("📱 เปิดเว็บที่ music-borrow.vercel.app — ระบบจะให้ติดตั้งเป็น App บนหน้าจอมือถือทันที (iOS: กดปุ่ม Share → Add to Home Screen / Android: กด \"Install\" จากเมนูเบราว์เซอร์)"),
    P(""),

    // Feature 1: Login
    H2("🔐 ฟีเจอร์ที่ 1: เข้าสู่ระบบ"),
    stepBox(1, "เปิดเว็บไซต์", "พิมพ์ music-borrow.vercel.app บนเบราว์เซอร์ของมือถือ — แนะนำใช้ Chrome (Android) หรือ Safari (iOS)"),
    stepBox(2, "ลงทะเบียนครั้งแรก", "กด \"ลงทะเบียน\" → กรอกชื่อ-นามสกุล + เลือกชั้นเรียน + ชุมนุม + อีเมล + รหัสผ่าน — หรือใช้ \"เข้าสู่ระบบด้วย Google\" เพื่อให้เร็วกว่า"),
    stepBox(3, "อนุญาต Push Notification", "เมื่อระบบขออนุญาต ให้กด \"Allow\" — เพื่อรับแจ้งเตือนเครื่องที่ใกล้คืน, บอสใหม่, อนุมัติคลิป"),
    P(""),

    // Feature 2: Dashboard
    H2("🏠 ฟีเจอร์ที่ 2: หน้าหลักของนักเรียน"),
    P("หลังเข้าสู่ระบบ คุณจะเห็นข้อมูลสำคัญในหน้าเดียว:"),
    BULLET("Avatar + ชื่อ + Level ปัจจุบัน + Class/Group"),
    BULLET("แถบ EXP — แสดงคะแนนปัจจุบัน + เหลืออีกเท่าไหร่ถึง Level ถัดไป"),
    BULLET("Streak Banner — แสดงจำนวนวันที่ซ้อมต่อเนื่อง (สีส้ม-แดง)"),
    BULLET("Stats Grid — เครื่องที่ยืม / คลิปที่ดู / เหรียญที่ได้"),
    BULLET("ภารกิจวันนี้ — งานที่แนะนำให้ทำเพื่อรับ EXP"),
    BULLET("ทางลัด 4 ปุ่ม — ยืมเครื่อง / ล่าบอส / แชร์คลิป / แจ้งซ่อม"),
    P(""),

    // Feature 3: Borrow
    H2("🎺 ฟีเจอร์ที่ 3: ยืมเครื่องดนตรี"),
    stepBox(1, "กดเมนู \"ยืม\" ที่ Bottom Nav", "อยู่ที่มุมขวาล่าง สีฟ้า"),
    stepBox(2, "สแกน QR Code", "หันกล้องไปที่ QR ที่ติดอยู่บนเครื่องดนตรี — หรือเลือกจากรายการเครื่องที่ \"พร้อมยืม\" ด้านล่าง"),
    stepBox(3, "ยืนยันการยืม", "ระบบแสดงข้อมูลเครื่อง + กำหนดคืน (7 วัน) — กด \"ยืนยัน\""),
    stepBox(4, "รับ Push Notification", "ระบบส่งแจ้งเตือนยืนยันการยืมไปที่มือถือคุณและครู"),
    stepBox(5, "คืนเครื่อง", "ก่อนกำหนด — กดเมนู \"ยืม\" → \"คืน\" → สแกน QR เดิม"),
    P(""),

    // Feature 4: Learning Feed
    H2("📚 ฟีเจอร์ที่ 4: คลังความรู้ (Learning Feed)"),
    stepBox(1, "เปิดเมนู \"เรียน\"", "ที่ Bottom Nav — ไอคอนหนังสือ"),
    stepBox(2, "เลือกคลิป", "เลื่อนดูคลิปที่ครูและเพื่อนแชร์ — แต่ละคลิปแสดง EXP ที่จะได้"),
    stepBox(3, "ดูจนจบ", "ระบบจะตรวจจับว่าดูครบ 80% ขึ้นไป → ปลดล็อก EXP"),
    stepBox(4, "รับ EXP อัตโนมัติ", "ตัวเลข EXP จะวิ่งขึ้นในแถบ Dashboard + ได้ Push notif หากปลดล็อกเหรียญใหม่"),
    P(""),

    // Feature 5: Share Clip
    H2("🎬 ฟีเจอร์ที่ 5: แชร์คลิปการเรียนรู้"),
    P("คุณสามารถแชร์คลิปที่คุณสร้างเอง หรือคลิปที่คุณคิดว่าจะมีประโยชน์ต่อเพื่อน:"),
    stepBox(1, "เปิดเมนู \"แชร์คลิป\"", "ที่ Dashboard — ปุ่ม 🎬 แชร์คลิป"),
    stepBox(2, "กรอกฟอร์ม", "เลือกประเภทเครื่อง + ชื่อคลิป + ลิงก์ YouTube/Drive + คำอธิบาย"),
    stepBox(3, "ส่งให้ครูตรวจ", "กด \"ส่งให้ครูตรวจ\" — รออนุมัติ ภายใน 24 ชม."),
    stepBox(4, "เมื่อครูอนุมัติ", "ได้ +100 XP ทันที + Push Notification + คลิปเข้าฟีดให้เพื่อนได้ดู"),
    P(""),

    // Feature 6: Boss Raid
    H2("🐉 ฟีเจอร์ที่ 6: ล่าบอส (Boss Raid)"),
    CALLOUT("ระบบสอบดนตรีแบบ Multiplayer 4 คน — สนุก ยุติธรรม รวดเร็ว", "F3E8FF", "6B21A8"),
    P(""),
    H3("วิธีที่ 1: เข้าปาร์ตี้ของครู (Lobby Mode)"),
    stepBox(1, "ครูเปิดห้อง", "ครูจะแจ้งรหัส 4 หลัก (เช่น A7K3) ในห้องเรียน"),
    stepBox(2, "เปิดเมนู \"ล่าบอส\"", "ที่ Bottom Nav — ไอคอนมังกร 🐉"),
    stepBox(3, "เลือกบอส + กด \"เข้าปาร์ตี้\"", "ใส่รหัส 4 หลักที่ครูแจ้ง"),
    stepBox(4, "รอเพื่อนครบ + เริ่มสอบ", "ครูกด \"เริ่มสอบ\" → คุณบรรเลงเครื่องดนตรีให้ครูดู"),
    stepBox(5, "รับผลคะแนน", "ครูตัดสินผ่าน/ตก พร้อมกัน → ระบบให้รางวัล EXP + Stars อัตโนมัติ"),
    P(""),
    H3("วิธีที่ 2: ส่งคลิปสอบ (Async Mode)"),
    stepBox(1, "บันทึกคลิปการบรรเลง", "ตัวคนเดียวที่บ้าน — ตามภารกิจของบอส"),
    stepBox(2, "อัปโหลดไป YouTube/Drive", "ตั้งเป็น \"Unlisted\" หรือเปิดดูได้"),
    stepBox(3, "เลือกบอส + กด \"ส่งคลิปสอบ\"", "วาง URL → กดส่ง"),
    stepBox(4, "รอครูตรวจ", "ภายใน 48 ชม. — Push Notification เมื่อมีผล"),
    P(""),

    // Feature 7: Repair
    H2("🛠️ ฟีเจอร์ที่ 7: แจ้งซ่อมเครื่อง"),
    stepBox(1, "เปิด \"แจ้งซ่อม\"", "จาก Dashboard ทางลัด"),
    stepBox(2, "เลือกเครื่อง + อธิบายอาการ", "ตัวอย่าง: \"คีย์ที่ 3 ติด กดยาก, มีเสียงผิด\""),
    stepBox(3, "แนบรูปภาพ (ไม่บังคับ)", "ถ่ายรูปบริเวณที่เสีย"),
    stepBox(4, "ส่งคำร้อง", "ครูได้รับ Push Notification → เริ่มดำเนินการ"),
    stepBox(5, "ติดตามสถานะ", "Timeline แสดงสถานะ Real-time: รับคำร้อง → ตรวจสอบ → กำลังซ่อม → เสร็จ"),
    P(""),

    // Feature 8: Badges
    H2("🏆 ฟีเจอร์ที่ 8: เหรียญตรา + อันดับ"),
    P("ระบบมี 24 เหรียญตราที่ปลดล็อกตามความสำเร็จ:"),
    P(""),
    new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [3120, 6240],
        rows: [
            ["🥇 มือใหม่", "ลงทะเบียนสำเร็จ"],
            ["🔥 7 วันติด", "ซ้อมต่อเนื่อง 7 วัน"],
            ["🎬 นักเรียนรู้", "ดูคลิป 10 คลิป"],
            ["🐉 ปราบบอส", "ผ่านบอสครั้งแรก"],
            ["📚 นักแชร์", "แชร์คลิปได้รับอนุมัติ 5 คลิป"],
            ["⭐ ดาวรุ่ง", "ติด Top 3 ของชุมนุม"],
            ["👑 ราชาดนตรี", "Level 20+ (ซ่อนไว้)"],
            ["💎 ตำนาน", "ปลดล็อกเหรียญครบ 20 (ซ่อนไว้)"]
        ].map((row, i) => new TableRow({ children: [
            new TableCell({ width: { size: 3120, type: WidthType.DXA }, borders: borderAll,
                shading: { fill: i % 2 === 0 ? LIGHT_BLUE : "FFFFFF", type: ShadingType.CLEAR },
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: row[0], bold: true, size: 22, color: DEEP_BLUE, font: "Sarabun" })] })] }),
            new TableCell({ width: { size: 6240, type: WidthType.DXA }, borders: borderAll,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [new Paragraph({ children: [new TextRun({ text: row[1], size: 22, font: "Sarabun" })] })] })
        ] }))
    }),
    P(""),
    P("Leaderboard:"),
    BULLET("รายห้องเรียน — เทียบกับเพื่อนห้องเดียวกัน"),
    BULLET("รายชุมนุม — เทียบกับสมาชิกชุมนุมดนตรี"),
    BULLET("รายเดือน — รีเซ็ตทุกเดือน เพื่อความยุติธรรมกับเด็กใหม่"),
    PB()
);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: TECHNICAL ARCHITECTURE
// ═══════════════════════════════════════════════════════════════
content.push(
    H1("ส่วนที่ 4: Technical Architecture"),
    H2("🏗️ สถาปัตยกรรมระบบ"),
    P("ระบบใช้สถาปัตยกรรม JAMstack สมัยใหม่ ที่เร็ว ปลอดภัย และขยายได้:"),
    P(""),
    new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [3120, 6240],
        rows: [
            ["Frontend", "Vanilla JavaScript ES Modules + HTML + CSS — โหลดเร็ว ไม่มี framework dependency"],
            ["Backend", "Supabase (PostgreSQL + Auth + Edge Functions + Realtime) — Backend-as-a-Service"],
            ["Hosting", "Vercel — CDN ระดับโลก SSL อัตโนมัติ"],
            ["Push", "Web Push API + VAPID + Service Worker — รองรับ iOS/Android/Desktop"],
            ["PWA", "Manifest + Service Worker + Offline Cache — ติดตั้งได้เหมือน App"],
            ["Realtime", "Supabase Realtime (WebSocket) — สำหรับ Boss Raid Lobby"],
            ["Database", "PostgreSQL with Row Level Security (RLS) — ความปลอดภัยระดับฐานข้อมูล"]
        ].map((row, i) => new TableRow({ children: [
            new TableCell({ width: { size: 3120, type: WidthType.DXA }, borders: borderAll,
                shading: { fill: i % 2 === 0 ? "EFF6FF" : "FFFFFF", type: ShadingType.CLEAR },
                margins: { top: 100, bottom: 100, left: 160, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: row[0], bold: true, size: 22, color: BLUE, font: "Sarabun" })] })] }),
            new TableCell({ width: { size: 6240, type: WidthType.DXA }, borders: borderAll,
                margins: { top: 100, bottom: 100, left: 160, right: 100 },
                children: [new Paragraph({ children: [new TextRun({ text: row[1], size: 22, font: "Sarabun" })] })] })
        ] }))
    }),
    P(""),

    H2("📊 Data Flow ของ Push Notification"),
    P("ตัวอย่าง: เมื่อครูเปิดบอสใหม่ → นักเรียนรับ Notification ภายใน 2 วินาที"),
    NUM("ครูกด \"เปิดบอส\" → INSERT row ใน notifications table"),
    NUM("Database Trigger ส่ง HTTP request ไปที่ Edge Function (send-push)"),
    NUM("Edge Function โหลด VAPID keys + ดึง subscription ของนักเรียนทั้งหมด"),
    NUM("ส่ง Web Push payload ไปที่ FCM (Android) / APNs (iOS)"),
    NUM("Service Worker บนมือถือนักเรียน ได้รับ event \"push\" → showNotification()"),
    NUM("มือถือเด้งแจ้งเตือน — แม้ปิดเบราว์เซอร์อยู่"),
    P(""),

    H2("🛡️ ความปลอดภัย"),
    BULLET("Row Level Security (RLS) — ทุก query ผ่าน Policy ของ Supabase"),
    BULLET("VAPID Authentication สำหรับ Push — ป้องกันการปลอมตัว"),
    BULLET("HTTPS only — Vercel บังคับ SSL"),
    BULLET("Soft Block System — แอดมินบล็อกผู้ใช้ที่ทำผิดกฎโดยไม่ลบบัญชี"),
    BULLET("XP Anti-cheat — ทุก EXP ผ่าน Database Trigger ตรวจสอบ"),
    P(""),

    H2("📱 รองรับอุปกรณ์"),
    new Table({
        width: { size: 9360, type: WidthType.DXA }, columnWidths: [4680, 4680],
        rows: [
            ["✅ Android (Chrome)", "ครบทุกฟีเจอร์ + Push Notification"],
            ["✅ iOS Safari (16.4+)", "ครบทุกฟีเจอร์ — ต้อง Add to Home Screen ก่อนใช้ Push"],
            ["✅ Desktop Browser", "ครบทุกฟีเจอร์"],
            ["⚠️ iOS Safari (<16.4)", "ดูได้ แต่ Push ไม่รองรับ"]
        ].map((row, i) => new TableRow({ children: row.map(cell => new TableCell({
            width: { size: 4680, type: WidthType.DXA }, borders: borderAll,
            margins: { top: 100, bottom: 100, left: 160, right: 100 },
            shading: { fill: i % 2 === 0 ? LIGHT_GRAY : "FFFFFF", type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: cell, size: 22, font: "Sarabun" })] })]
        })) }))
    }),
    PB(),

    H1("📎 ภาคผนวก"),
    H2("🔗 ลิงก์สำคัญ"),
    BULLET("เว็บไซต์ใช้งานจริง: music-borrow.vercel.app"),
    BULLET("Interactive Demo (HTML): demo-presentation.html (เปิดในเบราว์เซอร์)"),
    P(""),
    H2("📞 ติดต่อผู้พัฒนา"),
    P("warattapob24@gmail.com"),
    P(""),
    H2("📜 License & Credits"),
    P("ระบบนี้พัฒนาขึ้นเพื่อใช้ในโรงเรียน — ไม่ใช่เชิงพาณิชย์"),
    BULLET("Backend: Supabase (Apache 2.0)"),
    BULLET("Hosting: Vercel"),
    BULLET("UI Framework: Pico CSS + Custom CSS"),
    BULLET("Icons: Emoji (Unicode)"),
    P(""),
    new Paragraph({ spacing: { before: 800 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "🎵 ขอบคุณที่อ่านจนจบ — ขอให้การประกวดประสบความสำเร็จ! ✨", bold: true, size: 26, color: BLUE, font: "Sarabun" })] })
);

// ═══════════════════════════════════════════════════════════════
// 📦 BUILD DOCUMENT
// ═══════════════════════════════════════════════════════════════
const doc = new Document({
    creator: "ระบบยืมคืนเครื่องดนตรี v5.2",
    title: "คู่มือการใช้งาน + ข้อเสนอนวัตกรรม",
    description: "Innovation Pitch + User Manual for Music Borrow System v5.2",
    styles: {
        default: {
            document: { run: { font: "Sarabun", size: 22 } }
        },
        paragraphStyles: [
            { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
                run: { size: 36, bold: true, font: "Sarabun", color: DEEP_BLUE },
                paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
            { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
                run: { size: 28, bold: true, font: "Sarabun", color: BLUE },
                paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
            { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
                run: { size: 24, bold: true, font: "Sarabun", color: DARK },
                paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 } }
        ]
    },
    numbering: {
        config: [
            { reference: "bullets", levels: [
                { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
                    style: { paragraph: { indent: { left: 720, hanging: 360 } },
                             run: { font: "Sarabun" } } }
            ] },
            { reference: "numbers", levels: [
                { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
                    style: { paragraph: { indent: { left: 720, hanging: 360 } },
                             run: { font: "Sarabun" } } }
            ] }
        ]
    },
    sections: [{
        properties: {
            page: {
                size: { width: 11906, height: 16838 }, // A4
                margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
            }
        },
        headers: {
            default: new Header({ children: [new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [new TextRun({ text: "🎵 ระบบยืมคืนเครื่องดนตรี v5.2 — คู่มือ + ข้อเสนอนวัตกรรม", size: 18, color: GRAY, italics: true, font: "Sarabun" })]
            })] })
        },
        footers: {
            default: new Footer({ children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    new TextRun({ text: "หน้า ", size: 18, color: GRAY, font: "Sarabun" }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 18, color: GRAY, font: "Sarabun" }),
                    new TextRun({ text: " / ", size: 18, color: GRAY, font: "Sarabun" }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: GRAY, font: "Sarabun" })
                ]
            })] })
        },
        children: content
    }]
});

Packer.toBuffer(doc).then(buf => {
    const out = path.join(__dirname, "คู่มือ-ระบบยืมคืนเครื่องดนตรี-v5.2.docx");
    fs.writeFileSync(out, buf);
    const sizeKB = (buf.length / 1024).toFixed(1);
    console.log(`✅ สร้างไฟล์สำเร็จ: ${out}`);
    console.log(`📦 ขนาดไฟล์: ${sizeKB} KB`);
}).catch(err => {
    console.error("❌ Error:", err);
    process.exit(1);
});
