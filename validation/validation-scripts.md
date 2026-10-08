---
type: validation
project: "[[projects/ideas/Comms_Hub/Comms Hub|Communication Department Hub]]"
tags:
  - comms-hub
  - document/validation
  - checkpoint/0.2
created: 2026-09-19
updated: 2026-09-19
status: active
phase: 0.2.1 Workflow Mapping
parent: "[[Roadmap|Product Roadmap]]"
aliases:
  - Guided Validation Scripts
  - نصوص جلسات التحقق
related:
  - "[[workflow-map|Department Workflow Map]]"
  - "[[feedback-rubric|Validation Feedback Rubric]]"
  - "[[Roadmap|Product Roadmap]]"
---

[[Roadmap|Product Roadmap]] | [[workflow-map|Workflow Map]] | [[feedback-rubric|Feedback Rubric]] | [[MVP_draft|MVP Draft UI Shell]]

---

# Checkpoint 0.2, Phase 0.2.2 — Guided Validation Scripts

Written for the facilitator running the sessions. The facilitator does not need
to be technical. Participant-facing wording is given in Arabic and should be
read aloud as written; the surrounding instructions are for the facilitator only.

## How to run a session

**Length.** 45 minutes. 5 setup, 30 tasks, 10 questions.

**Before the participant arrives.**

1. Start the prototype: `npm run build` then `npm start`, and open
   `http://127.0.0.1:3000`.
2. Open the Account page and choose **إعادة النموذج إلى حالته الأولى** so every
   session starts from identical seed data.
3. Set **عرض بصفة** to the participant's role. Confirm the sidebar shows their
   name before handing over.
4. Open a blank capture sheet from `feedback-rubric.md`.

**The four rules.**

1. **Do not name controls.** Say "اعتمد هذا الإصدار", never "اضغط زر الاعتماد
   الأخضر". If the participant cannot find it, that is the finding.
2. **Count interventions.** Mark the task failed on the third time you have to
   help. Record where.
3. **Ask why, not whether.** "لماذا؟" after every hesitation. Never "هل هذا
   واضح؟", which invites politeness.
4. **Let silence run.** Wait a full five seconds before filling a pause.

**Say this at the start, out loud:**

> هذا نموذج أولي للواجهة فقط. لا يوجد نشر حقيقي، ولا حفظ للبيانات. نحن نختبر
> النموذج، ولسنا نختبرك. إذا لم تجد شيئاً فهذه معلومة مهمة لنا، وليست خطأً منك.
> من فضلك فكّر بصوت عالٍ، وقل لي ما تتوقع أن يحدث قبل أن تضغط.

**Record for every session:** date, participant role, years in the department,
facilitator name, device and browser, and whether it was desktop or phone.

**Do not do these.** Do not demonstrate the flow first. Do not defend the
design. Do not promise a change. Do not skip the open questions at the end even
if the clock has run out; the tasks can be cut instead.

---

## S1 — Director (مدير الاتصال المؤسسي)

*Covers W1 and W5. Validates A1, A2, A6, A7, A9, A13, A23 and questions Q1, Q2, Q3, Q4.*

**Setup.** Role: مدير الاتصال المؤسسي. Start on the home page.

| # | Task, read aloud | Unaided success means |
|---|---|---|
| 1 | انظر إلى هذه الشاشة دون أن تضغط شيئاً. ما الذي يخبرك به هذا اليوم؟ وما أول شيء ستفعله؟ | Participant names something they would actually act on, without prompting |
| 2 | هناك عمل يحتاج قرارك. افتحه واطّلع عليه. | Reaches the submitted release, from home or approvals, in under 60 seconds |
| 3 | قبل أن تقرر: ما الذي تعتمده بالضبط في هذه اللحظة؟ | Participant says the copy, the media version and the channels, unprompted |
| 4 | اطلب تعديلاً على هذا العمل، واذكر السبب. | Completes with a written reason |
| 5 | افترض أن الكاتب عدّل النص وأعاد الإرسال. اعتمده الآن. | Approves, and notices the revision number changed |
| 6 | عمل آخر اعتُمد سابقاً ثم عُدّل. ما حالته الآن في رأيك؟ | Expects the approval to be void. If they expect it to stand, record Severity 1 |
| 7 | أنشئ حملة جديدة، ثم عملاً ضمنها وأسنده لشخص. | Reaches the campaign step; note whether assigning to a role rather than a person confuses them (A25) |

**Questions.**

- مَن في القسم يملك اعتماد هذا النوع من المحتوى فعلياً؟ هل يختلف باختلاف نوع المحتوى أو حساسيته؟ **(Q1)**
- إذا تغيّر التصميم فقط ولم يتغير النص، هل يحتاج اعتماداً جديداً كاملاً؟ **(Q1, E6)**
- هل يحدث أن تعدّل النص بنفسك بدل أن تطلب التعديل من الكاتب؟ ماذا يعني ذلك لمن يظهر كصاحب العمل؟ **(Q1, E9)**
- إذا كنت مسافراً أو في إجازة وهناك منشور مرتبط بموعد، كيف يُعتمد اليوم؟ **(Q3)**
- إذا نُشر شيء ثم تبيّن أنه خطأ، ماذا يحدث؟ مَن يقرر؟ **(Q2)**
- هل هناك حالات طارئة تُنشر خلال ساعة؟ ما الذي يحكمها؟ **(Q4)**

---

## S2 — Assistant Director (مساعد مدير الاتصال المؤسسي)

*Covers W1, W5, W8. Validates A2, A3, A9, A21, A25 and questions Q1, Q6, Q7.*

**Setup.** Role: مساعد مدير الاتصال المؤسسي. Start on the home page.

| # | Task, read aloud | Unaided success means |
|---|---|---|
| 1 | ما الذي تتابعه في هذه الشاشة كل صباح؟ وما الذي ينقصها؟ | Names concrete omissions; capture them verbatim |
| 2 | أرني كيف توزّع العمل على الفريق هذا الأسبوع. | Finds the workload view; note whether role-level assignment is sufficient |
| 3 | هناك طلب وارد في البريد. حوّله إلى عمل وأسنده. | Completes intake conversion; note whether they expect to choose a campaign |
| 4 | كم عملاً متأخر عن موعده الآن؟ | Note the difficulty; B4 predicts this is hard to answer |
| 5 | راجع عملاً أرسله أحد المختصين وقرر فيه. | Completes a review decision |
| 6 | عمل رُفض ولن يُستأنف. ماذا تفعل به؟ | Expect no path to exist. Record what they expected (E11, Q6) |

**Questions.**

- من أين يأتي عمل القسم فعلياً؟ ما نسبة ما يأتي خارج أي حملة؟ **(Q7)**
- هل يحدث أن يخدم محتوى واحد حملتين؟ **(Q7, E8)**
- هل تُسند المهمة إلى دور أم إلى شخص بعينه؟ إذا كان لديكم مصممان، كيف تفرّقون؟ **(A25)**
- هل تحتاجون مواعيد لكل مرحلة، أم موعد نهائي واحد يكفي؟ **(A21, B4)**
- ما الذي يعطّل العمل عندكم أكثر من غيره اليوم؟ **(B1 to B7)**

---

## S3 — Content Writer (كاتب المحتوى)

*Covers W2. Validates A4, A5, A10, A15, B3, B5 and terminology T3, T6, T7.*

**Setup.** Role: كاتب المحتوى. Start on the home page.

| # | Task, read aloud | Unaided success means |
|---|---|---|
| 1 | ما المطلوب منك اليوم بحسب هذه الشاشة؟ | Identifies their own tasks and the revision request without help |
| 2 | هناك عمل طُلب فيه تعديل. اقرأ الملاحظة ونفّذ التعديل. | Finds the reviewer's note, then edits |
| 3 | اكتب صياغة مختلفة لقناة X عن النص الأساسي. | Finds the channel tabs |
| 4 | أعد إرساله للمراجعة. | Submits, and notices the revision number advanced |
| 5 | أرني الفرق بين ما أرسلته الآن وما أرسلته سابقاً. | B3 predicts this is not possible. Record their reaction |
| 6 | افترض أنك غيّرت النص الأساسي بعد كتابة صياغات القنوات. ماذا تتوقع أن يحدث لتلك الصياغات؟ | Record the expectation; B5 predicts a mismatch |

**Questions.**

- كم مرة يتكرر التعديل عادة قبل الاعتماد؟ **(B3)**
- عندما يُطلب تعديل، هل تصلك الملاحظة كما تتوقع، وفي الوقت المناسب؟ **(A18)**
- هذه الحالة اسمها «بحاجة إلى تعديل». هل هذا ما تسمونه؟ **(T3)**
- نسمي هذه العناصر «العمل» و«الإصدار». ما الكلمات التي تستخدمونها أنتم؟ **(T6, T7)**
- هل النموذج الواحد للكتابة يناسب البيان الصحفي والمنشور الاجتماعي معاً؟ **(A4, B2)**

---

## S4 — Designer (المصمم)

*Covers W3. Validates A4, A16, A17, B2, B7.*

**Setup.** Role: المصمم. Start on the home page.

| # | Task, read aloud | Unaided success means |
|---|---|---|
| 1 | ما الذي يخصّك في هذه الشاشة؟ | Identifies design tasks and assets awaiting approval |
| 2 | افتح مكتبة الوسائط وأرني إصدارات الملصق وأيّها معتمد. | Reaches asset versions and reads the approved marker |
| 3 | اربط إصداراً محدداً من الملصق بعمل، ثم أرسله للمراجعة. | Binds an exact version |
| 4 | أرني أين ترفع تصميماً جديداً. | Upload is deferred (A17). Record exactly what they expected and how blocking it is |
| 5 | قائمة مراحل الإنتاج هنا ثابتة. هل تناسب عملك؟ | Record the steps they would actually use (B7) |

**Questions.**

- أين تحفظون ملفات التصميم اليوم، وما المسار من التصميم إلى النشر؟ **(A17)**
- هل يكفي أن نعرض صورة تمثيلية للإصدار، أم لا معنى للمراجعة دون الملف الحقيقي؟ **(A17)**
- إذا تغيّر التصميم فقط ولم يتغير النص، ما الذي يجب أن يحدث للاعتماد؟ **(E6, Q1)**
- هل يفرّق القسم بين «الإصدار» للعمل و«الإصدار» للتصميم؟ **(T7)**

---

## S5 — Media Producer (المنتج الإعلامي)

*Covers W4. Validates A4, A17, B2, B7.*

**Setup.** Role: المنتج الإعلامي. Start on the home page.

| # | Task, read aloud | Unaided success means |
|---|---|---|
| 1 | ما حالة أعمالك الآن بحسب هذه الشاشة؟ | Distinguishes in-production from under-review work |
| 2 | لديك عمل قيد الإنتاج. أرني ما ستفعله به اليوم. | Uses the item; note what they look for and cannot find |
| 3 | أرسل الفيديو للمراجعة وأرني ما سيراه المراجع. | Understands that the exact cut is bound to the release |
| 4 | افترض أن المراجع طلب تعديلاً على الدقيقة الثانية تحديداً. أين تتوقع أن تجد ذلك؟ | Time-coded feedback does not exist. Record how much it matters |
| 5 | أرني أين ترفع نسخة المونتاج. | Deferred (A17). Record the expected file sizes and where files live today |

**Questions.**

- ما حجم الملفات التي تتعاملون معها، وأين تُخزَّن اليوم؟ **(A17)**
- هل تكفي المراجعة على نسخة مصغّرة، أم تحتاج النسخة الكاملة؟ **(A17)**
- كم يستغرق الإنتاج عادة من الإسناد إلى التسليم؟ **(A21, B4)**
- هل نموذج الإدخال الحالي يصلح لعمل فيديو، أم أنه مصمم للمنشورات؟ **(A4, B2)**

---

## S6 — Publishing Officer (مسؤول النشر وإدارة الحسابات)

*Covers W6. Validates A12, A13, A14, B6 and questions Q5. Run at least once on a phone.*

**Setup.** Role: مسؤول النشر وإدارة الحسابات. Start on the home page.

| # | Task, read aloud | Unaided success means |
|---|---|---|
| 1 | ما الذي تنشره اليوم؟ وما الذي يمنعك من النشر الآن؟ | Reads both the ready count and the account health panel unprompted |
| 2 | جدول إصداراً معتمداً للنشر في 23 سبتمبر الساعة 18:00 بتوقيت الرياض. | Schedules successfully |
| 3 | أكّد أنه ظهر في التقويم في اليوم الصحيح. | Finds it on 23 September |
| 4 | نفّذ النشر، واختر محاكاة فشل آخر قناة. | Completes and reads the per-channel result |
| 5 | أعد المحاولة. ما الذي تتوقع أن يحدث للقناة التي نجحت؟ | Expects no republication. If they expect everything to resend, record Severity 1 |
| 6 | إحدى القنوات تحتاج إعادة ربط. ما الذي تفعله؟ ومتى كان يجب أن تعرف؟ | Record whether discovering it here is early enough (B6) |
| 7 | هل يمكنك اعتماد محتوى بنفسك؟ | Must be no. If they expect yes, record as a governance finding |

**Questions.**

- مَن يملك حسابات القنوات اليوم، ومَن ينتبه عند انتهاء صلاحية الربط؟ **(Q5)**
- هل يحدث أن تنشر مباشرة من المنصة خارج النظام؟ في أي حالات؟ **(Q5, E10)**
- ماذا تفعل اليوم عندما يفشل النشر جزئياً؟ **(A14)**
- هل تنشر من الجوال خارج الدوام؟ **(0.2.2.5)**
- هل «نشر جزئي» هي العبارة التي تستخدمونها؟ **(T5)**

---

## S7 — Department Member (عضو), with Admin addendum

*Covers W7 and W9. Validates A3, A18, A23 and terminology T1.*

**Setup.** Role: عضو. Start on the home page.

| # | Task, read aloud | Unaided success means |
|---|---|---|
| 1 | ما الذي يخصّك هنا؟ | Sees only their own work, and says so |
| 2 | أرسل مساهمتك للمراجعة. | Submits |
| 3 | أرني ما قاله الفريق على عملك. | Finds comments |
| 4 | حاول اعتماد عمل أو نشره. | Must not be possible. Record whether the boundary is clear or merely invisible |
| 5 | ما الذي كنت تتوقع أن تجده ولم تجده؟ | Capture verbatim |

**Questions.**

- نسمي هذا الدور «عضو». ما الكلمة المستخدمة في القسم؟ **(T1)**
- هل تشارك في الحملات بانتظام أم عند الحاجة فقط؟
- هل تصلك إشعارات لا تخصّك؟ **(A18)**

**Admin addendum.** Run only with whoever actually administers systems for the
department. If no such person exists, record that as a finding under 0.2.2.4.

| # | Task, read aloud | Unaided success means |
|---|---|---|
| A1 | افتح صفحة الإدارة وأرني حالة النظام والمستخدمين والتكاملات. | Navigates the admin sections |
| A2 | أرني أين تضيف مستخدماً جديداً وتغيّر دوره. | Shell only. Record what they expected to be able to do |
| A3 | أحد التكاملات يحتاج إعادة ربط. مَن مسؤوليته؟ | Record the real ownership boundary (Q5) |
| A4 | هل يستطيع مسؤول النظام اعتماد محتوى؟ | Must be no. Confirm the separation reads as deliberate |

---

## Session coverage checklist

Tick each line only when a completed rubric sheet exists. The Checkpoint 0.2
exit gate in `Roadmap.md` depends on this table.

| Role group | Script | Minimum participants | Required for exit gate |
|---|---|---|---|
| Director | S1 | 1 | Yes |
| Assistant Director | S2 | 1 | Yes |
| Content specialist (Writer or Designer) | S3 or S4 | 1 | Yes |
| Media Producer | S5 | 1 | Yes |
| Publishing Officer | S6 | 1 | Yes |
| Department Member | S7 | 1 | No, recorded if available |
| Admin | S7 addendum | 1 | No, recorded if available |
| Mobile run | any, on a real phone | 2, one of them leadership | Yes |

Minimum six distinct participants overall, at least two of them leadership.
