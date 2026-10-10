# Round 1 re-check with the Director (task 0.2.3.11)

Prepared 2026-10-11. Exit gate criterion 5 closes a Severity 1 finding only
after the participant who raised it re-checks the correction. This script is
for P01, the Director, on the Round 1 build. It takes about 20 minutes and can
be run in person or sent as a short form. The agent cannot run it.

**Setup.** Serve the current build (`start-server.bat` or `npm run build` then
`npm start`). Open Home. Role: مدير الاتصال المؤسسي. The prototype's date is
fixed at Monday 21 September 2026 and is shown at the top of every page.

## Part A. The tasks he could not complete (read aloud)

| # | From | Task | Success means | Result |
|---|---|---|---|---|
| A1 | S1 task 3 | افتح صفحة «العمل». ما الغرض منها؟ ومن يعمل على ماذا الآن؟ | States the purpose and names who works on what, from the team view | |
| A2 | S1 task 6 | اعتمد «منشور شكر المتطوعين»، ثم عدّل نصه بنفسك. أين تجده الآن وما حالته؟ | Finds it under خالد in the team view, as «مسودة» needing a new approval | |
| A3 | S2 task 4 | كم عملاً متأخراً الآن؟ اعرض هذه الأعمال فقط. | Reads the count on Home (3) and opens exactly those items | |

## Part B. Does each correction do what he asked? (answer: نعم / جزئياً / لا, and why)

| # | Finding | Show | Question | Answer |
|---|---|---|---|---|
| B1 | F-R01-02 | Home tiles «متأخر» and «قريب الموعد» | هل هذا ما قصدته بقسم للمتأخر؟ | |
| B2 | F-R01-01, F-R01-17 | Work, tab «الفريق»; Home panel «حمل الفريق» | هل يكفي هذا لمتابعة حمل كل موظف ومرحلة كل مهمة؟ | |
| B3 | F-R01-05 | Edit «كتابة محتوى X» and change the main text | هل وضوح التنبيه على صياغة X كافٍ؟ | |
| B4 | F-R01-06 | Approvals, «منشور شكر المتطوعين» | هل الفرق بين الإصدارين واضح الآن؟ | |
| B5 | F-R01-07 | View As مسؤول النشر وإدارة الحسابات; schedule «تصميم الملصق» at 23 September 18:00 | هل يظهر التنبيه في الوقت المناسب؟ | |
| B6 | F-R01-03 | Approvals, «إعداد الفيديو الرئيسي»; add a note at 01:30; request changes | هل تكفي الملاحظة الزمنية المكتوبة حتى يتوفر تشغيل الفيديو؟ | |

## Part C. Questions the design notes leave open

1. إذا تغيّرت صياغة X وحدها، هل يكفي اعتماد صياغة X فقط؟ (component-scoped-approval.md)
2. ما الكلمة التي يستخدمها القسم لإنهاء عمل لن يُستأنف: «إغلاق العمل» أم «إلغاء العمل» أم غيرهما؟ (close-and-archive.md)
3. ما المراحل الفعلية لعمل التصميم؟ ولعمل الفيديو؟ (configurable-stages.md)
4. هل تريد أن نعرض علامة «عاجل» في النموذج الآن؟ (urgent-path.md)
5. هل تريد أن يظهر اسم من حرّر كل إصدار بجانب رقمه؟ (edit-attribution.md)
6. **T6:** هل كلمة «العمل» مناسبة لاسم هذه الصفحة، أم يستخدم القسم كلمة أخرى؟ (task 0.2.3.4)
7. **D-01:** انقر نقراً مزدوجاً على الشعار أعلى القائمة لرؤية التصميم الجديد. أيهما تفضل أن يكون الافتراضي؟

## Recording

Copy the answers into an addendum at the end of
`validation/responses/R01-2026-10-10-director.md`, then add a dated entry to
`progress.md` that closes or reopens each finding. A "لا" on Part B reopens the
finding for Round 2.
