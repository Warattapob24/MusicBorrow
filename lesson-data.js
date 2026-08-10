window.LESSON_CATALOG = [
    {
        id: "basics-1",
        title: "ด่านที่ 1: พื้นฐานของบรรทัด 5 เส้น (The Staff, Clefs, and Ledger Lines)",
        description: "เรียนรู้เรื่อง The Staff, Clefs และ Ledger Lines ตามบทเรียนมาตรฐาน",
        slides: [
            {
                type: "info",
                title: "บรรทัด 5 เส้น (The Staff)",
                speaker: "boss",
                speakerName: "Noise Demon",
                text: "<strong>บรรทัด 5 เส้น (The Staff)</strong> คือรากฐานของการวาดตัวโน้ต<br>ในปัจจุบันประกอบด้วยเส้น 5 เส้น และช่องว่าง 4 ช่อง โดยทุกๆ เส้นหรือช่องว่างจะแทนคีย์สีขาวบนคีย์บอร์ด 1 คีย์",
                abc: "X:1\nK:C\nL:1/4\n[V:1] x4 |]"
            },
            {
                type: "info",
                title: "กุญแจประจำหลัก (Clefs)",
                speaker: "hero",
                speakerName: "Hero",
                text: "<strong>Clefs</strong> ใช้กำหนดโน้ตลงบนเส้นหรือช่อง โดยทั่วไปมี 2 แบบคือ <strong>Treble Clef</strong> (กุญแจซอล) และ <strong>Bass Clef</strong> (กุญแจฟา)<br>เส้นที่กุญแจซอลม้วนทับคือเส้น G (ซอล) โน้ตใดๆ ที่วางบนเส้นนี้จะเป็นโน้ต G",
                abc: "X:1\nK:C\nL:1/1\n[V:1] G |]"
            },
            {
                type: "info",
                title: "การไล่เสียงโน้ต (Notes on the Staff)",
                speaker: "boss",
                speakerName: "Noise Demon",
                text: "โน้ตในช่องว่างเหนือ G คือ A และบนเส้นเหนือ A คือ B ไล่ขึ้นไปเรื่อยๆ C, D, E, F, G...<br><span style='color:#ef4444;'>อ๊ะ! เราไม่มีพื้นที่พอจะวางโน้ตสูงกว่านี้แล้ว ทำยังไงดี?</span>",
                abc: "X:1\nK:C\nL:1/4\n[V:1] G A B c | d e f g |]"
            },
            {
                type: "info",
                title: "เส้นน้อย (Ledger Lines)",
                speaker: "hero",
                speakerName: "Hero",
                text: "<strong>เส้นน้อย (Ledger Lines)</strong> จะช่วยแก้ปัญหานี้! มันคือเส้นสั้นๆ ที่ต่อขยายบรรทัด 5 เส้นออกไปเมื่อเราไม่มีพื้นที่พอ ทำให้เราสามารถเขียนโน้ตที่สูงหรือต่ำมากๆ ได้",
                abc: "X:1\nK:C\nL:1/4\n[V:1] a b c' d' |]"
            },
            {
                type: "info",
                title: "บรรทัดรวม (The Grand Staff)",
                speaker: "hero",
                speakerName: "Hero",
                text: "เมื่อเรานำกุญแจซอลไว้ด้านบน และกุญแจฟาไว้ด้านล่าง เราจะเรียกว่า <strong>The Grand Staff</strong><br>สังเกตว่ากุญแจทั้งสองจะถูก 'เชื่อม' เข้าด้วยกันด้วยโน้ตตัว C ตรงกลาง ซึ่งเรามักจะเรียกว่า <strong>Middle C</strong>",
                abc: "X:1\nK:C\nL:1/1\n%%staves {1 2}\nV:1 clef=treble\nV:2 clef=bass\n[V:1] c |]\n[V:2] c' |]" // middle C on both
            },
            {
                type: "speed-quiz",
                title: "Boss Fight! ทบทวนความจำ",
                speaker: "boss",
                speakerName: "Noise Demon",
                text: "รับการโจมตีจากบทเรียนไปซะ! จงตอบให้ถูก 5 ข้อรวด!",
                questions: [
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nz |]", question: "บรรทัด 5 เส้น (The modern staff) ประกอบด้วยอะไรบ้าง?", options: ["5 เส้น 5 ช่อง", "4 เส้น 5 ช่อง", "5 เส้น 4 ช่อง", "6 เส้น 4 ช่อง"], correctIndex: 2 },
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nz |]", question: "กุญแจซอล (Treble Clef) ม้วนทับเส้นที่เป็นโน้ตอะไร?", options: ["C", "F", "A", "G"], correctIndex: 3 },
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nz |]", question: "เมื่อเราไม่มีที่พอจะวางโน้ตบนบรรทัด 5 เส้น เราต้องใช้อะไรแก้ปัญหา?", options: ["Treble Clefs", "Ledger Lines", "Bass Clefs", "Grand Staff"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nz |]", question: "โน้ตที่ทำหน้าที่ 'เชื่อม' กุญแจซอลและกุญแจฟาบน Grand Staff คือโน้ตอะไร?", options: ["High G", "Middle C", "Low F", "Middle A"], correctIndex: 1 },
                    { type: "note", abc: "X:1\nK:C\nL:1/1\nC |]", targetNote: "C4", question: "กดคีย์ Middle C ให้ถูกต้อง!" }
                ]
            }
        ]
    },
    {
        id: "basics-2",
        title: "ด่านที่ 2: ค่าของตัวโน้ต (Note Duration)",
        description: "เรียนรู้เรื่อง Note Duration, Whole, Half, Quarter, Eighth, Sixteenth notes",
        slides: [
            {
                type: "info",
                title: "ค่าความยาว (Note Duration)",
                speaker: "boss",
                speakerName: "Treble Trickster",
                text: "ความยาวของเวลาที่โน้ตถูกเล่นเรียกว่า <strong>Note Duration</strong> ซึ่งกำหนดโดยรูปแบบของตัวโน้ต<br><strong>Whole note (โน้ตตัวกลม)</strong> เป็นโน้ตที่มีความยาวมากที่สุดในดนตรียุคใหม่",
                abc: "X:1\nK:C\nL:1/1\nC |]"
            },
            {
                type: "info",
                title: "โน้ตตัวขาว (Half Note)",
                speaker: "hero",
                speakerName: "Hero",
                text: "<strong>Half note (โน้ตตัวขาว)</strong> มีค่าความยาวเป็นครึ่งหนึ่งของโน้ตตัวกลม<br>ดังนั้น โน้ตตัวขาว 2 ตัว จะใช้เวลาในการเล่นเท่ากับ โน้ตตัวกลม 1 ตัว",
                abc: "X:1\nK:C\nL:1/2\nC C |]"
            },
            {
                type: "info",
                title: "โน้ตตัวดำ (Quarter Note)",
                speaker: "hero",
                speakerName: "Hero",
                text: "<strong>Quarter note (โน้ตตัวดำ)</strong> มีค่าเป็น 1 ใน 4 (quarter) ของโน้ตตัวกลม<br>โน้ตตัวดำ 4 ตัว = โน้ตตัวกลม 1 ตัว และ โน้ตตัวดำ 2 ตัว = โน้ตตัวขาว 1 ตัว",
                abc: "X:1\nK:C\nL:1/4\nC C C C |]"
            },
            {
                type: "info",
                title: "ชายธง (Flags) และ เขบ็ต 1 ชั้น",
                speaker: "boss",
                speakerName: "Treble Trickster",
                text: "โน้ตที่มีความสั้นกว่าโน้ตตัวดำจะมี <strong>Flags (ชายธง)</strong> ชายธงแต่ละเส้นจะลดค่าความยาวโน้ตลงครึ่งหนึ่งเสมอ<br><strong>Eighth note (โน้ตเขบ็ต 1 ชั้น)</strong> มีชายธง 1 เส้น ดังนั้น โน้ตเขบ็ต 1 ชั้น 2 ตัว = โน้ตตัวดำ 1 ตัว",
                abc: "X:1\nK:C\nL:1/8\nC C |]"
            },
            {
                type: "info",
                title: "เขบ็ต 2 ชั้น (Sixteenth Note)",
                speaker: "hero",
                speakerName: "Hero",
                text: "<strong>Sixteenth note (โน้ตเขบ็ต 2 ชั้น)</strong> มีชายธง 2 เส้น ทำให้ค่าความยาวลดลงอีกครึ่ง<br>ต้องใช้โน้ตเขบ็ต 2 ชั้นถึง 4 ตัว จึงจะกินเวลาเท่ากับโน้ตตัวดำ (Quarter note) 1 ตัว",
                abc: "X:1\nK:C\nL:1/16\nC C C C |]"
            },
            {
                type: "speed-quiz",
                title: "Boss Fight! ทบทวนความจำ",
                speaker: "boss",
                speakerName: "Treble Trickster",
                text: "เตรียมตัวรับการโจมตี! ตอบคำถามเรื่อง Note Duration ให้ถูก 5 ข้อรวด!",
                questions: [
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nC |]", question: "โน้ตชนิดใดที่มีความยาวมากที่สุดในดนตรียุคใหม่?", options: ["Half note", "Eighth note", "Whole note", "Quarter note"], correctIndex: 2 },
                    { type: "term", abc: "X:1\nK:C\nL:1/2\nC |]", question: "โน้ตตัวขาว (Half note) 2 ตัว มีค่าเวลาเท่ากับโน้ตใด 1 ตัว?", options: ["Quarter note", "Whole note", "Eighth note", "Sixteenth note"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nL:1/4\nC |]", question: "ต้องใช้โน้ตตัวดำ (Quarter note) กี่ตัว ถึงจะมีค่าเท่ากับโน้ตตัวกลม (Whole note) 1 ตัว?", options: ["2 ตัว", "3 ตัว", "4 ตัว", "8 ตัว"], correctIndex: 2 },
                    { type: "term", abc: "X:1\nK:C\nL:1/8\nC |]", question: "สิ่งใดที่อยู่บนตัวโน้ต ซึ่งทำหน้าที่ลดค่าความยาวของโน้ตลงครึ่งหนึ่ง?", options: ["Ledger Line", "Clef", "Flag (ชายธง)", "Stem (ก้าน)"], correctIndex: 2 },
                    { type: "term", abc: "X:1\nK:C\nL:1/16\nC |]", question: "โน้ตเขบ็ต 2 ชั้น (Sixteenth note) มีชายธง (Flags) กี่เส้น?", options: ["1 เส้น", "2 เส้น", "3 เส้น", "ไม่มีชายธง"], correctIndex: 1 }
                ]
            }
        ]
    },
    {
        id: "basics-3",
        title: "ด่านที่ 3: ห้องเพลง และจังหวะ (Measures and Time Signature)",
        description: "เรียนรู้เรื่อง Bar lines, Measures, 4/4, 3/4, 6/8, 3/2 time signatures",
        slides: [
            {
                type: "info",
                title: "Bar lines และ Measures",
                speaker: "boss",
                speakerName: "Scale Serpent",
                text: "เส้นแนวตั้งสีดำเรียกว่า <strong>Bar lines (เส้นกั้นห้อง)</strong> ใช้แบ่งบรรทัด 5 เส้นออกเป็นส่วนๆ ที่เรียกว่า <strong>Measures (ห้องเพลง)</strong><br>ตัวอย่างนี้บรรทัดถูกแบ่งออกเป็น 2 ห้องเพลง",
                abc: "X:1\nK:C\nL:1/4\nx4 | x4 |]"
            },
            {
                type: "info",
                title: "Time Signatures",
                speaker: "hero",
                speakerName: "Hero",
                text: "<strong>Time signatures (เครื่องหมายกำหนดจังหวะ)</strong> ใช้กำหนดจำนวนและประเภทของตัวโน้ตที่แต่ละห้องเพลงบรรจุอยู่",
                abc: "X:1\nK:C\nM:4/4\nL:1/4\nx4 |]"
            },
            {
                type: "info",
                title: "จังหวะ 4/4 และ 3/4",
                speaker: "boss",
                speakerName: "Scale Serpent",
                text: "สมมติห้องแรกเป็น <strong>4/4</strong> จะแปลว่ามีโน้ตตัวดำ (Quarter note) ได้ 4 ตัวใน 1 ห้อง<br>ถ้าเป็น <strong>3/4</strong> เลข 3 ด้านบนคือจำนวน (Three) ส่วนเลข 4 ด้านล่างคือประเภทโน้ต (Quarter note) แปลว่ามีโน้ตตัวดำ 3 ตัว",
                abc: "X:1\nK:C\nM:3/4\nL:1/4\nC C C |]"
            },
            {
                type: "info",
                title: "จังหวะที่ไม่ได้ใช้โน้ตตัวดำ",
                speaker: "hero",
                speakerName: "Hero",
                text: "เรามาดู Time signature ที่ไม่ได้ใช้โน้ตตัวดำกันบ้าง<br>อย่างเช่น <strong>6/8</strong> เลข 8 ด้านล่างหมายถึงโน้ตเขบ็ต 1 ชั้น (Eighth note) ดังนั้นจังหวะนี้คือมีโน้ตเขบ็ต 1 ชั้น 6 ตัวใน 1 ห้อง",
                abc: "X:1\nK:C\nM:6/8\nL:1/8\nC C C C C C |]"
            },
            {
                type: "info",
                title: "จังหวะ 3/2",
                speaker: "hero",
                speakerName: "Hero",
                text: "แล้วถ้าเป็น <strong>3/2</strong> ล่ะ? เลข 2 ด้านล่างหมายถึงโน้ตตัวขาว (Half note)<br>ดังนั้นจังหวะ 3/2 จึงหมายความว่าใน 1 ห้อง จะบรรจุโน้ตตัวขาวได้ 3 ตัว นั่นเอง!",
                abc: "X:1\nK:C\nM:3/2\nL:1/2\nC C C |]"
            },
            {
                type: "speed-quiz",
                title: "Boss Fight! ทลายอาคม",
                speaker: "boss",
                speakerName: "Scale Serpent",
                text: "รับการทดสอบจังหวะของข้าไปซะ! ตอบให้ถูก 5 ข้อรวด!",
                questions: [
                    { type: "term", abc: "X:1\nK:C\nL:1/4\nx4 | x4 |]", question: "เส้นแนวตั้งสีดำที่ใช้แบ่งบรรทัด 5 เส้นออกเป็นส่วนๆ เรียกว่าอะไร?", options: ["Clefs", "Ledger lines", "Bar lines", "Stems"], correctIndex: 2 },
                    { type: "term", abc: "X:1\nK:C\nM:4/4\nL:1/4\nC C C C |]", question: "ในจังหวะ 4/4 ห้องหนึ่งจะมีโน้ตตัวดำ (Quarter note) ได้กี่ตัว?", options: ["2 ตัว", "3 ตัว", "4 ตัว", "8 ตัว"], correctIndex: 2 },
                    { type: "term", abc: "X:1\nK:C\nM:3/4\nL:1/4\nC C C |]", question: "Time signature 3/4 เลข 3 ด้านบนหมายความว่าอย่างไร?", options: ["โน้ตยาว 3 จังหวะ", "มีโน้ตตัวดำ 3 ตัวใน 1 ห้อง", "เล่น 3 รอบ", "ใช้โน้ตตัวขาว"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nM:6/8\nL:1/8\nC C C C C C |]", question: "ในจังหวะ 6/8 ห้องหนึ่งจะบรรจุโน้ตชนิดใด และจำนวนกี่ตัว?", options: ["เขบ็ต 1 ชั้น 6 ตัว", "ตัวดำ 6 ตัว", "ตัวกลม 8 ตัว", "ตัวขาว 6 ตัว"], correctIndex: 0 },
                    { type: "term", abc: "X:1\nK:C\nM:3/2\nL:1/2\nC C C |]", question: "ในจังหวะ 3/2 ห้องหนึ่งจะบรรจุโน้ตชนิดใด และจำนวนกี่ตัว?", options: ["ตัวขาว 2 ตัว", "ตัวขาว 3 ตัว", "เขบ็ต 2 ชั้น 3 ตัว", "ตัวดำ 3 ตัว"], correctIndex: 1 }
                ]
            }
        ]
    },
    {
        id: "basics-4",
        title: "ด่านที่ 4: ค่าของตัวหยุด (Rest Duration)",
        description: "เรียนรู้เรื่อง Whole, half, quarter, eighth, sixteenth rests",
        slides: [
            {
                type: "info",
                title: "ตัวหยุด (Rests)",
                speaker: "boss",
                speakerName: "Minor Minotaur",
                text: "<strong>ตัวหยุด (Rests)</strong> ใช้แทนช่วงเวลาแห่งความเงียบในแต่ละห้องเพลง<br>ตัวหยุดแต่ละชนิดจะมีความยาวเท่ากับตัวโน้ตชนิดนั้นๆ เช่น <strong>Quarter rest (ตัวหยุดตัวดำ)</strong> จะกินเวลาเท่ากับ Quarter note (โน้ตตัวดำ) ซึ่งในขณะที่ตัวโน้ตทำให้เกิดเสียง ตัวหยุดจะทำให้เกิดความเงียบ",
                abc: "X:1\nK:C\nM:4/4\nL:1/4\nC z |]"
            },
            {
                type: "info",
                title: "โน้ตตัวดำ 4 ตัว",
                speaker: "hero",
                speakerName: "Hero",
                text: "เพื่อแสดงให้เห็นภาพ ลองใส่โน้ตตัวดำ 4 ตัวในห้องจังหวะ 4/4<br>เมื่อเล่น โน้ตทั้ง 4 ตัวจะมีเสียงดังออกมาทั้งหมด<br><br><button onclick=\"event.stopPropagation(); playDemo('4-notes', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 กดฟังเสียงโน้ต 4 ตัว</button>",
                abc: "X:1\nK:C\nM:4/4\nL:1/4\nC C C C |]"
            },
            {
                type: "info",
                title: "ตัวหยุดตัวดำ (Quarter Rest)",
                speaker: "boss",
                speakerName: "Minor Minotaur",
                text: "ต่อไปเราจะแทนที่โน้ตตัวที่ 2 ด้วย <strong>Quarter rest</strong><br>เมื่อเล่น จังหวะที่ 2 จะกลายเป็นความเงียบทันที!<br><br><button onclick=\"event.stopPropagation(); playDemo('3-notes-rest', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-rose-500 to-red-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 กดฟังเสียง (เว้นจังหวะที่ 2)</button>",
                abc: "X:1\nK:C\nM:4/4\nL:1/4\nC z C C |]"
            },
            {
                type: "info",
                title: "ตัวหยุดตัวกลมและตัวขาว",
                speaker: "hero",
                speakerName: "Hero",
                text: "<strong>Whole rest (ตัวหยุดตัวกลม)</strong> มีความยาวเท่ากับโน้ตตัวกลม วาดเป็นกล่องห้อยลงมาจากเส้นที่ 4<br><strong>Half rest (ตัวหยุดตัวขาว)</strong> มีความยาวเท่ากับโน้ตตัวขาว วาดเป็นกล่องวางอยู่บนเส้นที่ 3 (เส้นกลาง)",
                abc: "X:1\nK:C\nL:1/4\n%%staves {1 2}\nV:1\nV:2\n[V:1] z4 |]\n[V:2] z2 z2 |]"
            },
            {
                type: "info",
                title: "ตัวหยุดที่มีชายธง (Flags)",
                speaker: "boss",
                speakerName: "Minor Minotaur",
                text: "เหมือนกับตัวโน้ต ตัวหยุดก็มีชายธง (Flags) ได้เช่นกัน!<br><strong>Eighth rest (ตัวหยุดเขบ็ต 1 ชั้น)</strong> มี 1 ชายธง มีค่าเท่ากับโน้ตเขบ็ต 1 ชั้น<br><strong>Sixteenth rest (ตัวหยุดเขบ็ต 2 ชั้น)</strong> มี 2 ชายธง มีค่าเท่ากับโน้ตเขบ็ต 2 ชั้น",
                abc: "X:1\nK:C\nL:1/8\nz z/2 |]"
            },
            {
                type: "speed-quiz",
                title: "Boss Fight! ทดสอบความเงียบ",
                speaker: "boss",
                speakerName: "Minor Minotaur",
                text: "จงแยกแยะความเงียบให้ถูกต้อง! ตอบให้ถูก 5 ข้อรวด!",
                questions: [
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nz |]", question: "Quarter rest (ตัวหยุดตัวดำ) มีความยาวเท่ากับตัวโน้ตชนิดใด?", options: ["Half note", "Whole note", "Quarter note", "Eighth note"], correctIndex: 2 },
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nz |]", question: "ตัวหยุดที่มีรูปร่างเป็นกล่องห้อยลงมาจากเส้นที่ 4 คือตัวหยุดชนิดใด?", options: ["Half rest", "Whole rest", "Quarter rest", "Eighth rest"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nL:1/2\nz |]", question: "ตัวหยุดที่มีรูปร่างเป็นกล่องวางอยู่บนเส้นที่ 3 (เส้นกลาง) คือตัวหยุดชนิดใด?", options: ["Quarter rest", "Half rest", "Whole rest", "Sixteenth rest"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nL:1/8\nz |]", question: "Eighth rest (ตัวหยุดเขบ็ต 1 ชั้น) มีชายธง (Flags) กี่เส้น?", options: ["2 เส้น", "3 เส้น", "ไม่มีชายธง", "1 เส้น"], correctIndex: 3 },
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nz |]", question: "หน้าที่หลักของ 'ตัวหยุด (Rests)' ในห้องเพลงคืออะไร?", options: ["เพิ่มความดัง", "ทำให้เกิดความเงียบ", "เปลี่ยนคีย์เพลง", "เล่นโน้ตซ้ำ"], correctIndex: 1 }
                ]
            }
        ]
    },
    {
        id: "basics-5",
        title: "ด่านที่ 5: จุดประและเส้นโยงเสียง (Dots and Ties)",
        description: "เรียนรู้เรื่อง Dotted notes และ Tie",
        slides: [
            {
                type: "info",
                title: "เส้นโยงเสียง (Ties)",
                speaker: "boss",
                speakerName: "Slime Blob",
                text: "ยืดดดดด.... ข้าชอบการรวมกัน! <strong>เส้นโยงเสียง (Tie)</strong> ใช้เชื่อมโน้ต 2 ตัวที่ระดับเสียงเดียวกันให้กลายเป็นเสียงเดียวที่ยาวขึ้น! (เช่น ตัวขาว 2 ตัวเชื่อมกัน = 4 จังหวะ)",
                abc: "X:1\nK:C\nM:4/4\nL:1/4\nC2-C2 |]"
            },
            {
                type: "info",
                title: "จุดประ (Dots)",
                speaker: "hero",
                speakerName: "Hero",
                text: "นอกจาก Tie แล้วยังมี <strong>จุดประ (Dot)</strong> ถ้าเติมจุดหลังตัวโน้ต มันจะเพิ่มความยาวอีก <strong>'ครึ่งหนึ่ง'</strong> ของค่าโน้ตเดิม! เช่น โน้ตตัวขาว(2) + ประจุด(1) = 3 จังหวะ",
                abc: "X:1\nK:C\nM:4/4\nL:1/4\nC3 z |]"
            },
            {
                type: "quiz",
                title: "คณิตศาสตร์ดนตรี",
                speaker: "boss",
                speakerName: "Slime Blob",
                text: "จากภาพ โน้ตตัวดำประจุด (Dotted Quarter Note) จะมีค่าความยาวเท่ากับกี่จังหวะ?",
                abc: "X:1\nK:C\nL:1/8\nC3 |]",
                options: ["1 จังหวะ", "1.5 จังหวะ (1 + 0.5)", "2 จังหวะ", "3 จังหวะ"],
                correctIndex: 1
            },
            {
                type: "speed-quiz",
                title: "สลายก้อนหนืด",
                speaker: "boss",
                speakerName: "Slime Blob",
                text: "ยืดดด... รับคอมโบสุดท้ายของข้าไป!",
                questions: [
                    { type: "term", abc: "X:1\nK:C\nM:4/4\nL:1/4\nC3 z |]", question: "จากภาพ โน้ตตัวขาวประจุด (Dotted Half Note) มีค่ากี่จังหวะ?", options: ["2", "3", "4", "1.5"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nM:4/4\nL:1/4\nC2-C2 |]", question: "ในภาพ ถ้าใช้ Tie โยงโน้ตตัวขาว 2 ตัว (2+2) เสียงจะลากยาวกี่จังหวะ?", options: ["2", "4", "6", "3"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nL:1/8\nC3 |]", question: "จากภาพ โน้ตตัวดำประจุด (Dotted Quarter Note) มีค่าเท่าไหร่?", options: ["1 จังหวะ", "1.5 จังหวะ (1 + 0.5)", "2 จังหวะ", "0.5 จังหวะ"], correctIndex: 1 }
                ]
            }
        ]
    },
    {
        id: "basics-6",
        title: "ด่านที่ 6: ครึ่งเสียง เต็มเสียง และเครื่องหมายแปลงเสียง",
        description: "เรียนรู้เรื่อง Half steps, Whole steps, Sharp, Flat, Natural",
        slides: [
            {
                type: "info",
                showPiano: true,
                title: "ครึ่งเสียง (Half Step)",
                speaker: "boss",
                speakerName: "Mutant Pitch",
                text: "ระยะห่างที่ใกล้ที่สุดบนคีย์บอร์ดคือ <strong>ครึ่งเสียง (Half Step)</strong> เช่น จากคีย์ C ไป C# (คีย์ดำที่ติดกัน) ลองกดฟังแล้วนับ 1, 2 ตามข้าสิ!<br><br><button onclick=\"event.stopPropagation(); playDemo('half-step-demo', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 กดฟังเสียงและดูการนับ (ครึ่งเสียง)</button>",
                abc: "X:1\nK:C\nL:1/4\nC ^C |]"
            },
            {
                type: "info",
                showPiano: true,
                title: "เต็มเสียง (Whole Step)",
                speaker: "boss",
                speakerName: "Mutant Pitch",
                text: "หากข้าม 1 คีย์จะเรียกว่า <strong>เต็มเสียง (Whole Step)</strong> ซึ่งมีค่าเท่ากับ 2 ครึ่งเสียง! เช่น C ข้ามคีย์ดำไปหา D ลองกดฟังดู!<br><br><button onclick=\"event.stopPropagation(); playDemo('whole-step-demo', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 กดฟังเสียงและดูการนับ (เต็มเสียง)</button>",
                abc: "X:1\nK:C\nL:1/4\nC D |]"
            },
            {
                type: "info",
                showPiano: true,
                title: "เครื่องหมาย Sharp (#)",
                speaker: "hero",
                speakerName: "Hero",
                text: "อ๋อ! เครื่องหมาย <strong>Sharp (#)</strong> จะทำให้เสียงสูงขึ้น <strong>ครึ่งเสียง</strong> (เลื่อนไปทางขวา 1 คีย์) เช่นจาก F กลายเป็น F#<br><br><button onclick=\"event.stopPropagation(); playDemo('sharp-demo', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-rose-500 to-red-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 ดูการทำงานของ Sharp (#)</button>",
                abc: "X:1\nK:C\nL:1/4\nF ^F |]"
            },
            {
                type: "info",
                showPiano: true,
                title: "เครื่องหมาย Flat (b)",
                speaker: "hero",
                speakerName: "Hero",
                text: "ส่วนเครื่องหมาย <strong>Flat (b)</strong> จะทำให้เสียงต่ำลง <strong>ครึ่งเสียง</strong> (เลื่อนไปทางซ้าย 1 คีย์) เช่นจาก B กลายเป็น Bb<br><br><button onclick=\"event.stopPropagation(); playDemo('flat-demo', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-rose-500 to-red-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 ดูการทำงานของ Flat (b)</button>",
                abc: "X:1\nK:C\nL:1/4\nB _B |]"
            },
            {
                type: "info",
                showPiano: true,
                title: "เครื่องหมาย Natural (♮)",
                speaker: "hero",
                speakerName: "Hero",
                text: "และถ้าเราต้องการให้โน้ตกลับมาเป็นเสียงปกติล่ะ? เราใช้ <strong>Natural (♮)</strong> เพื่อยกเลิก Sharp หรือ Flat!<br><br><button onclick=\"event.stopPropagation(); playDemo('natural-demo', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-emerald-500 to-green-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 ดูการทำงานของ Natural (♮)</button>",
                abc: "X:1\nK:C\nL:1/4\n^F =F |]"
            },
            {
                type: "speed-quiz",
                title: "Boss ใหญ่ประทับทรง!",
                speaker: "boss",
                speakerName: "Mutant Pitch",
                text: "หึหึ... นี่คือบททดสอบสุดท้ายของ The Basics! จงเอาตัวรอดจากคมเขี้ยวของข้า!",
                questions: [
                    { type: "term", abc: "X:1\nK:C\nL:1/4\n^F |]", question: "เครื่องหมายหน้าโน้ตนี้คือ Sharp (#) ทำหน้าที่อะไร?", options: ["สูงขึ้นครึ่งเสียง", "ต่ำลงครึ่งเสียง", "ยกเลิกการเปลี่ยนแปลง", "เล่นดังขึ้น"], correctIndex: 0 },
                    { type: "term", abc: "X:1\nK:C\nL:1/4\n_B |]", question: "เครื่องหมายหน้าโน้ตนี้คือ Flat (b) ทำหน้าที่อะไร?", options: ["สูงขึ้น", "ต่ำลงครึ่งเสียง", "กลับเป็นปกติ", "เล่นเบาลง"], correctIndex: 1 },
                    { type: "note", abc: "X:1\nK:C\nL:1/1\n^C |]", targetNote: "C#4", question: "กด C# (ลิ่มดำที่ติดกับ C ไปทางขวา)" },
                    { type: "term", abc: "X:1\nK:C\nL:1/4\n=F |]", question: "เครื่องหมาย Natural (♮) ในภาพทำหน้าที่อะไร?", options: ["ทำให้เสียงสูงขึ้น", "ยกเลิก Sharp/Flat (เล่นโน้ตปกติ)", "เสียงต่ำลง", "เล่นซ้ำ"], correctIndex: 1 }
                ]
            }
        ]
    },
    {
        id: "staff-war",
        title: "ด่านที่ 7: บททดสอบอ่านโน้ต (Staff War)",
        description: "การทดสอบอ่านโน้ตมาราธอนแบบเอาตัวรอด",
        slides: [
            {
                type: "note-identification",
                title: "บททดสอบอ่านโน้ตขั้นสุดยอด!",
                speaker: "boss",
                speakerName: "Note Master",
                text: "ฮ่าๆๆ! เจ้าคิดว่าจะผ่านไปง่ายๆ รึ? นี่คือบททดสอบสุดท้ายของ The Basics เจ้าต้องตอบโน้ตให้ถูก 10 ข้อเพื่อทำลายพลังป้องกันของข้า ถ้าตอบผิด... ข้าจะโจมตีเจ้า! หึหึหึ!"
            }
        ]
    },
    {
        id: "rhythm-1",
        title: "ด่านที่ 8: หอนาฬิกาแห่งกาลเวลา (Rhythm Theory)",
        description: "เรียนรู้เรื่องสัดส่วนของตัวโน้ต, Simple Meter และ Compound Meter",
        slides: [
            {
                type: "info",
                title: "Chapter 2: หอนาฬิกาจักรกลแห่งกาลเวลา",
                speaker: "boss",
                speakerName: "Time Wizard",
                text: "ฮ่าๆๆ! รอดจากด่านทฤษฎีระดับเสียงมาได้ แต่ที่นี่คือหอนาฬิกาจักรกลของข้า! ข้าคือ Time Wizard ผู้ควบคุมเวลา จังหวะ และตัวหยุดทั้งหมดในโลกดนตรี!",
                abc: "X:1\nK:C\nL:1/4\nC C C C |]"
            },
            {
                type: "info",
                title: "กฎแห่งห้องเพลง",
                speaker: "boss",
                speakerName: "Time Wizard",
                text: "กฎของหอนาฬิกานี้ถูกควบคุมด้วย <b>Time Signature (เครื่องหมายกำหนดจังหวะ)</b>! เจ้าจงเรียนรู้เรื่อง Simple และ Compound Meter เสีย!",
                abc: ""
            },
            {
                type: "info",
                title: "การจำแนก Time Signature",
                speaker: "hero",
                speakerName: "Hero",
                text: "Time Signature ทุกแบบจะถูกจัดอยู่ใน Meter ชนิดใดชนิดหนึ่ง:\n- คำว่า <b>Duple, Triple, Quadruple</b> บอกถึง <b>จำนวนจังหวะเคาะหลักใน 1 ห้อง</b> (2, 3, 4 เคาะตามลำดับ)\n- ส่วนคำว่า <b>Simple</b> หมายถึง แต่ละเคาะหลัก <b>สามารถแบ่งย่อยออกเป็น 2 ส่วนเท่าๆ กันได้</b>",
                abc: ""
            },
            {
                type: "info",
                title: "Simple Meter (จังหวะธรรมดา)",
                speaker: "hero",
                speakerName: "Hero",
                text: "ตัวอย่างเช่น <b>2/4</b> เรียกว่า <b>Simple Duple</b>:\n- <i>Duple</i> คือมี 2 เคาะใน 1 ห้อง\n- <i>Simple</i> คือแต่ละเคาะสามารถแบ่งย่อยเป็น 2 โน้ตได้\n(โน้ต: 2/2 และ 2/8 ก็ถือเป็น Simple Duple เช่นกัน)",
                abc: "X:1\nM:2/2\nL:1/2\nK:C\nC C | C C ||\nM:2/8\nL:1/8\nK:C\nC C | C C |]"
            },
            {
                type: "info",
                title: "Simple Triple & Quadruple",
                speaker: "hero",
                speakerName: "Hero",
                text: "- <b>3/4</b> จัดเป็น <b>Simple Triple</b> (มี 3 เคาะ, 3/2 หรือ 3/8 ก็เช่นกัน)\n- <b>4/4</b> จัดเป็น <b>Simple Quadruple</b> (มี 4 เคาะ, 4/2 หรือ 4/8 ก็เช่นกัน)\n*ข้อสังเกต:* Time Signature ที่เป็น Simple Meter จะมีตัวเลขด้านบนเป็น <b>2, 3 หรือ 4</b> เสมอ!",
                abc: "X:1\nM:3/4\nL:1/4\nK:C\nC C C | C C C ||\nM:4/4\nL:1/4\nK:C\nC C C C | C C C C |]"
            },
            {
                type: "info",
                title: "Compound Meter (จังหวะผสม)",
                speaker: "boss",
                speakerName: "Time Wizard",
                text: "แต่เดี๋ยวก่อน! ถ้าแต่ละเคาะถูก <b>แบ่งย่อยออกเป็น 3 ส่วน</b> ล่ะ? เราจะเรียกมันว่า <b>Compound Meter</b>!\nเช่น <b>6/8</b> โน้ตเขบ็ต 1 ชั้น 6 ตัว สามารถจัดกลุ่มเป็น 2 เคาะ (เคาะละ 3 ตัว) ทำให้ 6/8 คือ <b>Compound Duple</b>",
                abc: "X:1\nM:6/8\nL:1/8\nK:C\n(CCC) (CCC) | (CCC) (CCC) |]"
            },
            {
                type: "info",
                title: "ลักษณะของ Compound Meter",
                speaker: "boss",
                speakerName: "Time Wizard",
                text: "จำไว้ให้ดี! ใน Compound Meter แต่ละเคาะหลักจะมีค่าเท่ากับ <b>โน้ตประจุด (Dotted Note)</b> เสมอ (เช่น Dotted Quarter Note ใน 6/8)\nจังหวะผสมเหล่านี้มีความซับซ้อนกว่าที่เจ้าคิด!",
                abc: "X:1\nM:6/8\nL:1/8\nK:C\nC3 C3 | (CCC) (CCC) |]"
            },
            {
                type: "info",
                title: "Compound Triple (9/8)",
                speaker: "hero",
                speakerName: "Hero",
                text: "Time Signature ที่มีเลข <b>9</b> อยู่ด้านบน จัดเป็น <b>Compound Triple</b>\nเช่น <b>9/8</b> จะมี 3 เคาะหลัก (แต่ละเคาะประกอบด้วยโน้ตย่อย 3 ตัว)\n(9/2, 9/4, และ 9/16 ก็ถือเป็น Compound Triple เช่นกัน)",
                abc: "X:1\nM:9/8\nL:1/8\nK:C\n(CCC) (CCC) (CCC) | C3 C3 C3 |]"
            },
            {
                type: "info",
                title: "Compound Quadruple (12/8)",
                speaker: "hero",
                speakerName: "Hero",
                text: "Time Signature ที่มีเลข <b>12</b> อยู่ด้านบน จัดเป็น <b>Compound Quadruple</b>\nเช่น <b>12/8</b> จะมี 4 เคาะหลัก (แต่ละเคาะประกอบด้วยโน้ตย่อย 3 ตัว)\n(12/8 และ 12/16 มักจะถูกใช้บ่อยที่สุด)",
                abc: "X:1\nM:12/8\nL:1/8\nK:C\n(CCC) (CCC) (CCC) (CCC) | C3 C3 C3 C3 |]"
            },
            {
                type: "speed-quiz",
                title: "บททดสอบจาก Time Wizard (Combo!)",
                speaker: "boss",
                speakerName: "Time Wizard",
                text: "จงตอบคำถามเหล่านี้ให้ถูกต้องต่อเนื่องกัน! ถ้าพลาดแม้แต่ข้อเดียว ข้าจะหยุดเวลาของเจ้า!",
                questions: [
                    { type: "term", abc: "X:1\nK:C\nM:2/4\nL:1/4\nC C |]", question: "Time Signature ใดต่อไปนี้ จัดเป็น Simple Duple?", options: ["6/8", "2/4", "9/8", "3/4"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nM:4/4\nL:1/4\nC C C C |]", question: "Time Signature ใดต่อไปนี้ จัดเป็น Simple Meter?", options: ["6/8", "9/8", "12/8", "4/4"], correctIndex: 3 },
                    { type: "term", abc: "X:1\nK:C\nM:3/4\nL:1/4\nC C C |]", question: "Time Signature 3/4 มีตัวเลขบนคือ 3... จัดเป็น Meter ชนิดใด?", options: ["Simple Triple", "Compound Triple", "Compound Duple", "Simple Duple"], correctIndex: 0 },
                    { type: "term", abc: "X:1\nK:C\nM:6/8\nL:1/8\n(CCC) (CCC) |]", question: "ในจังหวะ Compound Meter แต่ละเคาะหลัก จะแบ่งย่อยออกเป็นกี่ส่วนเท่าๆ กัน?", options: ["2 ส่วน", "3 ส่วน", "4 ส่วน", "ไม่สามารถแบ่งได้"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nM:9/8\nL:1/8\n(CCC) (CCC) (CCC) |]", question: "Time Signature 9/8 จัดเป็น Meter ชนิดใด?", options: ["Simple Triple", "Compound Duple", "Compound Triple", "Compound Quadruple"], correctIndex: 2 }
                ]
            }
        ]
    },
    {
        id: "rhythm-4",
        title: "ด่านที่ 9: บททดสอบจังหวะคี่ (Odd Meter)",
        description: "ท้าทายจังหวะอัตราผสม (Odd Meter) 5/8",
        slides: [
            {
                type: "info",
                title: "บทนำ Odd Meter",
                speaker: "boss",
                speakerName: "Rhythm Golem",
                text: "หึหึ... ข้าคือ Rhythm Golem! ข้าจะบดขยี้เจ้าด้วย <b>Odd Meter (จังหวะคี่)</b>!<br>Odd Meter คือ Meter ที่ประกอบด้วยทั้ง <b>Simple beat (2 ส่วน)</b> และ <b>Compound beat (3 ส่วน)</b> ผสมกันอยู่ในห้องเดียว!",
                abc: ""
            },
            {
                type: "info",
                title: "จังหวะ 5/8",
                speaker: "hero",
                speakerName: "Hero",
                text: "Odd Meter แรกที่เราจะเจอคือ <b>5/8</b><br>ประกอบด้วย 1 Simple beat (2 โน้ต) และ 1 Compound beat (3 โน้ต)<br><i>ลำดับการวางไม่สำคัญ:</i> จะเอา Compound ขึ้นก่อนเป็น 3+2 หรือ 2+3 ก็ยังถือเป็นจังหวะ 5/8!",
                abc: "X:1\nM:5/8\nL:1/8\nK:C\n(CC) (CCC) | (CCC) (CC) |]"
            },
            {
                type: "info",
                title: "จังหวะ 7/8",
                speaker: "boss",
                speakerName: "Rhythm Golem",
                text: "ต่อไปคือ Meter ที่มี 3 จังหวะเคาะรวมกัน! <b>7/8</b><br>ประกอบด้วย <b>2 Simple beats</b> และ <b>1 Compound beat</b><br>และเช่นเคย ลำดับไม่สำคัญ! Compound beat จะอยู่ตรงกลางระหว่าง 2 Simple beats ก็ได้! (เช่น 2+3+2)",
                abc: "X:1\nM:7/8\nL:1/8\nK:C\n(CC) (CCC) (CC) | (CCC) (CC) (CC) |]"
            },
            {
                type: "info",
                title: "จังหวะ 8/8 vs 4/4",
                speaker: "hero",
                speakerName: "Hero",
                text: "แล้ว 8/8 ล่ะ? บางคนมักสับสนระหว่าง 8/8 กับ 4/4 เพราะมี 8 eighth notes เท่ากัน<br>- <b>4/4</b> แบ่งเป็น 4 เคาะ เคาะละ 2 โน้ต (Simple quadruple)<br>- แต่ <b>8/8</b> จะถูกจัดกลุ่มเป็น 3 เคาะคี่! คือมี <b>2 Compound beats และ 1 Simple beat</b> (เช่น 3+3+2)",
                abc: "X:1\nM:4/4\nL:1/8\nK:C\n(CC) (CC) (CC) (CC) ||\nM:8/8\nL:1/8\nK:C\n(CCC) (CCC) (CC) |]"
            },
            {
                type: "info",
                title: "จังหวะ 10/8 และ 11/8",
                speaker: "boss",
                speakerName: "Rhythm Golem",
                text: "สุดท้าย! สอง Odd Meters ที่มี 4 เคาะเคาะรวมกัน!<br>- <b>10/8</b> ประกอบด้วย 2 Compound beats และ 2 Simple beats<br>- <b>11/8</b> ประกอบด้วย 3 Compound beats และ 1 Simple beat",
                abc: "X:1\nM:10/8\nL:1/8\nK:C\n(CCC) (CCC) (CC) (CC) ||\nM:11/8\nL:1/8\nK:C\n(CCC) (CCC) (CCC) (CC) |]"
            },
            {
                type: "speed-quiz",
                title: "แบบทดสอบจังหวะคี่!",
                speaker: "boss",
                speakerName: "Rhythm Golem",
                text: "ก่อนที่จะมาประลองจังหวะกับข้า ตอบคำถามทฤษฎีพวกนี้มาซะ!",
                questions: [
                    { type: "term", abc: "", question: "Odd Meter (จังหวะคี่) เกิดจากการผสมกันระหว่าง Beat ชนิดใด?", options: ["Duple กับ Triple", "Simple กับ Compound", "Quadruple กับ Simple", "Compound กับ Triple"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nM:5/8\nL:1/8\nK:C\n(CC) (CCC) |]", question: "จังหวะ 5/8 ประกอบด้วย Simple beat และ Compound beat จำนวนเท่าใด?", options: ["2 Simple, 1 Compound", "1 Simple, 2 Compound", "1 Simple, 1 Compound", "2 Simple, 2 Compound"], correctIndex: 2 },
                    { type: "term", abc: "X:1\nM:7/8\nL:1/8\nK:C\n(CC) (CC) (CCC) |]", question: "ในจังหวะ 7/8 หากมี 1 Compound beat แล้ว จะมี Simple beat อีกกี่กลุ่ม?", options: ["1 กลุ่ม", "2 กลุ่ม", "3 กลุ่ม", "4 กลุ่ม"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nM:8/8\nL:1/8\nK:C\n(CCC) (CCC) (CC) |]", question: "จังหวะ 8/8 แตกต่างจาก 4/4 อย่างไร?", options: ["8/8 มีโน้ตเขบ็ต 1 ชั้น 8 ตัว แต่ 4/4 ไม่มี", "4/4 เป็น Compound แต่ 8/8 เป็น Simple", "8/8 จัดกลุ่มเป็น 3 เคาะคี่ แต่ 4/4 จัดเป็น 4 เคาะคู่", "ไม่มีความแตกต่างกัน"], correctIndex: 2 },
                    { type: "term", abc: "X:1\nM:11/8\nL:1/8\nK:C\n(CCC) (CCC) (CCC) (CC) |]", question: "จังหวะ 11/8 ประกอบด้วย Compound beat จำนวนกี่กลุ่ม?", options: ["1 กลุ่ม", "2 กลุ่ม", "3 กลุ่ม", "4 กลุ่ม"], correctIndex: 2 }
                ]
            },
            {
                type: "rhythm-runner",
                title: "Odd Meter 5/8 Challenge",
                speaker: "boss",
                speakerName: "Rhythm Golem",
                text: "จงเคาะจังหวะเน้น (Accent) ของ 5/8 ให้ตรง! (จังหวะที่ 1 และ 4 ของกลุ่ม 3+2)",
                bpm: 180,
                track: [
                    // Bar 1 (3+2 grouping: Accent on 1 and 4)
                    { time: 1.0, type: "hit" },
                    { time: 4.0, type: "hit" },
                    // Bar 2
                    { time: 6.0, type: "hit" },
                    { time: 9.0, type: "hit" },
                    // Bar 3
                    { time: 11.0, type: "hit" },
                    { time: 14.0, type: "hit" },
                    // Bar 4
                    { time: 16.0, type: "hit" },
                    { time: 19.0, type: "hit" },
                    // Bar 5
                    { time: 21.0, type: "hit" },
                    { time: 24.0, type: "hit" },
                    // Bar 6
                    { time: 26.0, type: "hit" },
                    { time: 29.0, type: "hit" }
                ]
            }
        ]
    },
    {
        id: "melody-1",
        title: "ด่านที่ 10: บันไดเสียงเมเจอร์ (The Major Scale)",
        description: "เรียนรู้เรื่องโครงสร้างของ Major Scale",
        slides: [
            {
                type: "info",
                title: "สูตรลับแห่ง The Major Scale",
                speaker: "boss",
                speakerName: "Harmony Golem",
                text: "ข้าคือ Harmony Golem! ผู้พิทักษ์แห่งเสียงประสาน!<br>หากเจ้าอยากจะรอดไปจากที่นี่ เจ้าต้องรู้จักโครงสร้างของ <b>Major Scale (บันไดเสียงเมเจอร์)</b><br>มันถูกสร้างขึ้นด้วยระยะห่างของโน้ตตามสูตรลับ: <b>W - W - h - W - W - W - h</b><br>(W = Whole step เต็มเสียง, h = half step ครึ่งเสียง)",
                abc: ""
            },
            {
                type: "info",
                title: "C Major Scale",
                speaker: "hero",
                speakerName: "Hero",
                text: "ถ้าเราเริ่มสร้างสเกลจากโน้ต C แล้วทำตามสูตร...<br>C (W) D (W) E (h) F (W) G (W) A (W) B (h) C<br>เราจะได้ <b>C Major Scale</b> ที่ไม่มีโน้ตติดชาร์ปหรือแฟลตเลย!<br><br><button onclick=\"event.stopPropagation(); playDemo('c-major', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-blue-500 to-indigo-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 กดเพื่อฟังเสียง C Major Scale</button>",
                abc: "X:1\nK:C\nL:1/1\nC D E F G A B c |]",
                scale: 1.1, staffwidth: 320
            },
            {
                type: "info",
                title: "Eb Major Scale",
                speaker: "boss",
                speakerName: "Harmony Golem",
                text: "แล้วถ้าเราเริ่มจาก <b>Eb</b> ล่ะ? ลองทำตามสูตร W-W-h-W-W-W-h ดูสิ!<br>Eb (W) F (W) G (h) Ab (W) Bb (W) C (W) D (h) Eb<br>เห็นไหม? <b>Eb Major Scale</b> จะมีโน้ตติดแฟลต 3 ตัว คือ Bb, Eb, Ab!<br><br><button onclick=\"event.stopPropagation(); playDemo('eb-major', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-rose-500 to-red-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 กดเพื่อฟังเสียง Eb Major Scale</button>",
                abc: "X:1\nK:C\nL:1/1\n_E F G _A _B c d _e |]",
                scale: 1.1, staffwidth: 320
            },
            {
                type: "info",
                title: "D Major Scale",
                speaker: "hero",
                speakerName: "Hero",
                text: "มาลองสร้างสเกลจาก <b>D</b> ดูบ้าง... ทำตามสูตรเดิม!<br>D (W) E (W) F# (h) G (W) A (W) B (W) C# (h) D<br>ดังนั้น <b>D Major Scale</b> จึงมีโน้ตติดชาร์ป 2 ตัว คือ F# และ C#!<br><br><button onclick=\"event.stopPropagation(); playDemo('d-major', this);\" class=\"neu-btn px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-emerald-500 to-teal-600 text-white mt-2 font-bold shadow-lg active:scale-95 transition-transform\">🔊 กดเพื่อฟังเสียง D Major Scale</button>",
                abc: "X:1\nK:C\nL:1/1\nD E ^F G A B ^c d |]",
                scale: 1.1, staffwidth: 320
            },
            {
                type: "info",
                title: "ความลับแห่งสเกล",
                speaker: "boss",
                speakerName: "Harmony Golem",
                text: "ถูกต้องแล้ว! <b>เจ้าสามารถสร้าง Major Scale ใดๆ ก็ได้ในโลกดนตรี</b> ขอเพียงแค่กำหนดโน้ตตัวแรก แล้วปฏิบัติตามสูตร <b>W-W-h-W-W-W-h</b> นี้อย่างเคร่งครัด!<br>พร้อมจะรับการทดสอบหรือยังล่ะ!?",
                abc: ""
            },
            {
                type: "speed-quiz",
                title: "แบบทดสอบ Major Scale!",
                speaker: "boss",
                speakerName: "Harmony Golem",
                text: "ตอบคำถาม 5 ข้อนี้ให้ถูกรวดเดียว! ข้าไม่ปรานีคนตอบผิดหรอกนะ!",
                questions: [
                    { type: "term", abc: "", question: "สูตรระยะห่างของ Major Scale คือข้อใด?", options: ["W - h - W - W - h - W - W", "W - W - h - W - W - W - h", "h - W - W - W - h - W - W", "W - W - W - h - W - W - h"], correctIndex: 1 },
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nC D E F G A B c |]", question: "Major Scale ใดที่ไม่มีโน้ตติดชาร์ปหรือแฟลตเลย?", options: ["G Major", "F Major", "C Major", "D Major"], correctIndex: 2, scale: 1.1, staffwidth: 320 },
                    { type: "term", abc: "X:1\nK:C\nL:1/1\n_E F G _A _B c d _e |]", question: "Eb Major Scale มีโน้ตติดแฟลตกี่ตัว?", options: ["1 ตัว", "2 ตัว", "3 ตัว", "4 ตัว"], correctIndex: 2, scale: 1.1, staffwidth: 320 },
                    { type: "term", abc: "X:1\nK:C\nL:1/1\nD E ^F G A B ^c d |]", question: "ใน D Major Scale โน้ตตัวใดบ้างที่ติดชาร์ป?", options: ["F# และ G#", "C# และ G#", "F# และ C#", "F# เพียงตัวเดียว"], correctIndex: 2, scale: 1.1, staffwidth: 320 },
                    { type: "term", abc: "", question: "ระยะห่างระหว่างโน้ตตัวที่ 3 และ 4 ใน Major Scale คือระยะใด?", options: ["Whole step (W)", "Half step (h)", "Tone", "Minor 3rd"], correctIndex: 1 }
                ]
            }
        ]
    },
    {
        id: 11,
        title: "ผู้สร้างสเกลหน้าใหม่ (Scale Builder)",
        description: "ทดสอบการสร้าง Major Scale ด้วยตนเองโดยใช้สูตร W-W-h-W-W-W-h",
        icon: "🎸",
        slides: [
            {
                type: "info",
                title: "ถึงเวลาลงมือทำจริง!",
                speaker: "boss",
                speakerName: "Harmony Golem",
                text: "ฮ่าๆๆ! เจ้าท่องสูตร W-W-h-W-W-W-h ได้แม่นยำแล้วสินะ! แต่การสร้างสเกลด้วยตัวเองจริงๆ มันท้าทายกว่านั้นมาก!",
                abc: ""
            },
            {
                type: "info",
                title: "วิธีเล่น",
                speaker: "hero",
                speakerName: "Hero",
                text: "ในด่านนี้ เราจะต้องสร้าง Major Scale จากโน้ตที่ระบบสุ่มให้<br>ให้กดปุ่มใต้ตัวโน้ตแต่ละตัวเพื่อเติมชาร์ป (#) หรือแฟลต (b) ให้สเกลถูกต้องตามสูตร! สามารถกดเปียโนด้านล่างเพื่อฟังและนับระยะห่างได้นะ",
                abc: ""
            },
            {
                type: "scale-builder",
                title: "สร้าง Major Scale! (1/3)",
                speaker: "boss",
                speakerName: "Harmony Golem",
                text: "โจทย์ข้อที่ 1! สร้าง Major Scale ตามที่กำหนดให้ถูกต้องเพื่อโจมตีฉัน!",
                showPiano: true
            },
            {
                type: "scale-builder",
                title: "สร้าง Major Scale! (2/3)",
                speaker: "boss",
                speakerName: "Harmony Golem",
                text: "โจทย์ข้อที่ 2! อย่าลืมล็อกเครื่องหมายตัวแรกและตัวสุดท้ายล่ะ!",
                showPiano: true
            },
            {
                type: "scale-builder",
                title: "สร้าง Major Scale! (3/3)",
                speaker: "boss",
                speakerName: "Harmony Golem",
                text: "ข้อสุดท้ายแล้ว! ทำให้สำเร็จแล้วจงดูข้าพ่ายแพ้ซะ!",
                showPiano: true
            }
        ]
    }
];
