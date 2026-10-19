# Comms Hub help content matrix

Date: 2026-10-15; reviewed and implemented 2026-10-19. Status: implemented for first visits and the page guide (see "Implementation record" at the end). Scope: all 23 registered pages and all eight roles, 184 explicit combinations.

This file is the source of the Arabic wording for level 1: the first page visit and the first use of a section. The cards, the role introductions and the card order are read by `tests/help-roles.test.mjs`, which holds `src/lib/help/roles.ts` equal to this file. It does not change permissions or the specification. Titles and body text in the card tables are proposed user-facing strings. Role introductions in the matrices are also proposed user-facing strings. Access notes, IDs, targets, priorities, and acceptance criteria are authoring notes only.

## Page index

Every linked page includes all eight exact roles. Shared shell and entry guidance follows the 23 page matrices.

| Page | Page | Page |
|---|---|---|
| [01. الرئيسية](#01-الرئيسية) | [09. صفحة المشروع](#09-صفحة-المشروع) | [17. البريد](#17-البريد) |
| [02. العمل](#02-العمل) | [10. الطلبات](#10-الطلبات) | [18. المراسلة](#18-المراسلة) |
| [03. صفحة العمل](#03-صفحة-العمل) | [11. مكتبة الوسائط](#11-مكتبة-الوسائط) | [19. حسابات المنصات](#19-حسابات-المنصات) |
| [04. إنشاء](#04-إنشاء) | [12. صفحة الملف](#12-صفحة-الملف) | [20. الأفكار](#20-الأفكار) |
| [05. الموافقات والنشر](#05-الموافقات-والنشر) | [13. المهام](#13-المهام) | [21. الحسابات](#21-الحسابات) |
| [06. شاشة المراجعة](#06-شاشة-المراجعة) | [14. سجل النشاط](#14-سجل-النشاط) | [22. الحساب](#22-الحساب) |
| [07. التقويم](#07-التقويم) | [15. التحليلات](#15-التحليلات) | [23. الإعدادات](#23-الإعدادات) |
| [08. المشاريع](#08-المشاريع) | [16. استوديو الحركة](#16-استوديو-الحركة) | |

## How to read and apply the matrix

Each page has eight role rows. Read the Arabic introduction in the selected row, then its cards in the listed order. Card IDs resolve to the title and body immediately below that matrix. Identical wording is shared by reference; each role still has an explicit selection. Success means the outcome to validate, not behavior already observed in a user test.

The introduction belongs inside the first card, rather than becoming an additional screen. Show three or four cards per first visit. Section tips appear later, when the relevant section opens. A tour explains actions; advancing the tour never saves, sends, grants, approves, publishes, or deletes anything.

Access notation:

| Code | Meaning |
|---|---|
| A | Available with the account's normal page access. A withdrawn page grant can still prevent entry. |
| O | Observation path on an accessible record. It does not grant editing or decision rights. |
| C | Conditional on an actual grant, assignment, membership, or record state. The condition is stated in the row or page gate. |
| R | Unavailable for this role. Do not run the page's action tour. Use the restricted-state cards only if the person reaches a denied screen. |
| T | Admin testing path. State the testing exception, retain the person's identity and privacy boundaries, and check the actual action permission. |

The codes describe defaults in the current source, not the live permissions of a named account. Check effective permissions at display time. A role alone does not establish folder access, room membership, stage ownership, or permission to act on a particular record.

### Selection rules for every page

1. Check page access, then record visibility, then the action's actual permission and current state. Never use a help rule to authorize an action.
2. Use the person's exact role name. Director, assistant, and Admin have separate instructions. Writer, designer, and producer have separate introductions and task choices.
3. When the person is only observing, select the observation cards. Do not describe editing as an available next action.
4. A page grant does not grant every action inside it. Fixed approval and publishing rules cannot be bypassed by a grant. No person approves their own submission or uploaded version.
5. Show steps behind a tab or dialog when that section opens. Do not treat a currently hidden target as completed learning. Opening a dialog for guidance must preserve unsaved work and must not execute its action.
6. Separate loading, an empty list, an active filter, denied access, and an error. Never mark a guide complete because the page failed to load.
7. When a role, grant, or responsibility changes, offer only the newly relevant guidance. Skipping a tour records that it was dismissed, not that the task was learned. Keep replay available.
8. On touch screens use touch wording. Prefer the proposed neutral verbs such as «افتح» and «اختر». Describe long press only for controls that actually require it, with keyboard instructions available through help mode.
9. Retain the current object and tab when linking to its next task, where permitted. Do not link a person to an inaccessible management page as their only recovery path.
10. Approval stays with مدير الاتصال المؤسسي and مساعد مدير الاتصال المؤسسي. Publishing stays with مسؤول النشر وإدارة الحسابات. Admin's existing testing exception is explained explicitly. Publishing remains a simulation, even for a genuinely connected platform account.

### Shared restricted and state cards

Restricted cards are a conditional explanation, not an automatic three-card tour on every denied screen. B02 and B03 must name the actual permitted destination or recovery action when rendered.

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| B01 | Denied page heading | هذه الصفحة غير متاحة لحسابك | الوصول إلى الصفحة يختلف عن صلاحية تنفيذ إجراءاتها. يوضح السبب هنا ما يمنعك الآن. |
| B02 | Available recovery action | اختر الخطوة المتاحة لك | إن أمكن طلب هذه الصلاحية فافتح طلبها، واكتب ما تحتاجه وسببه. بعض الإجراءات مقفلة بقواعد المركز ولا تُطلب. |
| B03 | Account or Home link | تابع من المكان المتاح لك | راجع «صلاحياتي» في صفحة «الحساب»، أو عد إلى «الرئيسية» لتتابع ما يخصك. |
| G01 | Loading state | جارٍ تحميل الصفحة | انتظر اكتمال التحميل لتظهر بياناتك والإجراءات المتاحة لك. |
| G02 | Failed load | تعذّر تحميل البيانات | أعد المحاولة. إن استمر التعذّر فأرسل ملاحظة من الشريط العلوي، مع وصف ما كنت تحاول فعله. |
| G03 | Active filter | لا نتائج بهذه التصفية | غيّر البحث أو أزل التصفية لترى بقية ما يحق لك الوصول إليه. |
| G04 | No record visibility | هذا المحتوى غير متاح لك | قد يكون المحتوى مقيّداً أو تغيّر وصولك إليه. راجع السبب الظاهر، واطلب الوصول إن كان الطلب متاحاً. |
| G05 | Help control | المساعدة وقت الحاجة | افتح زر المساعدة لشرح العناصر، ثم «دليل الصفحة» للخطوات والقواعد. يمكنك إعادة إرشاد هذه الصفحة متى احتجته. |
| G06 | A permitted locked action | تحتاج إلى صلاحية | هذا الإجراء غير متاح لك الآن. افتح السبب، ثم اطلب الصلاحية إن كانت قابلة للطلب. |

Do not append G05 to every tour. Introduce the help control once in the shared shell, then keep it available on demand. G01 to G04 replace inappropriate tour content; they do not count as completed first-use steps.

## 01. الرئيسية

Page key: `home`. Route: `/`. Priority: P1. Sources: `src/components/home.tsx`, `src/components/home-perms.tsx`.

Gap: the current tour names counts and panels, but gives little instruction about selecting and completing the next role-specific task. Gate: signed-in accounts; all counts remain subject to record visibility.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A | ابدأ بما ينتظر قرارك، ثم راجع المتأخر وطلبات العمل التي لم تُسند. | H01, H05, H06 | Opens a decision or unassigned request. |
| مساعد مدير الاتصال المؤسسي | A | تابع التسليمات والمراحل المتأخرة، وافتح ما ينتظر مراجعتك لتنسّق الخطوة التالية. | H01, H05, H06 | Opens a late stage or review. |
| كاتب المحتوى | A | هنا أعمالك ومراحلك الجاهزة ومهام الكتابة التي تنتظرك. | H02, H05, H06 | Finds the next writing stage. |
| المصمم | A | ابدأ بمرحلتك الجاهزة، ثم افتح العمل لتراجع المطلوب قبل تجهيز التصميم. | H02, H05, H06 | Opens the relevant design work. |
| المنتج الإعلامي | A | تابع مراحل الإنتاج ومهامك ومواعيد التسليم القريبة. | H02, H05, H06 | Finds the next production action. |
| مسؤول النشر وإدارة الحسابات | A | ابدأ بالجاهز للنشر وما ينتظر تأكيدك، ثم راجع ما تعذّر نشره في المحاكاة. | H03, H05, H06 | Opens the correct publishing queue. |
| عضو | A | تابع طلباتك وما أُسند إليك، وابدأ طلباً جديداً حين تحتاج عملاً من القسم. | H04, H05, H06 | Finds an existing request or starts one. |
| Admin | T | تعرض الرئيسية متابعة العمل في وضع الاختبار. إدارة الحسابات وصحة النظام من صفحتيهما. | H01, H05, H07 | Distinguishes operational counts from administration. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| H01 | Role tiles | ما يحتاج قرارك أو متابعتك | افتح عدداً لتصل إلى الأعمال التي يحسبها. ابدأ بالمراجعة أو المتأخر أو الطلبات التي بلا مسؤول. |
| H02 | Personal tiles | ابدأ بمراحلك الجاهزة | افتح «مراحلي الجاهزة» أو أحد أعمالك. صفحة العمل توضح ما عليك وما تنتظره قبل البدء. |
| H03 | Publishing tiles | ما ينتظرك في النشر | «جاهز للنشر» يحتاج جدولة، و«بانتظار تأكيدك» يحتاج قرارك عند الموعد. النشر على المنصات ما زال محاكاة. |
| H04 | Member tiles and request action | طلباتك ومهامك | افتح طلباً لتتابع حالته، أو مهمة لتنجزها. «طلب جديد» يرسل احتياجك إلى القادة للإسناد. |
| H05 | Focus list | افتح العمل لتتصرف | كل سطر يفتح مكان الإجراء. قراءة الرئيسية أو الإشعار لا تُنجز المهمة ولا تعتمد العمل. |
| H06 | Upcoming days | راجع المواعيد القادمة | هنا أقرب مواعيد ما يظهر لك. افتح الموعد أو التقويم لتعرف صاحبه ونوعه قبل طلب تغييره. |
| H07 | Shell and role selector | اختبر الدور المناسب | «عرض بصفة» يغيّر أدوات العرض للاختبار. لا يفتح بريد الآخرين الداخلي ولا محادثات لست عضواً فيها. |

First-section tip: permission strip. Title: «صلاحية لها وقت». Body: «المؤقتة تنتهي في موعدها، ولمرة واحدة تنتهي بعد استخدامها. افتح «الحساب» لترى مصدر صلاحيتك وما بقي منها.»

Empty: «لا شيء ينتظرك الآن. ما يحتاج إجراءك يظهر هنا حين يصل.» If no work exists, use a permitted creation/request action for creators and members; for the publisher say «تظهر الأعمال هنا حين يعتمدها القادة وتصل إلى النشر.» Admin gets administration links rather than a creation instruction.

Deeper help: distinguish work lateness from stage lateness, explain the source and scope of each count.

## 02. العمل

Page key: `work`. Route: `/work`. Priority: P1. Sources: `src/components/work/list.tsx`, `src/lib/work/rules.ts`.

Gap: a shared tour describes tabs that differ by role. Gate: page access; restricted work follows involvement and leadership rules. The board reports status and does not change it by dragging.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A | راجع حمل الفريق، وأسند الطلبات، وافتح الأعمال التي تحتاج قراراً أو معالجة تأخير. | W01, W05, W06 | Finds an unassigned or overdue work. |
| مساعد مدير الاتصال المؤسسي | A | استخدم حمل الفريق والمراحل الحالية لتنسّق التسليم وتعرف من ينتظر من. | W01, W05, W06 | Identifies a blocked handoff. |
| كاتب المحتوى | A | «مهامي» تجمع الأعمال التي تشارك فيها ومراحل الكتابة المسندة إليك. | W02, W05, W06 | Opens a writing assignment. |
| المصمم | A | ابحث عن أعمالك ومراحل التصميم، ثم افتح العمل لتراجع ملفاته وملاحظاته. | W02, W05, W06 | Opens a design assignment. |
| المنتج الإعلامي | A | تابع مراحل الإنتاج ومواعيدها، وافتح العمل لترى المتطلبات والتسليم التالي. | W02, W05, W06 | Finds the current production stage. |
| مسؤول النشر وإدارة الحسابات | A | تابع ما سيصل إلى النشر. الجدولة والتأكيد وإعادة المحاولة في «الموافقات والنشر». | W03, W05, W06 | Reaches the publishing workflow. |
| عضو | A | من «طلباتي» تعرف ما طلبته من القسم ومن يتولاه وأين وصل. | W04, W05, W06 | Opens a request and reads its status. |
| Admin | T | تراجع قائمة العمل بأدوات القيادة في الاختبار، ويمكنك عرضها بصفة دور آخر. | W01, W05, W06 | Tests visibility without confusing it with ownership. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| W01 | Team and request tabs | الفريق والطلبات | «الفريق» يوضح حمل الأشخاص، و«الطلبات» تعرض ما وصل بلا مسؤول. افتح العمل للإسناد أو المتابعة. |
| W02 | Personal tab | أعمالك ومراحلك | «مهامي» تشمل ما أنت مسؤول عنه وما لك فيه مرحلة. مسؤول العمل وصاحب المرحلة قد يكونان شخصين مختلفين. |
| W03 | List and publishing navigation | تابع وصول العمل للنشر | افتح العمل لمعرفة حالته. حين يصبح «جاهز للنشر» تابعه من تبويب «النشر» في «الموافقات والنشر». |
| W04 | Member tab | تابع طلبك | افتح «طلباتي» ثم الطلب المطلوب. يظهر المسؤول بعد إسناده، وتتابع التفاصيل من صفحة العمل. |
| W05 | Search and attention filters | اعثر على المطلوب | ابحث بالعنوان أو الرقم، أو افتح عدداً لتصفية القائمة. «إظهار الكل» يعيد ما أخفته التصفية. |
| W06 | Work row or board card | الحالة تتغير بإجراء | افتح الصف أو البطاقة لتنفذ الخطوة المناسبة. حالة العمل تتغير بإجراء مسجّل، ولا تتغير بسحب البطاقة هنا. |

First-section tip: closed tab. Title: «العمل المغلق باقٍ». Body: «الإغلاق يخرج العمل من القوائم النشطة ويبقيه مع سببه وسجله. افتحه من «المغلقة» للاطلاع.»

Empty: «لا توجد أعمال ظاهرة هنا. راجع التبويب والتصفية. إن كانت القائمة خالية، ابدأ عملاً أو طلباً إن كان ذلك متاحاً لدورك.» For the publisher, replace the creation sentence with «تظهر الأعمال حين ينشئها الفريق وتسمح لك رؤيتها.»

Deeper help: restricted visibility, priority, work versus stage lateness, closure and reopening.

## 03. صفحة العمل

Page key: `item`. Route: `/work/{id}`. Priority: P1. Sources: `src/components/work/item.tsx`, `plan.tsx`, `publish.tsx`, `src/lib/work/rules.ts`.

Gap: the tour stops at heading, stages, and actions. It does not teach different contributions or their handoffs. Gate: record visibility, stage responsibility, work ownership, state, and action permission. A specialist receives a contribution path only when allowed to edit that contribution; otherwise use I08, I01, I07.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | راجع المسؤول والمواعيد والمراحل، ثم افتح الإجراء الذي يحتاج قرارك. | I08, I01, I06, I07 | Finds the next leadership action. |
| مساعد مدير الاتصال المؤسسي | A/C | تابع ما ينتظره العمل، ونسّق أصحاب المراحل، وراجع ما أُرسل إليك. | I08, I01, I06, I07 | Resolves or identifies a stage blocker. |
| كاتب المحتوى | C | أنجز مرحلتك واكتب النص ونسخ المنصات، ثم سلّم ما اكتمل وفق دورك في العمل. | I01, I02, I06, I07 | Saves the intended text and understands handoff. |
| المصمم | C | راجع المطلوب، واربط ملف التصميم أو إصداره المناسب، ثم أنهِ مرحلتك عند اكتمالها. | I01, I03, I06, I07 | Links the correct file version. |
| المنتج الإعلامي | C | تابع مراحل التصوير والإنتاج وما تنتظره، واربط مخرجاتك وملاحظاتها بالعمل. | I01, I03, I06, I07 | Delivers production output and hands over the stage. |
| مسؤول النشر وإدارة الحسابات | C | تحقق من الأجزاء المعتمدة والحسابات والموعد، ثم نفّذ إجراء النشر المتاح. | I08, I04, I06, I07 | Finds an eligible scheduling or confirmation action. |
| عضو | O | هنا تفاصيل طلبك والمسؤول عنه وتقدمه. أضف المعلومات التي يحتاجها الفريق في النقاش. | I08, I05, I07 | Follows progress and adds context without assuming control. |
| Admin | T | اختبر إجراءات العمل بحسب الحالة. الاعتماد والنشر منفصلان، والمنع من اعتماد ما أرسلته أو رفعته يبقى سارياً. | I08, I01, I06, I07 | Tests the correct state-dependent action. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| I01 | Stages | ابدأ مرحلتك حين تجهز | افتح مرحلتك لتعرف ما تنتظره. «تمّت» تنهيها وتبلّغ من بعدها، ونقطة الاعتماد تنتظر قرار أحد القادة. |
| I02 | Text and platform copies | النص ونسخ المنصات | احفظ النص وراجع نسخة كل منصة. تغيير النص الأساسي قد يجعل النسخ تحتاج مراجعة، وتعديل المعتمد يعيده للاعتماد. |
| I03 | Media | أضف الملف المناسب | اختر الملف من المكتبة أو ارفع إصداراً جديداً من صفحته. ربطه بالعمل لا يغيّر صلاحيات مجلده. |
| I04 | Publishing panel | راجع الحساب والموعد | الجدولة والنشر لما اعتُمد وبالتفويض المناسب. تعديل الموعد أو المحتوى قد يعيد الاعتماد. النشر هنا محاكاة. |
| I05 | Discussion | أضف ما يوضح طلبك | اكتب المعلومات أو الملاحظة في النقاش. متابعة الطلب لا تمنحك اعتماد العمل أو تغيير مراحله. |
| I06 | Actions | اختر الإجراء المتاح الآن | القائمة تعرض ما تستطيع فعله على هذا العمل الآن. إنهاء المرحلة لا يعني اعتماد العمل. |
| I07 | Status, log and feedback | تابع نتيجة الإجراء | راجع الحالة والسجل بعد التنفيذ. إجراءات العمل لا يعيدها زر «تراجع» الخاص بتعديلات المكتبة. |
| I08 | Header and details | من يتولى هذا العمل؟ | راجع الحالة والمسؤول والتسليم والمشاريع. الرؤية والمشاركون يحددان من يستطيع متابعة العمل المقيّد. |

First-section tips:

- Stage extension, «تحتاج وقتاً إضافياً؟»: «افتح «طلب تمديد» من مرحلتك، واختر الموعد والسبب. راجع ما يتحرك معها قبل إرسال الطلب.»
- Review status, «اعتماد بإصدار محدد»: «الاعتماد للجزء بإصداره. التعديل يعيده وفق سياسة العمل، والاعتماد لا ينشره.»
- Plan editor, «قبل تغيير الخطة»: «راجع الترتيب والانتظار والمواعيد قبل الحفظ. تغيير ترتيب مرحلة قد يزيل انتظاراً لم يعد ممكناً.»
- Publishing preview, «حدود المنصة»: «راجع المعاينة والحدود لكل منصة. أصلح السبب الظاهر قبل متابعة الإرسال أو الجدولة.»

Empty or missing record: «العمل غير موجود أو غير متاح لك. عد إلى «العمل» وافتح عملاً يظهر في قائمتك.» Closed state: «هذا العمل مغلق. راجع سببه وسجله؛ إجراءات العمل النشط لا تظهر هنا.»

Deeper help: partial versus whole-package approval, text versions, stage gates, platform limits, resubmission, schedule suspension, and work log.

## 04. إنشاء

Page key: `create`. Route: `/create`. Priority: P1. Source: `src/components/work/create.tsx`.

Gap: the member currently receives copy about production plans and draft saving. Gate: creation role ability plus page access. Publisher cannot gain creation through a page grant. Admin can reach the route but the component blocks creation in the Admin role; use a permitted «عرض بصفة» role for testing.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A | أنشئ عملاً وحدد من يتولاه وموعده وخطته، أو اتركه طلباً للإسناد لاحقاً. | C01, C02, C03, C04 | Creates the intended assigned work or request. |
| مساعد مدير الاتصال المؤسسي | A | اختر النوع وراجع المسؤول والخطة والمواعيد قبل بدء الإنتاج. | C01, C02, C03, C04 | Checks the generated plan before saving. |
| كاتب المحتوى | A | أنشئ عملاً باسمك للمحتوى الذي تتولاه، أو اتركه بلا مسؤول ليصل طلباً للقادة. | C01, C02, C03, C04 | Understands own work versus unassigned request. |
| المصمم | A | اختر نوع العمل الذي يصف المطلوب، وأضف المقاسات والمراجع وموعد التسليم. | C01, C02, C03, C04 | Supplies the relevant design brief. |
| المنتج الإعلامي | A | حدد نوع الإنتاج ومتطلباته، وراجع مراحل التصوير والتسليم قبل الحفظ. | C01, C02, C03, C04 | Checks production dependencies and dates. |
| مسؤول النشر وإدارة الحسابات | R | دورك يستلم الأعمال المعتمدة للجدولة والنشر. إنشاء عمل جديد غير متاح لهذا الدور. | B01, C08, B03 | Reaches publishing without requesting an impossible grant. |
| عضو | A | اكتب ما تحتاجه من القسم ومتى تحتاجه، ثم أرسل الطلب ليُسند إلى من يتولاه. | C01, C05, C06, C07 | Sends a request and locates it afterward. |
| Admin | T/R | إنشاء العمل غير متاح بصفة Admin. لاختبار الإنشاء اختر دوراً يملك الإنشاء من «عرض بصفة». | B01, C09, B03 | Understands the role-view requirement. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| C01 | Type cards | اختر نوع المطلوب | النوع يحدد الحقول المناسبة. اختر ما يصف العمل أو الطلب، ثم أكمل معلوماته. |
| C02 | Basics, assignment and due date | وضّح المطلوب ومن يتولاه | اكتب العنوان والوصف والتسليم. اختر الحسابات المطلوبة إن ظهرت، وراجع المسؤول والمشاركين ضمن ما يسمح به دورك. |
| C03 | Plan after type selection | راجع الخطة المقترحة | يقترح المركز أصحاب المراحل ومواعيدها. راجع الانتظار ونقاط الاعتماد قبل الحفظ؛ يمكنك تعديل الخطة ضمن صلاحيتك. |
| C04 | Save bar | اختر نتيجة الحفظ | «حفظ مسودة» يبقي العمل «مسودة»، و«إنشاء وبدء الإنتاج» يبدأه. إذا تركته بلا مسؤول يُرسل طلباً للإسناد. |
| C05 | Member brief and required fields | ماذا تحتاج ومتى؟ | اكتب المطلوب ولمن، وأضف التفاصيل والمراجع المتاحة، وحدد متى تحتاجه. لا تحتاج إلى توزيع مراحل الإنتاج بنفسك. |
| C06 | Member request action | أرسل الطلب | «إرسال الطلب» يرسله إلى مدير الاتصال أو مساعده للإسناد. لن تختار مسؤول الإنتاج من هذا النموذج. |
| C07 | Post-save destination | تابع طلبك بعد الإرسال | يصدر المركز رقم الطلب عند الحفظ. تجده في «طلباتي» وتتابع المسؤول والحالة حين يُسند. |
| C08 | Allowed publishing destination | تابع الأعمال المعتمدة | افتح «الموافقات والنشر» ثم «النشر» لتجد ما يمكنك جدولته. منح صفحة لا يغيّر قدرة دورك على الإنشاء. |
| C09 | Admin role selector | اختر صفة للاختبار | استخدم «عرض بصفة» واختر دوراً يملك الإنشاء، ثم افتح «إنشاء». لا تُنشأ بيانات لمجرد عرض الإرشاد. |

First-section tips:

- Accounts, «الحساب بعينه»: «اختر الحساب الذي سينشر العمل، لا اسم المنصة وحده. قد توجد عدة حسابات للمنصة، وبعض المنصات تقبل الفيديو فقط.»
- Deadline, «المواعيد مرتبطة بالتسليم»: «تُحسب الخطة رجوعاً من التسليم ما لم تعدّلها بنفسك. راجعها بعد تغيير الموعد.»
- Restricted visibility, «من يرى العمل؟»: «العمل المقيّد يراه المعنيون والقادة ومن طلبه. اختر الرؤية المقصودة قبل الحفظ.»

Empty or prerequisite missing: «لا يوجد حساب صالح للاختيار لهذا النوع. يضيف مدير الاتصال أو مساعده حساباً من «حسابات المنصات».» Show this only when account selection is actually required; do not block the member request path with account-setup instructions.

Deeper help: type-specific fields, plan templates, request versus draft, mail-origin work, video-only requirements, and validation recovery.

## 05. الموافقات والنشر

Page key: `approvals`. Route: `/approvals`. Priority: P1. Sources: `src/components/work/approvals.tsx`, `publish.tsx`.

Gap: there are existing role steps, but the common queue explanation still assumes a review path. Gate: action role, record visibility, review state, self-approval checks, assigned publishing accounts, and authorisation. Initial publishing tab and review tab need different tours.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | ابدأ بما ينتظر قرارك. تعتمد الإصدار المعروض، ثم يتولى مسؤول النشر خطوة النشر. | A01, A02, A03 | Opens an eligible review without assuming publication. |
| مساعد مدير الاتصال المؤسسي | A/C | راجع الأعمال المسندة للقرار، بما فيها العاجل، ضمن قاعدة منع الاعتماد الذاتي. | A01, A02, A03 | Finds the correct decision and understands exclusions. |
| كاتب المحتوى | O | تابع ما أرسلته وما عاد بملاحظات، ثم افتح العمل لتعدّل الجزء المطلوب. | A04, A05, A03 | Follows a submission or requested change. |
| المصمم | O | تابع نتيجة مراجعة العمل والوسائط، وارجع إلى الجزء الذي يحتاج إصداراً جديداً. | A04, A05, A03 | Locates the file requiring correction. |
| المنتج الإعلامي | O | راجع ما أُرسل ونتيجة القرار لتعرف ما يحتاج إعادة إنتاج أو تعديل. | A04, A05, A03 | Finds production feedback and its work. |
| مسؤول النشر وإدارة الحسابات | A/C | هنا المعتمد والجدولة والتأكيد ونتيجة كل حساب. النشر في هذا الإصدار محاكاة. | A06, A07, A08, A09 | Schedules or confirms an eligible work. |
| عضو | O | تابع حالة ما يظهر لك من أعمال وقرارات. الاعتماد والجدولة ليسا من إجراءات دورك. | A10, A05, A03 | Reads the result and returns to the request. |
| Admin | T | اختبر تبويبي القرار والنشر كلّاً على حدة. تبقى قواعد الإصدار ومنع الاعتماد الذاتي سارية. | A01, A02, A03 | Tests review; publishing branch is A06, A07, A08, A09. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| A01 | Approval sub-tabs | ابدأ بما ينتظر قرارك | «بانتظار قراري» يعرض ما يمكنك مراجعته. ما أرسلته أو رفعته بنفسك له منع يوضحه المركز. |
| A02 | Review card | افتح المراجعة قبل القرار | البطاقة توضح العمل والأجزاء المعلّقة. افتح «مراجعة» لترى الإصدارات والمعاينة والموعد قبل الاعتماد أو طلب التعديل. |
| A03 | Status and decision log | الاعتماد خطوة مستقلة | اعتماد العمل لا ينشره. راجع الحالة وسجل القرارات؛ الجدولة والنشر إجراءان منفصلان لمسؤول النشر. |
| A04 | Sent sub-tab | تابع ما أرسلته | افتح «أرسلتها أنا» لتعرف ما ينتظر القرار وما صار «بحاجة إلى تعديل»، ثم افتح العمل المعني. |
| A05 | View action | افتح التفاصيل | «عرض» يريك العمل ونتيجة مراجعته. ظهور العمل لك لا يمنحك اتخاذ قرار عليه. |
| A06 | Publishing sections | ابدأ بالمعتمد | في «النشر» تجد «جاهز للنشر» و«مجدول» ونتائج المحاولة. اختر العمل الذي يحتاج إجراءك الآن. |
| A07 | Account authorisation and risk | هل التفويض يغطي الموعد؟ | راجع حالة كل حساب وتفويضه عند موعد النشر. افتح إعادة الربط للحساب الذي يحق لك ربطه إن احتاج ذلك. |
| A08 | Schedule or confirmation action | جدولة أو تأكيد عند الموعد | اختر الموعد المعتمد والحسابات. «اسأل قبل النشر» ينتظر تأكيدك عند الموعد، وتغيير الموعد قد يعيده للاعتماد. |
| A09 | Per-account result | النتيجة لكل حساب | النشر هنا محاكاة. في «نشر جزئي» أو «فشل النشر» راجع السبب وأعد المحاولة للحسابات التي فشلت فقط. |
| A10 | Read-only approval queue | تابع الحالة الظاهرة لك | افتح العمل الذي يخصك لتفهم المرحلة والقرار. إن احتاج الفريق معلومات منك فأضفها في نقاش العمل. |

First-section tips:

- Publish execution, «الموعد يحتاج متابعة»: «لا عامل نشر في الخلفية في هذا الإصدار. تنفيذ ما حل موعده مرتبط بفتح صفحات العمل، مع التأكيد حين يكون مطلوباً.»
- Manual pack, «المسار اليدوي»: «الحزمة تعرض النص والملفات للحساب ذي المسار اليدوي. اتبع ما تقوله نافذة النشر؛ عدّاد المحاكاة لا يثبت منشوراً خارج المركز.»
- Failed accounts, «أعد الفاشل فقط»: «راجع نتيجة كل حساب قبل إعادة المحاولة، حتى لا تعامل الحسابات الناجحة كأنها فشلت.»

Empty: reviewer «لا أعمال تنتظر قرارك الآن. تابع ما أرسلته أو سجل القرارات من تبويبيهما.» Publisher «لا أعمال معتمدة تنتظر الجدولة هنا. تظهر حين تكتمل موافقتها.» Other roles «لا أعمال ظاهرة في هذا التبويب. راجع ما أرسلته أو افتح طلبك من «العمل».»

Deeper help: whole-package policies, schedule changes, confirmations, platform limits, reconnecting, manual paths, and failure recovery.

## 06. شاشة المراجعة

Page key: `review`. Route: `/approvals/{id}`. Priority: P1. Source: `src/components/work/review.tsx`.

Gap: the tour describes decision controls even for observers. Gate: visible work, pending decision, approver role, submission author, file uploader, and approval policy. If the reviewer is blocked from a decision, use R01, R02, R05 instead of R03 and R04.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | C | راجع ما تغيّر وإصداره وسياسة العمل، ثم اتخذ القرار فيما يحق لك مراجعته. | R01, R02, R03, R04 | Approves or requests changes on the intended scope. |
| مساعد مدير الاتصال المؤسسي | C | تتخذ قرار المراجعة بالقواعد نفسها، بما فيها العاجل ومنع الاعتماد الذاتي. | R01, R02, R03, R04 | Understands decision scope and self-approval exclusion. |
| كاتب المحتوى | O | اطّلع على الفرق والملاحظات لتعرف النص أو نسخة المنصة التي تحتاج تعديلاً. | R01, R02, R05 | Identifies the exact text correction. |
| المصمم | O | راجع معاينة الملف والملاحظات بإصدارها قبل تجهيز التعديل. | R01, R06, R05 | Identifies the reviewed file and requested change. |
| المنتج الإعلامي | O | راجع مواضع الملاحظات على الفيديو والإصدار المطلوب تعديله. | R01, R06, R05 | Finds the correct time and video version. |
| مسؤول النشر وإدارة الحسابات | O | اطّلع على قرار الأجزاء والحسابات والموعد. استلام المعتمد للجدولة من تبويب «النشر». | R01, R02, R05 | Distinguishes approval state from publishing readiness. |
| عضو | O/C | إن ظهرت لك هذه المراجعة فمتابعتك للاطلاع. القرار لمدير الاتصال أو مساعده. | R01, R02, R05 | Reads the result without searching for decision controls. |
| Admin | T | اختبر القرار على الإصدار المعروض. لا تعتمد ما أرسلته أو رفعت إصداره بنفسك. | R01, R02, R03, R04 | Tests permitted decisions with exclusions intact. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| R01 | Review header and policy | ما الذي تراجعه؟ | راجع المرسل والدورة والسياسة. بعض الأنواع تُعتمد حزمة كاملة، وغيرها يُقرر في كل جزء منها. |
| R02 | Pending parts and diff | ركّز على ما يحتاج قراراً | قارن النص والمعاينة بالإصدار السابق. الجزء المعتمد الذي لم يتغيّر يبقى معتمداً حين تسمح السياسة بذلك. |
| R03 | Decision controls | اختر القرار المناسب | اعتمد ما راجعته، أو حدد ما يحتاج تعديلاً واكتب السبب. الرفض يوقف العمل عن غرضه؛ ليس طلب تصحيح. |
| R04 | Decision confirmation | القرار على هذا الإصدار | الاعتماد المهم يحتاج ضغطاً مطولاً ويسجّل باسمك. إذا اكتمل الاعتماد يصبح العمل «جاهز للنشر»، ولا يُنشر بهذا القرار. |
| R05 | Read-only or blocked reason | اعرف نتيجة المراجعة وحدود دورك | راجع السبب الظاهر إن لم تستطع القرار. افتح صفحة العمل لمتابعة التعديل أو الحالة، والنشر من مكانه بعد الاعتماد. |
| R06 | Video preview and notes | الملاحظة مرتبطة بموضعها | افتح وقت الملاحظة لتصل إلى موضعها في الفيديو. راجع رقم الإصدار حتى تعمل على الملف المقصود. |

First-section tips:

- Reviewer time note, «ملاحظة بوقت»: «خذ وقت الفيديو الحالي أو اكتب دقيقة وثانية، ثم وضّح المطلوب. تُحفظ الملاحظة مع الملف وترافق طلب التعديل.»
- Self-approval restriction, «يقرر غيرك»: «من أرسل العمل لا يعتمد إرساله، ومن رفع الإصدار لا يعتمد ذلك الإصدار. اطلب القرار من القائد الآخر المخوّل.»

No pending decision: «اتُّخذ القرار في هذه الدورة. راجع النتيجة والسجل، وافتح العمل لمتابعة الخطوة التالية.» Missing record uses G04 without showing its content.

Deeper help: exact-version approval, bundle policies, partial decisions, rejection versus closure, review cycles, and shared media approval across works.

## 07. التقويم

Page key: `calendar`. Route: `/calendar`. Priority: P1. Sources: `src/components/work/calendar.tsx`, `day-dialogs.tsx`, `src/lib/work/planning.ts`.

Gap: the first tour explains views and lanes, but barely distinguishes date ownership and consequences. Gate: visible work and tasks; personal reminders remain owner-only, including against Admin. Internal dates and publishing dates follow different rules.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | راجع التسليم والمراحل والنشر، وميّز ما تنقله مباشرة مما يحتاج طلباً واعتماداً. | K01, K02, K03, K06 | Chooses the correct date-change procedure. |
| مساعد مدير الاتصال المؤسسي | A/C | تابع حمل الأيام والمراحل المتأخرة، ونسّق نقل المواعيد ضمن قواعد كل نوع. | K01, K02, K03, K06 | Identifies a coordination issue and allowed action. |
| كاتب المحتوى | A/C | اعرض عملك لتجد مواعيد الكتابة والتسليم وما ينتظر إنجازك. | K01, K02, K04, K06 | Finds a stage and requests an extension if needed. |
| المصمم | A/C | تابع مراحل التصميم ومواعيدها، وافتح الموعد لتراجع ما عليك قبل التسليم. | K01, K02, K04, K06 | Opens the relevant design deadline. |
| المنتج الإعلامي | A/C | راجع أيام الإنتاج والمهام الممتدة وما يتبع تأخرها قبل طلب التمديد. | K01, K02, K04, K06 | Understands the visible dependency and extension path. |
| مسؤول النشر وإدارة الحسابات | A/C | راجع سطر كل حساب وتفويضه، وجدول المعتمد أو اطلب نقل موعد نشره. | K01, K02, K05, K06 | Schedules approved work or requests a date move. |
| عضو | A/C | تابع مواعيد ما يظهر لك، وأضف مهمة أو تذكيراً شخصياً من اليوم المناسب. | K01, K02, K07 | Creates an allowed personal item or opens a request date. |
| Admin | T | اختبر مواعيد العمل وإجراءات نقلها. التذكيرات الشخصية لا تظهر إلا لصاحبها. | K01, K02, K03, K06 | Tests date rules without expecting private reminders. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| K01 | Views and filters | اختر ما تريد متابعته | اختر يوم أو أسبوع أو شهر أو قائمة، ثم صفِّ بالمشروع أو «عملي فقط». المواعيد بتوقيت الرياض. |
| K02 | Date chip or agenda row | افتح الموعد واعرف نوعه | موعد النشر غير التسليم وغير المرحلة. افتح الموعد لتعرف العمل وصاحبه والإجراءات المتاحة لك. |
| K03 | Internal-date move | نقل التسليم والمراحل | للقادة نقل هذه المواعيد مباشرة ضمن قيود الخطة. راجع الأثر قبل التأكيد؛ يُسجّل النقل ويُبلّغ أصحاب المراحل. |
| K04 | Stage or task drawer | اطلب التمديد من موضعه | إذا احتجت وقتاً إضافياً فافتح مرحلتك أو مهمتك واطلب التمديد بسبب. الموعد لا يتغير بمجرد إرسال الطلب. |
| K05 | Account lane and publishing action | النشر على حساب محدد | راجع الحساب والتفويض. جدول المعتمد، أو اطلب نقل موعد نشره؛ الطلب يعلّق الموعد الحالي حتى القرار أو السحب. |
| K06 | Publishing move explanation | نقل النشر يحتاج اعتماداً | السحب أو اختيار موعد جديد يرسل طلب نقل. لا تنشر في الموعد القديم أو الجديد حتى يُعتمد الجديد أو يُسحب الطلب. |
| K07 | Day add and personal reminder | أضف ما يخصك | من اليوم المناسب أضف مهمة لنفسك أو تذكيراً. التذكير خاص بك ولا يراه زملاؤك ولا مسؤول النظام. |

First-section tips:

- Warnings, «تحذير قبل الموعد»: «التفويض القريب من الانتهاء أو ازدحام الحساب أو اليوم تنبيهات للمراجعة. اقرأ أثر كل منها؛ ليست كلها منعاً للحفظ.»
- Add menu, «الإضافة بحسب دورك»: «تظهر هنا أنواع الإضافة المسموحة لك. العمل والمهمة والحدث تبقى مرتبطة بصاحبها، والتذكير لك وحدك.»
- Spanning bars, «ممتد أو ينتظر»: «الشريط يمتد على أيام العمل. المتقطع ينتظر ما قبله؛ افتحه لمعرفة السبب قبل تغيير الموعد.»

Empty: «لا مواعيد ظاهرة في هذا المدى. غيّر المدى أو التصفية، أو أضف تذكيراً لك من يوم مناسب.» Do not promise a calendar entry for hidden or undated work.

Deeper help: approved publishing moves, cancellation, stage constraints, task extensions, warning meanings, timezone, and touch/keyboard alternatives to dragging.

## 08. المشاريع

Page key: `projects`. Route: `/projects`. Priority: P2. Source: `src/components/work/projects.tsx`.

Gap: the current new-project step may point observers at a heading while discussing creation they cannot perform. Gate: project visibility and leadership creation rule. A campaign is a project type, not a separate object.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | راجع تقدم المشاريع أو أنشئ مشروعاً بخطة أعماله ومسؤوله ومدته. | P01, P02, P03 | Creates a project or opens one for coordination. |
| مساعد مدير الاتصال المؤسسي | A/C | تابع ما تأخر وما يأتي بعده، وراجع خطة المشروع قبل إنشاء أعمالها. | P01, P02, P03 | Checks the project and optional work plan. |
| كاتب المحتوى | O | ابحث عن المشروع الذي تشارك فيه، ثم افتحه لتعرف أعمال الكتابة وسياقها. | P01, P02, P04 | Finds the relevant project and writing work. |
| المصمم | O | افتح المشروع لترى أعمال التصميم ومواعيدها ضمن الخطة المشتركة. | P01, P02, P04 | Locates the design contribution in context. |
| المنتج الإعلامي | O | تابع المشروع الذي تنتج له، وافتحه لترى مراحل الإنتاج والمهام المترابطة. | P01, P02, P04 | Opens production work within the project. |
| مسؤول النشر وإدارة الحسابات | O | استخدم المشروع لمعرفة الأعمال التي ستصل للنشر ومواعيدها. | P01, P02, P05 | Finds project works and their publishing context. |
| عضو | O | افتح المشروع الذي يخص طلبك لتعرف أعماله وتقدمه. | P01, P02, P04 | Locates a related request or work. |
| Admin | T | اختبر عرض المشاريع وإنشاءها. ظهور مشروع لا يفتح محتوى مقيّداً على غير المعنيين به. | P01, P02, P03 | Tests creation and visible project composition. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| P01 | Heading and cards | الحملة نوع من المشروع | المشروع يجمع أعمالاً ومهام وأحداثاً. قد يكون حملة أو فعالية أو مبادرة، ولكل منها مدة ومسؤول. |
| P02 | Project card | اقرأ التقدم ثم افتح المشروع | البطاقة توضح المدة والتقدم وما تأخر والموعد التالي. «فتح المشروع» يعرض الجدول والأعمال والأشخاص. |
| P03 | New-project action and dialog | خطة أعمال اختيارية | عند إنشاء المشروع يمكنك إضافة خطة أعمال. راجع أنواعها وتسليمها؛ الحفظ ينشئ الأعمال ومراحلها مع المشروع في خطوة واحدة. |
| P04 | Open-project action | اعرف موضع مساهمتك | افتح المشروع ثم ابحث عن عملك أو اسمك في «من يعمل على ماذا». تُعرض لك التفاصيل التي يحق لك رؤيتها. |
| P05 | Open-project action | تابع ما سيصل للنشر | افتح أعمال المشروع لتعرف حالتها ومواعيدها. الجدولة الفعلية داخل المركز من «الموافقات والنشر»، والنشر محاكاة. |

First-section tip: progress. Title: «ماذا يحسب التقدم؟». Body: «النسبة من المراحل والمهام المنجزة. تاريخ نهاية المشروع وحده لا يعني أن كل أعماله اكتملت.»

Empty: leaders «لا مشاريع بعد. ابدأ من «مشروع جديد» إن كان الإجراء متاحاً لك.» Others «لا مشاريع ظاهرة لك الآن. يمكنك متابعة عملك أو طلبك من «العمل».»

Deeper help: automatic assignment, multi-project works, all-or-nothing plan creation, and progress calculation.

## 09. صفحة المشروع

Page key: `project`. Route: `/projects/{id}`. Priority: P2. Sources: `src/components/work/projects.tsx`, `src/lib/work/planning.ts`.

Gap: the tour describes four views but does not tell each role which to use first. Gate: project and child-record visibility; adding work, tasks, and events each has its own rule.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | راجع الجدول ومن يعمل على ماذا، ثم افتح العمل الذي يحتاج إسناداً أو قراراً. | J01, J02, J03, J06 | Finds a project coordination action. |
| مساعد مدير الاتصال المؤسسي | A/C | تابع انتقال العمل بين الأشخاص وما ينتظر التسليم، ثم نسّق من صفحة العمل. | J01, J03, J02, J06 | Identifies a dependency and its owner. |
| كاتب المحتوى | O/C | ابحث عن اسمك ومراحل الكتابة لتعرف متى تبدأ ولمن تسلّم بعدها. | J01, J03, J04 | Opens the correct writing stage. |
| المصمم | O/C | تابع مراحل التصميم وما تنتظره من كتابة أو إنتاج قبل تجهيز النسخة التالية. | J01, J03, J04 | Identifies a prerequisite and opens the work. |
| المنتج الإعلامي | O/C | راجع مراحل الإنتاج والمهام المسندة إليك ومن ينتظر مخرجاتك. | J01, J03, J04 | Understands the next production handoff. |
| مسؤول النشر وإدارة الحسابات | O | اعرف الأعمال ومواعيد النشر ضمن المشروع، ثم افتح المعتمد من مكان النشر. | J01, J02, J05 | Finds a work and its publishing date. |
| عضو | O | تابع الأعمال المرتبطة بالمشروع، وافتح العمل الذي يخص طلبك. | J01, J02, J04 | Opens a visible request or work. |
| Admin | T | اختبر الجدول والعروض والإضافات المسموحة، مع بقاء صلاحيات الأعمال والمهام سارية. | J01, J02, J03, J06 | Tests views and permitted additions. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| J01 | Header and tabs | اختر العرض المناسب | «الجدول الزمني» للمواعيد، و«من يعمل على ماذا» للأشخاص، و«الأعمال» و«المهام» للتفاصيل. |
| J02 | Timeline | اقرأ المراحل على الأيام | كل شريط مرحلة أو مهمة. المتقطع ينتظر غيره، وعلامتا التسليم والنشر مختلفتان. افتح الشريط لمعرفة تفاصيله. |
| J03 | People view | بعد من تبدأ ولمن تسلّم؟ | ابحث عن اسمك أو الشخص المطلوب. الترتيب يوضح ما ينتظره وما يأتي بعده؛ إنجاز المرحلة يتم من العمل. |
| J04 | Work row or timeline bar | افتح العمل لمتابعته | صفحة العمل تعرض النص والملفات والمراحل والنقاش. عرض المشروع يجمع السياق، ولا يُنهي المراحل بمجرد قراءته. |
| J05 | Work or publishing-date marker | موعد النشر ضمن المشروع | افتح العمل ثم تابع الجدولة من «الموافقات والنشر». تغيير موعد النشر يحتاج طلباً واعتماداً. |
| J06 | Header additions | أضف بالإجراء المناسب | «عمل في المشروع» يفتح نموذج الإنشاء مربوطاً به. أضف مهمة أو حدثاً فقط حين يكون الإجراء متاحاً لك. |

First-section tip: task view. Title: «المهام التي تراها». Body: «يعرض غير القادة ما أُسند إليهم وما أسندوه. عدد المهام الظاهر لك قد يختلف عما يراه القادة.»

Empty: «لا أعمال أو مراحل ظاهرة في هذا العرض. جرّب عرضاً آخر، أو أضف عنصراً إن كان الإجراء متاحاً لك.» Missing project uses G04.

Deeper help: dependencies, progress, task visibility, links to filtered calendar, and adding an existing versus a new work.

## 10. الطلبات

Page key: `requests`. Route: `/requests`. Priority: P1. Sources: `src/components/work/requests.tsx`, `src/components/perm-requests.tsx`, `src/lib/work/planning.ts`.

Gap: the first tour names tabs, while a new user needs to distinguish request types, decision owners, and consequences. Gate: type-specific decision authority and no self-decision. Away delegation is not built and must never be introduced as usable.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | راجع الطلب ونوعه وأثره، ثم قرر فيما يحق لك أو أسند طلب العمل. | Q01, Q02, Q03, Q06 | Makes the correct type-specific decision. |
| مساعد مدير الاتصال المؤسسي | A/C | تابع طلبات الفريق وحدد أثر التمديد أو النقل قبل القرار، ضمن صلاحياتك. | Q01, Q02, Q03, Q06 | Understands scope and downstream effects. |
| كاتب المحتوى | A/C | اطلب تمديداً أو وصولاً عند الحاجة، وتابع طلباتك وما يحق لك القرار فيه كمسؤول عمل. | Q01, Q04, Q05, Q06 | Sends or follows the appropriate request. |
| المصمم | A/C | اطلب الوقت أو الوصول الذي تحتاجه، وراجع السبب والنتيجة في طلباتك. | Q01, Q04, Q05, Q06 | Requests a folder or stage extension correctly. |
| المنتج الإعلامي | A/C | تابع تمديد مراحل الإنتاج والمهام، وراجع طلبات ما أسندته حين يحق لك القرار. | Q01, Q04, Q05, Q06 | Distinguishes requester and assigner decisions. |
| مسؤول النشر وإدارة الحسابات | A/C | تابع طلبات نقل النشر وما ينتظر تأكيدك. تنفيذ التأكيد نفسه من تبويب «النشر». | Q01, Q07, Q05, Q06 | Reaches the correct publishing action. |
| عضو | A/C | أرسل طلب العمل أو الوصول أو الصلاحية المتاحة، ثم تابع القرار وسببه. | Q01, Q04, Q05, Q06 | Finds the right request type and result. |
| Admin | T | اختبر جمع الطلبات وقراراتها بحسب نوعها. لا تقرر في طلب أرسلته أنت. | Q01, Q02, Q03, Q06 | Tests routing and self-decision exclusion. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| Q01 | Request tabs | طلب أرسلته أم قرار ينتظرك؟ | «طلباتي» لما أرسلته، و«بانتظار قراري» لما يمكنك القرار فيه، و«المنتهية» للنتائج. |
| Q02 | Request card | اقرأ النوع والأثر أولاً | التمديد قد يحرّك ما بعده، والوصول للمجلد يمنح عرضاً فقط. راجع صاحب الطلب والسبب والأثر قبل القرار. |
| Q03 | Type-specific decision or assignment | قرر في نطاق صلاحيتك | وافق أو ارفض بسبب حين يكون القرار لك، أو افتح العمل لإسناده. لا يقرر أحد في طلب أرسله بنفسه. |
| Q04 | New request or permission request | اختر ما تحتاجه فعلاً | اطلب تمديداً أو وصولاً أو عملاً، أو افتح طلب الصلاحية. اكتب السبب والمدة أو الموعد حين يطلبهما النموذج. |
| Q05 | Sent and completed requests | تابع القرار أو اسحب الطلب | افتح الطلب لتقرأ نتيجته وسببه. يمكنك سحب طلبك ما دام ينتظر القرار، ويصلك إشعار عند البت فيه. |
| Q06 | Destination link and unavailable delegation | بعض الطلبات تُكمل من مكانها | البريد المحتجز يُعتمد من البريد، وتأكيد النشر من «النشر». «التفويض» أثناء الغياب لم يُبنَ بعد. |
| Q07 | Publishing request card | النقل غير تأكيد النشر | نقل الموعد يحتاج اعتماداً، وتأكيد النشر إجراء عند الموعد. افتح الرابط في البطاقة لتصل إلى المكان الصحيح. |

First-section tips:

- Extension effect, «ما الذي يتحرك؟»: «راجع المراحل والمهام التالية. إن تجاوزت الموعد النهائي فقرار مدّه يُعرض على من يعتمد التمديد.»
- Permission decision, «من يقرر في الصلاحية؟»: «يقرر من يدير رتبة صاحب الطلب ويملك الصلاحية نفسها. يمكنه تعديل المدة، ولا تُمنح الصلاحيات المقفلة بقواعد المركز.»
- Folder access, «وصول للعرض»: «موافقة هذا الطلب تفتح عرض المجلد. الرفع والتحرير والإدارة تحتاج مستوياتها الخاصة.»

Empty: «لا طلبات في هذا التبويب. افتح «طلباتي» لمتابعة ما أرسلته، أو «طلب جديد» إن احتجت إجراءً متاحاً لك.»

Deeper help: extension propagation, final due date, decision hierarchy, permission duration and uses, folder access, and date-only versus broader work review.

## 11. مكتبة الوسائط

Page key: `library`. Route: `/media`. Priority: P1. Sources: `src/components/media/library.tsx`, `parts.tsx`, `src/lib/media/rules.ts`.

Gap: shared copy assumes upload and exclusively Google Drive storage. Gate: actual folder level and lock, creative-role restrictions, and approved-file protection. Do not infer upload/edit rights from a specialist role. New uploads currently go to Google Drive; moved files can be served from their recorded provider.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | ابحث عن الملف أو المجلد، وراجع ما ينتظر الاعتماد والوصول ضمن صلاحيتك. | L01, L02, L05, L04 | Finds a review or permitted folder-management action. |
| مساعد مدير الاتصال المؤسسي | A/C | تابع الملفات والمراجعات وصلاحية المجلد قبل الإسناد أو الاعتماد. | L01, L02, L05, L04 | Finds the intended file and access level. |
| كاتب المحتوى | A/C | ابحث عن مراجع عملك، وارفع أو عدّل فقط في المجلد الذي يسمح لك بذلك. | L01, L02, L03, L04 | Uses an allowed source or upload location. |
| المصمم | A/C | احفظ مخرجاتك في المجلد المناسب، وافتح الملف نفسه حين يكون المطلوب إصداراً جديداً. | L01, L02, L03, L04 | Distinguishes a new asset from a new version. |
| المنتج الإعلامي | A/C | اعثر على مواد الإنتاج وارفع المخرجات في المجلد المتاح، ثم تابع الملف ومهامه. | L01, L02, L03, L04 | Finds or uploads the intended production file. |
| مسؤول النشر وإدارة الحسابات | A/C | ابحث عن الجاهز للنشر وافتح الملف للتحقق من إصداره المعتمد. | L01, L02, L06, L04 | Opens the approved publishing source. |
| عضو | O/C | تصفح ما أُتيح لك، وافتح الملف المطلوب. الوصول للعرض وحده لا يتيح الرفع. | L01, L02, L04 | Finds a visible file and understands access limits. |
| Admin | T | اختبر الوصول وإدارة المجلدات والملفات ضمن قواعد المكتبة. القرارات والإصدارات تبقى مسجّلة. | L01, L02, L05, L04 | Tests folder access and management rules. |

If L03's upload action is unavailable, replace it with L07. Member receives an upload path only if both the role/action rule and folder level actually permit it; this proposal grants no new creative-role ability.

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| L01 | Folder tree | ابدأ بالمجلد المناسب | افتح المجلد الذي يخص عملك. ما يظهر لك يتبع وصولك؛ قد ترى مساراً يقود إلى مجلد متاح دون أن تفتح ما فوقه. |
| L02 | Access and lock indicator | راجع وصولك والقفل | «عرض» غير «تحرير» وغير «إنشاء» و«إدارة». المجلد المقفل قد يمنع التعديل والرفع حتى مع وجود وصول إليه. |
| L03 | Upload area | ملف جديد أم إصدار جديد؟ | ارفع هنا لبدء ملف جديد. إذا كان تعديلاً لملف موجود فافتح صفحته وارفع إصداراً جديداً حين يكون الإجراء متاحاً. |
| L04 | File card | افتح الملف لتتابع رحلته | صفحة الملف تجمع المعاينة والإصدارات والملاحظات والمهام. نقل مكان تخزينه لا يغيّر مرجعه داخل العمل. |
| L05 | Attention panel and folder controls | المراجعة والوصول من موضعهما | افتح ما ينتظر مراجعتك. «الوصول والقفل» متاح لمن يملك إدارة المجلد؛ لا تغيّر الوصول قبل مراجعة أثره. |
| L06 | Ready filter | اختر الإصدار المعتمد | صفِّ بالجاهز للنشر ثم افتح الملف. الاعتماد مربوط بإصدار، والنشر نفسه محاكاة في هذا الإصدار من المركز. |
| L07 | Actual permission reason | الرفع غير متاح هنا | راجع مستوى وصولك والقفل والسبب الظاهر. اطلب الوصول المتاح أو راجع من يدير المجلد؛ طلب العرض لا يمنح الرفع. |

First-section tips:

- Undo, «تراجع عن تعديل المكتبة»: «يمكن التراجع عن تعديلات مكتبة محددة خلال ساعة ما لم يغيّرها أحد بعدك. الرفع والحذف والاعتماد والنشر ليست ضمن هذا التراجع.»
- Batch selection, «قبل الإجراء على المحدد»: «راجع الملفات المحددة كلها قبل النقل أو الحذف. بعض الملفات أو المجلدات قد تمنع الإجراء بحسب وصولك أو اعتمادها.»
- Storage, «مكان الحفظ»: «الرفع الجديد يذهب حالياً إلى Google Drive. قد تُخدّم الملفات المنقولة من مزود آخر؛ موضع كل إصدار في صفحة الملف.»

Empty: «لا ملفات ظاهرة في هذا المجلد. راجع التصفية ووصولك. ارفع ملفاً إن كان الرفع متاحاً لك هنا.» Do not describe every deletion as Google Drive trash; name the actual provider and its recovery rule.

Deeper help: folder levels, inheritance, restriction and lock, upload recovery, provider-aware trash, bulk actions, pipeline board, and undo boundaries.

## 12. صفحة الملف

Page key: `asset`. Route: `/media/{id}`. Priority: P1. Sources: `src/components/media/asset-page.tsx`, `dialogs.tsx`, `src/lib/media/rules.ts`.

Gap: the tour names sections without teaching version handling, correction, and sharing. Gate: folder level, file stage, uploader identity, action role, and approved-version protection. Use observation cards F01, F02, F07 when an editing/decision action is unavailable.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | C | راجع الإصدار والمعاينة والملاحظات، ثم قرر فيما يحق لك مراجعته. | F01, F02, F03, F07 | Reviews the intended version without self-approval. |
| مساعد مدير الاتصال المؤسسي | C | راجع النسخة المطلوبة، وأضف ملاحظة أو قراراً ضمن صلاحيتك. | F01, F02, F03, F07 | Identifies the exact reviewed version. |
| كاتب المحتوى | C | راجع الملف واكتب العنوان والوصف لكل منصة حين يكون الإجراء متاحاً لك. | F01, F02, F04, F07 | Updates intended platform copy without altering the file version. |
| المصمم | C | راجع الملاحظات ثم ارفع إصدار التعديل على الملف نفسه، مع بقاء المعتمد محفوظاً. | F01, F02, F05, F07 | Uploads the correct new version. |
| المنتج الإعلامي | C | افتح ملاحظات الفيديو بوقتها وارفع الإصدار المعدّل، ثم تابع المهام المرتبطة. | F01, F06, F05, F07 | Applies timed feedback to the correct version. |
| مسؤول النشر وإدارة الحسابات | C | تحقق من الإصدار المعتمد والجاهزية قبل إجراء النشر المتاح. | F01, F02, F08, F07 | Uses the approved version and sees simulation boundaries. |
| عضو | O | اعرض الملف وإصداراته وملاحظاته ضمن وصولك. الإجراءات تظهر بحسب دورك وصلاحية المجلد. | F01, F02, F07 | Reads the version and visible feedback. |
| Admin | T | اختبر إجراءات الملف والوصول والإصدارات. لا تعتمد إصداراً رفعته بنفسك. | F01, F02, F03, F07 | Tests a permitted action without bypassing uploader restrictions. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| F01 | Preview and header | هذا الملف ومرحلته | راجع المعاينة والاسم والمرحلة. الملف نفسه قد يدخل في أكثر من عمل، وتبقى إصداراته مرتبطة به. |
| F02 | Versions | الحالي غير المعتمد | تحقق من رقم الإصدار. الجديد لا يمس المعتمد السابق، واعتماد ملف يسري على هذا الإصدار في الأعمال التي تستخدمه. |
| F03 | Reviewer action | قرارك على إصدار محدد | اعتمد الإصدار أو اطلب تعديله حين يحق لك القرار. الاعتماد يقفله، ولا يعتمد أحد إصداراً رفعه بنفسه. |
| F04 | Platform copy action | العنوان والوصف للمنصة | افتح إجراء كتابة العنوان والوصف حين يكون متاحاً. راجع كل منصة مستهدفة؛ تغيير النص لا يرفع ملفاً جديداً. |
| F05 | New-version action | ارفع التعديل إصداراً جديداً | استخدم «رفع إصدار جديد» من هذا الملف. يبقى المعتمد محفوظاً، ويحتاج الإصدار الجديد مراجعة قبل اعتماده. |
| F06 | Video notes | ابدأ من الملاحظات بوقتها | افتح وقت الملاحظة لتصل إلى موضعها في الفيديو، وتحقق من الإصدار الذي كُتبت عليه قبل التعديل. |
| F07 | Quick actions and journey | الخطوة التالية بحسب حالته | استخدم الإجراء المتاح الآن، ثم راجع الرحلة والمهام. لا يتيح عرض الملف كل إجراءات التحرير أو الاعتماد. |
| F08 | Readiness and publishing action | تحقق قبل النشر | راجع الإصدار المعتمد والعنوان والوصف والحسابات. الجدولة والنشر يحتاجان صلاحية النشر، والنشر هنا محاكاة. |

First-section tips:

- Review link, «مشاركة للمراجعة فقط»: «إن أتيح لك إنشاء الرابط فاختر مدته وشاركه مع المقصود فقط. من يملكه يرى الملف الحالي حتى انتهاء الرابط أو إلغائه، ولا يفتح المجلد.»
- Task assignment, «مهمة على هذا الملف»: «حدد المطلوب وصاحبه وموعده إن كان الإسناد متاحاً لك. تظهر المهمة في مواضع متابعتها دون نسخ الملف.»
- Storage location, «أين توجد هذه النسخة؟»: «هذا السطر يوضح مزود كل إصدار وآخر فحص له. لا يعني فحص الوجود وحده أن هناك نسخة احتياطية متحققاً منها.»

Unavailable: «الملف غير موجود أو لا تملك الوصول إليه. عد إلى المكتبة واختر ملفاً يظهر لك.» No versions/preview: explain the actual missing or unsupported preview without calling the file lost.

Deeper help: upload failure and retry, new asset versus version, version-bound approval, review-link expiry and revocation, timed notes, copy requests, and storage health.

## 13. المهام

Page key: `tasks`. Route: `/tasks`. Priority: P1. Sources: `src/components/media/tasks-page.tsx`, `src/components/media/provider.tsx`.

Gap: existing help claims a single list of all task sources. The current component renders the media provider's task collection and does not render a general task editor or extension action. Gate: actual returned tasks, assignee/assigner relationship, and completion permission. Describe only the collection this page really loads. Do not equate a work stage with a task or direct the user to an absent button.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | راجع المهام الظاهرة للفريق، وافتح أصل المهمة لفهم المطلوب قبل المتابعة. | T01, T02, T03 | Finds a late task and its linked file. |
| مساعد مدير الاتصال المؤسسي | A/C | تابع أصحاب المهام والمواعيد، وافتح الأصل عند الحاجة إلى تنسيق التسليم. | T01, T02, T03 | Identifies the assigner and assignee. |
| كاتب المحتوى | A/C | ابدأ بمهام الكتابة المسندة إليك، وراجع الملف المطلوب قبل إعلان الإنجاز. | T04, T02, T03 | Completes the intended copy task. |
| المصمم | A/C | افتح مهمة التصميم ومصدرها لتراجع المطلوب والملاحظات قبل إتمامها. | T04, T02, T03 | Connects the task to the correct asset. |
| المنتج الإعلامي | A/C | تابع ما أُسند إليك وما أسندته أنت. إنشاء المهمة أو تعديلها من موضعها المتاح. | T04, T02, T03 | Distinguishes personal work from assigned-out tasks. |
| مسؤول النشر وإدارة الحسابات | A/C | راجع مهام تجهيز النشر المسندة إليك، وافتح الملف المرتبط للتحقق من الجاهزية. | T04, T02, T03 | Completes preparation without confusing it with publishing. |
| عضو | A/C | هنا المهام التي أُسندت إليك ضمن ما يظهر لك. افتح مصدرها لتعرف المطلوب. | T04, T02, T03 | Finds and completes an assigned task. |
| Admin | T | اختبر عرض المهام وإنجازها بالصلاحية المتاحة، مع تمييز المهمة عن مرحلة العمل. | T01, T02, T03 | Tests completion without claiming full source unification. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| T01 | Task tabs | مهامك وما تتابعه للفريق | «مسندة إليّ» لما عليك، و«أسندتها أنا» لما طلبته من غيرك. «كل المهام» يظهر لمن يملك متابعة الفريق هنا. |
| T02 | Task row and source link | اقرأ المطلوب وموعده | راجع من أسند المهمة ولمن والموعد والملاحظة. «فتح الأصل» يعرض الملف المرتبط حين يوجد ويكون متاحاً لك. |
| T03 | Completion action | أعلن الإنجاز بعد اكتماله | «تمت» تنهي المهمة حين يكون الإجراء متاحاً لك وتبلّغ من أسندها. لا تعني اعتماد الملف أو نشره أو إنهاء مرحلة عمل أخرى. |
| T04 | Personal and assigned-out tabs | اختر القائمة التي تقصدها | افتح «مسندة إليّ» لإنجاز ما عليك، أو «أسندتها أنا» لمتابعة ما طلبته. الأعداد تتبع التبويب المختار. |

First-section tip: empty task/source. Title: «أين أجد بقية المطلوب؟». Body: «مراحل العمل تُتابع من صفحة العمل. إذا لم تظهر مهمة هنا فارجع إلى موضع إنشائها، أو راجع من أسندها لك.»

Empty: «لا مهام في هذا التبويب. جرّب تبويباً آخر، وتابع مراحل عملك من صفحة العمل.» Keep actual loading failures separate from an empty task collection.

Deeper help: which task sources are included today, completion permissions, assignment from source pages, and extension where an actual extension action exists. Resolve task-source parity before claiming universal coverage in help.

## 14. سجل النشاط

Page key: `activity`. Route: `/activity`. Priority: P2. Sources: `src/components/media/activity-page.tsx`, `src/lib/access-matrix.ts`.

Gap: the tour focuses on immutable events and filters; it under-explains team visibility and the difference from the work log and settings log. Gate: whole versus own/allowed activity and event-source visibility. The log is not a route to private correspondence.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A | تابع نشاط الفريق ومهامه، ثم ابحث عن التغيير الذي تحتاج مراجعته. | V01, V02, V03, V04 | Finds a member's visible change history. |
| مساعد مدير الاتصال المؤسسي | A | استخدم لوحة الفريق لمعرفة آخر إجراء والمهام المتأخرة، ثم راجع الحدث نفسه. | V01, V02, V03, V04 | Uses team filters to inspect an event. |
| كاتب المحتوى | A | راجع أنشطتك وما يظهر لك من تغييرات الملفات والصلاحيات. | V01, V03, V04 | Finds an own event and its recorded values. |
| المصمم | A | تابع تغييرات ملفاتك والإصدارات والقرارات التي يحق لك الاطلاع عليها. | V01, V03, V04 | Identifies the relevant file event. |
| المنتج الإعلامي | A | راجع أحداث الإنتاج والملفات والمهام التي تظهر لك في هذا السجل. | V01, V03, V04 | Finds an event without assuming universal logging here. |
| مسؤول النشر وإدارة الحسابات | A | راجع النشاط الظاهر لك، وارجع إلى سجل العمل لتفاصيل إجراءاته عند الحاجة. | V01, V03, V04 | Chooses the right log for the question. |
| عضو | A | راجع أنشطتك وما يتيحه لك المركز من سجل. ظهور سجل لا يفتح محتوى خاصاً بغيرك. | V01, V03, V04 | Finds an own event and understands scope. |
| Admin | T | اختبر السجل ولوحة الفريق. السجل لا يُعدّل، ولا يتيح قراءة البريد الداخلي أو المحادثات الخاصة. | V01, V02, V03, V04 | Tests scope and immutable history. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| V01 | Heading and scope | سجل لما يحق لك رؤيته | هنا الأحداث التي يتيحها لك المركز. سجل العمل داخل العمل، وسجل التكاملات في «الإعدادات». |
| V02 | Team panel | من يحتاج متابعة؟ | لوحة الفريق توضح آخر إجراء والمهام المفتوحة والمتأخرة. اختر شخصاً لتصفية أحداثه الظاهرة لك. |
| V03 | Search and filters | ابحث عن حدث محدد | صفِّ بالشخص أو نوع الإجراء، أو ابحث بالنص. أزل التصفية إذا لم تجد الحدث المطلوب. |
| V04 | Event row | اقرأ ما تغيّر | راجع الوقت وصاحب الإجراء وما كان قبله وما صار بعده. لا يُحذف الحدث بالتراجع؛ يُسجّل التراجع حدثاً جديداً. |

First-section tip: permission events. Title: «سجل الصلاحية». Body: «قد ترى منحاً أو سحباً أو استخداماً لصلاحية ضمن ما يحق لك. تفاصيل إدارة الشخص في «الحسابات» لمن يملكها.»

Empty: «لا أحداث ظاهرة بهذه التصفية. غيّرها، أو راجع سجل العمل أو سجل الإعدادات إن كان الحدث من هناك ويحق لك فتحه.»

Deeper help: event sources and visibility, team metrics, before/after values, undo events, and immutable history.

## 15. التحليلات

Page key: `analytics`. Route: `/analytics`. Priority: P2. Source: `src/components/work/analytics.tsx`.

Gap: roles receive the same cards without a practical reading goal. Current lead wording about restricted work conflicts with the work visibility rules. Gate: actual visible works and account data. These are workflow metrics; do not describe reach, impressions, or live platform engagement as available. Charts must not be presented as interactive filters unless they actually are.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A | راجع سير العمل والتأخر والمراجعة لتحدد ما يحتاج متابعة من الفريق. | N01, N02, N03 | Interprets a workflow issue without inventing audience metrics. |
| مساعد مدير الاتصال المؤسسي | A | استخدم التأخر وجولات المراجعة لتعرف أين يحتاج التسليم إلى تنسيق. | N01, N02, N03 | Relates a metric to a coordination question. |
| كاتب المحتوى | A | اقرأ أرقام الأعمال التي تظهر لك، وراجع ما ينتظر القرار أو عاد للتعديل. | N01, N02, N03 | Understands the scope of revision metrics. |
| المصمم | A | تابع حالات الأعمال وجولات المراجعة ضمن ما يحق لك رؤيته. | N01, N02, N03 | Distinguishes workflow status from personal evaluation. |
| المنتج الإعلامي | A | راجع التأخر والمراجعة وتوزع الأعمال عبر الأسابيع لتتابع سير الإنتاج. | N01, N02, N03 | Reads workflow trends within visible data. |
| مسؤول النشر وإدارة الحسابات | A | تابع جاهزية الحسابات والتفويض ونتائج محاولات النشر داخل المركز. | N01, N04, N03 | Distinguishes a real connection from simulated publishing results. |
| عضو | A | الأرقام هنا لما يظهر لك من أعمال، وقد تختلف عما يراه زميلك. | N01, N02, N03 | Understands data scope and status totals. |
| Admin | T | اختبر الأرقام من البيانات الفعلية وحدود رؤيتها. نتائج النشر هنا من المحاكاة. | N01, N04, N03 | Checks scope without treating it as a live platform report. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| N01 | Summary tiles | الأرقام لما يظهر لك | تُحسب الأعمال والحسابات المتاحة لك. اختلاف الوصول قد يجعل أرقامك مختلفة عن أرقام زميلك. |
| N02 | Status, weeks and review panels | اقرأ سير العمل | راجع الحالات والتأخر وجولات المراجعة والأسابيع. هذه مؤشرات لسير الأعمال، وليست أرقام وصول الجمهور أو تفاعله على المنصات. |
| N03 | Simulation note and navigation | تحقق من معنى النتيجة | أرقام النشر نتائج المحاكاة. لمتابعة عمل بعينه افتحه من «العمل»، ولا تعدّ رقماً هنا دليلاً على نشر خارجي. |
| N04 | Platforms panel | ربط حقيقي ونتيجة محاكاة | حالة الربط والتفويض تأتي من الحسابات. الحساب المربوط فعلاً لا يعني أن المركز نشر عليه فعلاً. |

First-section tip: review rounds. Title: «جولات المراجعة». Body: «المتوسط يصف الأعمال التي تدخل في الحساب. افتح العمل المعني لتفهم أسباب التعديل؛ العدد وحده لا يوضحها.»

Empty: «لا بيانات كافية للأعمال الظاهرة لك. تظهر المؤشرات مع إنشاء الأعمال وتقدمها. تابع ما لديك من «العمل».» Offer creation only to a permitted creator/member, not to the publisher or Admin in its blocked creation role.

Deeper help: metric definitions and denominators, scope and dates, status meanings, authorisation state, and simulation limits.

## 16. استوديو الحركة

Page key: `motion`. Route: `/motion`. Priority: P2. Sources: `src/components/motion-studio.tsx`, `motion-controls.tsx`, `motion-export.tsx`.

Gap: the first tour omits export and the later library handoff. Gate: page access. Editing and exporting here are local; they do not approve work or upload files. A later upload still needs library permissions. The current exporter already has format descriptions; reuse and link that content.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A | جرّب عنصراً متحركاً وراجع محتواه، ثم احفظ الناتج على جهازك إن احتجته. | M01, M02, M03, M04 | Understands local output and later review requirements. |
| مساعد مدير الاتصال المؤسسي | A | راجع النص والتوقيت والمعاينة قبل تنزيل عنصر يحتاجه الفريق. | M01, M02, M03, M04 | Checks content and timing before export. |
| كاتب المحتوى | A | جهّز نص العنوان أو الرقم داخل القالب، وعاينه قبل تسليمه للفريق. | M01, M02, M03, M04 | Edits readable copy without assuming it is saved as work. |
| المصمم | A | اختر القالب والمقاس وعدّل المحتوى والألوان، ثم صدّر الصيغة المناسبة للاستخدام. | M01, M02, M03, M04 | Exports the intended format and ratio. |
| المنتج الإعلامي | A | جهّز العنصر الذي ستضعه على المقطع، واختر الشفافية أو الخلفية المفتاحية عند التصدير. | M01, M02, M03, M04 | Chooses a usable compositing format. |
| مسؤول النشر وإدارة الحسابات | A | جهّز عنصراً عند الحاجة، ثم أدخله في مسار الملفات والمراجعة قبل استعماله في النشر. | M01, M02, M03, M04 | Knows local export does not imply approval or publication. |
| عضو | A | يمكنك تجهيز عنصر وتنزيله محلياً. إرساله ضمن عمل للقسم يحتاج مسار الطلب أو المكتبة المتاح لك. | M01, M02, M03, M04 | Exports locally without expecting automatic upload. |
| Admin | A | الاستوديو أداة على جهازك. عرض القوالب وتصديرها لا يغيّر بيانات العمل أو صلاحياته. | M01, M02, M03, M04 | Understands local versus shared state. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| M01 | Catalog and ratio | اختر القالب والمقاس | اختر عنصراً من الكتالوج ثم نسبة العرض المناسبة. تغيير القالب قد يغيّر الحقول والإعدادات المتاحة. |
| M02 | Settings and preview | عدّل وعاين الحركة | راجع النص والألوان والتوقيت في المعاينة. خلفية المعاينة لا تحدد وحدها خلفية الملف الذي ستصدّره. |
| M03 | Export panel | اختر صيغة التنزيل | راجع شرح الصيغة: فيديو بخلفية خضراء أو شفاف أو تسلسل صور أو صورة واحدة. اختر الدقة ثم «تنزيل التصميم». |
| M04 | Export result and local-state note | الملف على جهازك | التنزيل لا يرفع الملف إلى المكتبة ولا ينشره. تحديث الصفحة يعيد تعديلات الاستوديو إلى الأصل. |

First-section tips:

- Format, «الشفافية وطريقة التركيب»: «اختر الصيغة التي يقبلها برنامج المونتاج. للخلفية المفتاحية اختر لوناً غير موجود في التصميم حتى لا يُحذف جزء منه.»
- Heavy export, «إذا تعذّر التصدير»: «قلّل الدقة أو المدة أو اختر صيغة أخرى وفق الرسالة الظاهرة. بعد النجاح راجع الملف المنزّل قبل تسليمه.»
- Work-origin context, «مفتوح من عمل»: «قد يأتي القالب بعنوان مقترح من العمل. تعديله هنا لا يحفظه في العمل ولا يضيف الملف إليه تلقائياً.»

Empty: «اختر عنصراً من الكتالوج لتظهر المعاينة وإعداداته.» Export error remains a distinct operation error, not an empty catalog.

Deeper help: format compatibility, transparency, size and memory limits, local unsaved state, cancellation, and the upload/review handoff.

## 17. البريد

Page key: `mail`. Route: `/mail`. Priority: P1. Sources: `src/components/mail/mail-page.tsx`, `thread.tsx`, `composer.tsx`, `src/lib/mail/rules.ts`.

Gap: the common first visit teaches folders/search before explaining recipients, shared-mail responsibility, held mail, and internal notes. Gate: private thread membership; shared mailbox role/assignment; effective outside-send permission; task and approval rules. Outside mail is real. Do not call it a simulation or promise recall after external delivery.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | تابع صندوق القسم، وأسند المحادثات وراجع البريد الذي ينتظر اعتمادك قبل خروجه. | E01, E02, E03, E06 | Identifies an external responsibility or held-mail decision. |
| مساعد مدير الاتصال المؤسسي | A/C | نسّق المحادثات الخارجية وراجع المحتجز، مع بقاء البريد الداخلي خاصاً بأطرافه. | E01, E02, E03, E06 | Distinguishes shared oversight from private internal mail. |
| كاتب المحتوى | A/C | تابع رسائلك وما أُسند إليك من بريد خارجي، وراجع مسار الاعتماد قبل الإرسال. | E01, E04, E05, E06 | Sends to the intended audience through the correct gate. |
| المصمم | A/C | شارك الملفات والملاحظات مع المقصودين، وميّز الرد الخارجي عن الملاحظة الداخلية. | E01, E04, E05, E06 | Chooses the correct reply audience. |
| المنتج الإعلامي | A/C | تابع المراسلات والمهام المرتبطة بالإنتاج، وأسند مهمة من موضعها حين يسمح دورك. | E01, E04, E05, E06 | Uses a task card and the proper correspondence path. |
| مسؤول النشر وإدارة الحسابات | A/C | ترى صندوق القسم المشترك وتتابع ما أُسند إليك والمواعيد، ضمن قاعدة الإرسال الخارجي. | E01, E02, E05, E06 | Avoids treating shared-mail visibility as unrestricted sending. |
| عضو | A/C | تراسل من تشاركهم المحادثة، وتتابع ما أُسند إليك دون الاطلاع على بريد الآخرين الخاص. | E01, E04, E05, E06 | Understands recipients and internal privacy. |
| Admin | T | تدير اختبار صندوق القسم والاعتمادات، ولا يفتح دور Admin بريد الأعضاء الداخلي الخاص. | E01, E02, E03, E06 | Tests shared-mail behavior without private-mail access. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| E01 | Mail/chat tabs and scope | البريد للرسمي والخارجي | البريد الداخلي خاص بأطرافه. الخارجي يخرج من صندوق القسم المشترك، والمراسلة اليومية في تبويب «المراسلة». |
| E02 | Shared mailbox and assignment | المحادثة الخارجية لها مسؤول | افتح المحادثة لتعرف حالتها ومسؤولها ووقت الرد. رؤية صندوق القسم لا تعني أن كل رد يخرج دون اعتماد. |
| E03 | Held-mail section | راجع قبل الإرسال الخارجي | البريد المحتجز ينتظر قرار المخوّل. «اعتماد وإرسال» يخرج الرسالة فعلياً ويحتاج ضغطاً مطولاً؛ راجع النص والمستلمين أولاً. |
| E04 | Personal and assigned threads | افتح ما يخصك | اختر رسالة داخلية تشارك فيها أو محادثة خارجية أُسندت إليك. بعض محتوى صندوق القسم لا يظهر لغير المعنيين به. |
| E05 | Composer and recipients | حدد المستلمين قبل الإرسال | راجع «إلى» والنسخ ونوع الرسالة. الخارجية الجديدة أو الرد غير المسند إليك قد ينتظر اعتماداً بحسب صلاحيتك. |
| E06 | Reply tabs and result | رد خارجي أم ملاحظة داخلية؟ | الملاحظة الداخلية لا تصل للجهة الخارجية. بعد الإرسال راجع الحالة؛ مهلة السحب المعروضة لا تعني استرجاع بريد خرج فعلاً. |

First-section tips:

- Attachments, «مرفق أو مرجع من المكتبة»: «راجع الملف والمستلمين قبل الإرسال. المرجع الذي يخرج من المكتبة إلى جهة خارجية يحتاج إصداره المعتمد.»
- Cards, «البطاقة تنفّذ إجراءً»: «اعتماد أو مهمة أو موعد داخل رسالة يخضع لقواعد المركز نفسها. قراءة البطاقة لا تعني الموافقة عليها.»
- Convert to work, «تحويل إلى عمل»: «يفتح الإجراء مسار إنشاء العمل أو ربطه وفق الخيارات المتاحة، ويبقى رابط المحادثة. راجع المطلوب قبل حفظ العمل.»
- Permission exception, «إرسال دون انتظار»: «من يملك «بريد خارجي دون انتظار الاعتماد» يتبع صلاحية الإرسال الفعلية. الاطلاع على الصندوق وحده لا يمنحها.»

Empty: «لا محادثات في هذا المجلد. راجع المجلد والبحث، أو ابدأ رسالة حين يكون الإرسال متاحاً لك.» Disconnected mailbox: explain that outside mail cannot complete normally until connection recovers; keep internal mail guidance separate.

Deeper help: privacy, recipients, shared responsibility, hold/return/queue/failure states, sending limits, withdrawal window, outside-send grants, and mail-to-work conversion.

## 18. المراسلة

Page key: `chat`. Route: `/mail/chat`. Priority: P1. Sources: `src/components/chat/chat-tab.tsx`, `urgency.tsx`, `whatsapp.tsx`, `src/lib/chat/rules.ts`.

Gap: the tour introduces conversation layout and creation, but importance, acknowledgement, cards, and membership need earlier explanations. Gate: room membership including Admin, channel posting rules, task assignment, message importance, and WhatsApp opt-in/push permission. A grant for announcement-channel creation can change the path of a non-leader; do not hide its applicable section guidance solely because of the role name.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | تابع محادثاتك، واستخدم درجات الرسائل والبطاقات بحسب أثرها ومن يشارك في المحادثة. | X01, X02, X03, X05 | Chooses an appropriate importance and audience. |
| مساعد مدير الاتصال المؤسسي | A/C | نسّق الفريق بالمحادثات والمهام، واستخدم «عاجل» حين يلزم إقرار الأعضاء. | X01, X02, X03, X05 | Understands urgent acknowledgement and task routing. |
| كاتب المحتوى | A/C | ناقش المحتوى وشارك مرجع العمل، ثم انقل ما يحتاج سجلاً رسمياً إلى البريد. | X01, X02, X04, X05 | Shares in the correct room and chooses a permitted importance. |
| المصمم | A/C | شارك المعاينات والملفات مع أعضاء المحادثة، واربط النقاش بالعمل المقصود. | X01, X02, X04, X05 | Uses the intended file/work card and audience. |
| المنتج الإعلامي | A/C | تابع الإنتاج وشارك مخرجاته، ويمكنك إسناد المهام من البطاقة المسموحة لك. | X01, X02, X06, X05 | Assigns a task only through an allowed action. |
| مسؤول النشر وإدارة الحسابات | A/C | تابع التنسيق والمواعيد في محادثاتك، وارجع إلى مكان النشر للإجراء الرسمي. | X01, X02, X04, X05 | Separates chat coordination from publishing execution. |
| عضو | A/C | تحدث في محادثاتك وشارك ما يلزم، وأقر باستلام الرسالة العاجلة حين تصل. | X01, X02, X04, X05 | Sends to the right room and acknowledges urgency. |
| Admin | A/C | المراسلة لا تفتح لك إلا الغرف التي أنت عضو فيها، حتى بصفة Admin. | X01, X02, X03, X05 | Understands that administration does not bypass room membership. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| X01 | Room list and members | من يرى هذه المحادثة؟ | المحادثة لأعضائها فقط، ومسؤول النظام كذلك. راجع الأعضاء قبل مشاركة معلومات أو ملفات. |
| X02 | Composer and attachment menu | اكتب أو أرفق مرجعاً | اكتب الرسالة أو اختر ملفاً أو بطاقة عمل. @ لذكر عضو، وقائمة الإرفاق تعرض ما يمكنك إضافته. |
| X03 | Importance picker | اختر درجة الرسالة بعناية | «للانتباه» تنبيه عادي، و«مهم» بصلاحية، و«عاجل» يصل رغم كتم المحادثة ويطلب الإقرار. لا تستخدمه للتذكير العادي. |
| X04 | Importance picker and acknowledgement | التنبيه غير الإقرار | يمكنك إرسال «للانتباه»، و«مهم» إن مُنحت. إذا وصلتك «عاجل» فاختر «أقرّ بالاستلام» بعد قراءتها. |
| X05 | Context and official-action links | تابع الإجراء من مرجعه | البطاقات تخضع لصلاحيات العمل والملف. ما يحتاج إجراءً رسمياً أو جهة خارجية يُتابع من العمل أو البريد. |
| X06 | Task card | إسناد مهمة من المحادثة | اختر المهمة وصاحبها وموعدها حين يتيح دورك الإسناد. الرسالة وحدها لا تُنشئ مهمة ما لم تحفظ بطاقتها. |

First-section tips:

- WhatsApp, «واتساب باختيار صاحبه»: «يصل إلى من ربط رقمه واختار درجته ضمن المحادثة، أو دُفعت إليه رسالة بصلاحية. الإرسال باتجاه واحد ولا يقرأ المركز الردود.»
- Permission request, «اطلب ما تحتاجه»: «من قائمة الإرفاق أو /صلاحية اختر الصلاحية والمدة والسبب. الطلب لا يمنحها فوراً، وبعض الصلاحيات لا تُطلب.»
- Poll, «التصويت ليس اعتماداً»: «نتيجة التصويت تعبّر عن المشاركين، ولا تحل محل اعتماد العمل أو الملف.»
- Channel posting, «قناة إعلانات»: «الكتابة في القناة لمشرفيها. العضوية وحدها لا تعطي الإرسال فيها، وإنشاء قناة يحتاج صلاحيته.»

Empty: «اختر محادثة أو ابدأ محادثة جديدة بما يتيحه حسابك. لا تظهر الغرف التي لست عضواً فيها.»

Deeper help: edits/deletions and their windows, room membership, channel moderation, urgent acknowledgement, muted rooms, WhatsApp delivery/push/privacy, and permission cards.

## 19. حسابات المنصات

Page key: `channels`. Route: `/channels`. Priority: P1. Sources: `src/components/work/channels.tsx`, `connect.tsx`, `src/lib/platforms/provider.ts`.

Gap: current help still calls all connections simulated and singles out YouTube in a registry-driven page. Gate: director, assistant, publisher, or Admin; page access through approvals where required; account-specific reconnect rules. Other roles do not obtain this page through a generic grant. App setup in settings differs from connecting an individual account here.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | أضف أو اربط الحساب وحدد من ينشر عليه. تجهيز تطبيق المنصة من «الإعدادات». | Z01, Z02, Z03, Z05 | Separates platform app setup from account connection. |
| مساعد مدير الاتصال المؤسسي | A/C | أدر الحسابات والناشرين عليها، وأعد ربط ما يحق لك. إعداد التطبيق يحتاج صلاحياته المستقلة. | Z01, Z02, Z03, Z05 | Manages an account without assuming secret-management rights. |
| كاتب المحتوى | R | لا يفتح دورك إدارة حسابات المنصات. راجع الحسابات المختارة لعملك من صفحة العمل. | B01, Z07, B03 | Uses a visible work instead of requesting an unsupported page grant. |
| المصمم | R | إدارة الحسابات ليست ضمن هذا الدور. راجع متطلبات المنصة والملف من العمل الذي يظهر لك. | B01, Z07, B03 | Finds platform requirements through a visible work. |
| المنتج الإعلامي | R | تابع حسابات النشر المطلوبة من تفاصيل العمل، ونسّق الربط مع من يديرها. | B01, Z07, B03 | Knows who handles account connection. |
| مسؤول النشر وإدارة الحسابات | A/C | راجع حساباتك وتفويضها، وأعد ربط ما يحق لك قبل الموعد. الإضافة وتعديل الحسابات للقادة. | Z01, Z02, Z04, Z05 | Reconnects an eligible account and checks its expiry. |
| عضو | R | لا يفتح دورك هذه الصفحة. تابع طلبك والحسابات الظاهرة فيه من صفحة العمل. | B01, Z07, B03 | Returns to the appropriate request. |
| Admin | T | اختبر إدارة الحسابات والربط. رمز الاتصال لا يُعرض، والنشر يبقى محاكاة. | Z01, Z02, Z03, Z05 | Tests connection state without treating it as real publishing. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| Z01 | Connection explanation | ربط حقيقي أو محاكى | «ربط حقيقي» يستخدم تسجيل دخول المنصة وفحصها، و«ربط محاكى» لا يتصل بها. النشر نفسه محاكاة في الحالتين. |
| Z02 | Account card | راجع الحساب وتفويضه | تحقق من المنصة واسم الحساب ومن ينشر عليه وحالة التفويض. اختيار منصة وحدها لا يحدد الحساب المقصود. |
| Z03 | Add/connect actions | أضف أو اربط الحساب المناسب | اختر الإجراء المتاح، واستعمل علامة «!» لخطوات المنصة. تجهيز التطبيق وبياناته من «الإعدادات» لمن يملك صلاحيتها. |
| Z04 | Publisher reconnect action | أعد الربط قبل انتهاء التفويض | افتح إعادة الربط للحساب المسموح لك، وأكمل تسجيل دخول المنصة. راجع الحالة والموعد بعد عودتك. |
| Z05 | Account mode and usage | الربط لا ينشر العمل | راجع طريقة النشر والأعمال التي تستخدم الحساب. تعديل اسم الحساب قد يعيد جزء الحسابات للاعتماد في تلك الأعمال. |
| Z06 | Manual-platform notice | لهذه المنصة مسار يدوي | لا تفترض وجود ربط تلقائي. افتح دليل «!» لمعرفة الحزمة والخطوات، مع بقاء نتائج النشر في المركز محاكاة. |
| Z07 | Visible work or safe return link | تابع الحساب من العمل | إذا كان العمل متاحاً لك فافتح تفاصيله لمعرفة الحساب المختار. يدير الحسابات القادة، ويتابع إعادة الربط مسؤول النشر ضمن صلاحياته. |

First-section tips:

- Manual platform: show Z06 only when a manual platform section opens. Do not add it to every role's initial tour.
- Disconnect, «قبل فصل الحساب»: «الفصل ينهي الاتصال والتفويض، وقد يمنع ما يعتمد عليه. راجع الأعمال المستخدمة والحالة قبل التأكيد.»
- Expiry, «تفويض الحساب وسر التطبيق»: «تجديد تفويض حساب ليس استبدال سر تطبيق المنصة. راجع السبب والدليل لمعرفة أيهما يحتاج المعالجة.»
- Disable/delete, «الحساب مستخدم»: «قد يُمنع الإيقاف أو الحذف لوجود عمل في المراجعة أو معتمد أو مجدول. راجع الأعمال المستخدمة بدل محاولة حذفها لتجاوز المنع.»

Empty: managers «لا حسابات لهذه المنصة بعد. استخدم الإضافة أو الربط المتاح، واقرأ دليل «!» قبل إعدادها.» Publisher «لا حسابات متاحة لك هنا. راجع من يدير الحسابات لإضافتك إلى الحساب المقصود.»

Deeper help: account versus platform, app versus token expiry, provider-specific setup, reconnect/disconnect, manual paths, exact account approval, and blocked deletion.

## 20. الأفكار

Page key: `ideas`. Route: `/ideas`. Priority: P2. Source: `src/components/ideas.tsx`.

Gap: current role copy suggests the publisher can gain creation merely through page access. Gate: ideas-page access and actual `canOpen` plus creation-role ability. The page is an unsaved scratch field. Admin cannot use the creation component as Admin even if its route guard allows entry.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | اكتب الفكرة ثم افتحها في «إنشاء» لتكمل العمل ومسؤوله وتحفظه. | D01, D02, D03 | Carries the idea to a saved work. |
| مساعد مدير الاتصال المؤسسي | A/C | جهّز عنوان الفكرة ووصفها، ثم أكمل نوع العمل والخطة من «إنشاء». | D01, D02, D03 | Understands where persistence actually happens. |
| كاتب المحتوى | A/C | دوّن الفكرة والنص الأولي، ثم افتحهما في «إنشاء» حين تكون الصفحة متاحة لك. | D01, D02, D03 | Preserves the idea by completing creation. |
| المصمم | A/C | اكتب اتجاه التصميم ومتطلباته، ثم أكمله عملاً من «إنشاء». | D01, D02, D03 | Moves a design idea into a proper brief. |
| المنتج الإعلامي | A/C | اكتب فكرة الإنتاج ومراجعها، ثم أكمل العمل وموعده من «إنشاء». | D01, D02, D03 | Creates the intended production brief. |
| مسؤول النشر وإدارة الحسابات | A/R | يمكنك تدوين فكرة هنا، لكن دورك لا ينشئ عملاً. انسخها إلى رسالة للفريق قبل المغادرة. | D01, D02, D04 | Avoids losing text or requesting an impossible creation grant. |
| عضو | A/C | اكتب ما تقترحه ثم افتحه في «إنشاء» لإكماله طلباً للقسم وحفظه هناك. | D01, D02, D03 | Saves the idea through the member request flow. |
| Admin | T/R | النص هنا غير محفوظ. لاختبار تحويله إلى عمل استخدم صفة تملك الإنشاء، مع حفظ النص قبل تغيير الصفة. | D01, D02, D05 | Preserves text before a role-view change. |

When a permitted creator has the creation page withheld, replace D03 with D06. Do not give the publisher that replacement as if requesting the page would make creation possible.

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| D01 | Unsaved note | احفظ فكرتك قبل المغادرة | هذه الصفحة لا تحفظ الأفكار. مغادرتها أو تحديثها قبل نقل النص وحفظه قد يضيعه. |
| D02 | Idea field | عنوان ثم تفاصيل | اكتب العنوان في السطر الأول، ثم التفاصيل تحته. راجع النص قبل فتحه في النموذج التالي. |
| D03 | Open-in-create action | أكمل الحفظ في «إنشاء» | الزر ينقل النص إلى النموذج ولا يحفظ عملاً وحده. أكمل الحقول ثم احفظ العمل، أو أرسل الطلب إذا كنت عضواً. |
| D04 | Existing field and mail/chat navigation | شاركها مع من ينشئ العمل | انسخ النص إلى البريد أو المراسلة وشاركه مع المقصود. لا تُحفظ الفكرة هنا، ومنح صفحة «إنشاء» لا يغيّر قدرة دورك. |
| D05 | Field and role selector | احفظ النص قبل الاختبار | انسخ النص أولاً، ثم اختر صفة تملك الإنشاء للاختبار. لا تفترض بقاء النص عند تغيير الصفة أو الصفحة. |
| D06 | Creation-access reason | الإنشاء غير مفتوح لحسابك | احفظ النص بنسخه، واطلب فتح الصفحة إن كان دورك يملك الإنشاء. يمكنك مشاركة الفكرة في رسالة إلى الفريق. |

First-section tip: clear action. Title: «مسح النص». Body: ««مسح» يفرغ هذا الحقل فقط. لا يحذف عملاً حفظته من قبل في «إنشاء».»

Empty: «اكتب الفكرة في الحقل. ستحتاج إلى حفظها من «إنشاء» أو مشاركتها في رسالة بحسب ما يتيحه دورك.»

Deeper help: unsaved state, title/body transfer, access denial, unavailable creation roles, and where saved work appears.

## 21. الحسابات

Page key: `accounts`. Route: `/accounts`. Priority: P1. Sources: `src/components/accounts/page.tsx`, `members.tsx`, `card.tsx`, `entry-help.tsx`, `roles.tsx`, `src/lib/permissions.ts`.

Gap: the first tour assumes everyone can add a member and does not teach invitation progress or the assistant's limits. Gate: `accounts.view`, then each operation's capability, actor/target rank, held capability, protected account, and self-edit rules. A rank-one role with page-view permission does not thereby gain management authority. Permission requests and access-to-the-hub requests are different types.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | أدر أعضاء من هم تحت رتبتك، وراجع مصدر الصلاحية وأثرها قبل منحها أو سحبها. | U01, U02, U03, U04 | Makes an appropriately scoped grant or entry action. |
| مساعد مدير الاتصال المؤسسي | A/C | تمنح أدوار الفريق ما تملكه أنت. الإضافة وتغيير الدور وإزالته تحتاج صلاحيات مستقلة. | U01, U02, U05, U04 | Understands the default grant scope and limits. |
| كاتب المحتوى | C | إن مُنحت فتح هذه الصفحة فاعرض ما يُتاح لك. فتحها لا يمنحك إدارة صلاحيات الأعضاء. | U01, U06, U07 | Uses an observation path without assuming management. |
| المصمم | C | الاطلاع هنا مشروط بفتح الصفحة لحسابك. صلاحياتك أنت ومصادرها في «الحساب». | U01, U06, U07 | Finds own permissions and avoids unavailable actions. |
| المنتج الإعلامي | C | إسناد مهام الإنتاج لا يعني إدارة الحسابات. راجع ما يُتاح لك هنا دون افتراض حق المنح. | U01, U06, U07 | Distinguishes task assignment from member management. |
| مسؤول النشر وإدارة الحسابات | C | إدارة حسابات المنصات تختلف عن حسابات الأشخاص. هذه الصفحة تحتاج فتحها وصلاحياتها المستقلة. | U01, U06, U07 | Distinguishes platform accounts from user accounts. |
| عضو | C | هذه الصفحة لا تُفتح لك افتراضياً. إن أُتيحت، فإجراءات الإدارة تبقى بصلاحياتها وقواعدها. | U01, U06, U07 | Understands conditional observation access. |
| Admin | A/C | أدر حسابات الأشخاص ودخولهم وصلاحياتهم، مع حماية المؤسسين ومنع تعديل صلاحياتك بنفسك. | U01, U02, U03, U04 | Handles entry and grants while preserving restrictions. |

For the five conditional observer rows, no page access means B01, B02, B03. Their introductions are shown only after access is established. Additional grants only select management cards when rank, target and operation checks also pass.

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| U01 | Tabs | الأشخاص والأدوار والطلبات | «الأعضاء» لبطاقات الأشخاص، و«الأدوار» لما يأتي من الدور، و«الطلبات» لما ينتظر، و«السجل» للتغييرات. |
| U02 | Person card and permission source | افتح الشخص وراجع المصدر | الصلاحية قد تأتي من الدور أو إضافة أو مدة أو استخدام واحد. راجع المصدر وما تتيحه قبل تغييرها. |
| U03 | Allowed management action | اختر الإجراء وأثره | امنح أو اسحب ما تملك ولمن تدير رتبته فقط. الإضافة وتغيير الدور والإزالة لها صلاحياتها، ولا تعدّل صلاحياتك بنفسك. |
| U04 | Grant preview and log | راجع ما سيستطيع فعله | قبل التأكيد اقرأ الصلاحية والهدف والمدة أو عدد المرات. يصل صاحبها إشعار بالتغيير، ويُحفظ في السجل. |
| U05 | Assistant grant and locked actions | حدود إدارة الفريق | يمكنك منح من هم تحت رتبتك ما تملكه أنت. فتح الصفحة لا يمنح الإضافة أو تغيير الدور أو الإزالة؛ راجع سبب كل إجراء مقفل. |
| U06 | Read-only scope and actual reason | الاطلاع غير الإدارة | ما يظهر لك يتبع صلاحياتك. لا يمكنك إدارة من في رتبتك أو فوقها، والاطلاع على الحساب لا يمنح حق تغييره. |
| U07 | Account navigation | صلاحياتك في «الحساب» | افتح «الحساب» من اسمك أسفل القائمة لترى مصدر صلاحياتك، واطلب منها ما يقبل الطلب وفق قواعد المركز. |

First-section tips:

- Entry progress, «ساعده على الدخول»: «راجع حالة دخول الشخص. أرسل الدعوة أو رابط التأكيد أو تعيين كلمة المرور بحسب حالته، حين يكون الإجراء متاحاً لك.»
- Invitation, «الدعوة لا تُكمل الدخول»: «إرسال الدعوة يبلّغ الشخص بالخطوة التالية. راجع حالته بعد ذلك؛ تكرار الدعوة لا يعني أنه دخل.»
- Grant mode, «دائمة أو مؤقتة أو مرة واحدة»: «اختر أقل مدة أو عدد استخدامات يفي بالغرض. الصفحة تُفتح دائماً أو مؤقتاً، ولا تُمنح لمرة واحدة.»
- Role templates, «التغيير يمس دوراً كاملاً»: «راجع عدد الأشخاص المتأثرين قبل تغيير صلاحية الدور. إضافة شخص بعينه وسحبها تختلف عن تعديل الدور كله.»
- Fixed rights, «مقفلة بقواعد المركز»: «الاعتماد والنشر ومنع الاعتماد الذاتي لا تتجاوزها المنح. لا تمنح حقاً لا تملكه أو لشخص لا تسمح رتبته به.»
- Phone privacy, «حالة الربط والرقم»: «حالة واتساب تظهر حيث يُسمح بها. الرقم نفسه يراه صاحبه ومسؤول النظام فقط.»

Empty: «لا أعضاء أو طلبات ظاهرة في هذا العرض. راجع التبويب والبحث وصلاحيتك.» Offer «إضافة عضو» only after its actual permission check.

Deeper help: entry lifecycle, access-request approval, grants and precedence, actor/target rank, one-use consumption, role templates, safe removal and reassignment, protected founders, and immutable permission history.

## 22. الحساب

Page key: `account`. Route: `/account`. Priority: P1. Sources: `src/components/supporting.tsx`, `profile-editor.tsx`, `my-permissions.tsx`, `appearance-panel.tsx`, `src/components/whatsapp/member.tsx`.

Gap: the current first visit names profile, permissions, and WhatsApp but needs clearer persistence and privacy boundaries. Gate: signed-in person's own profile, grants, and verified WhatsApp preferences. No person changes their own role or privileges here. Appearance persists in this browser; profile changes are shared through the system.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A | عدّل ملفك وراجع صلاحياتك هنا؛ إدارة صلاحيات غيرك من «الحسابات». | Y01, Y02, Y03, Y04 | Distinguishes own profile from member management. |
| مساعد مدير الاتصال المؤسسي | A | راجع ملفك ومصدر الصلاحيات ومددها، واطلب ما يقبل الطلب عند الحاجة. | Y01, Y02, Y03, Y04 | Finds an effective permission and its source. |
| كاتب المحتوى | A | اضبط اسمك وصورتك وتوقيع بريدك، وراجع ما تستطيع فعله الآن. | Y01, Y02, Y03, Y04 | Saves a profile/signature and understands permissions. |
| المصمم | A | عدّل ملفك الشخصي ومظهر هذا المتصفح، وراجع مصدر صلاحياتك. | Y01, Y02, Y03, Y04 | Distinguishes shared profile from browser appearance. |
| المنتج الإعلامي | A | حدّث ملفك وحالتك، وراجع صلاحياتك قبل الاعتماد على إجراء مؤقت. | Y01, Y02, Y03, Y04 | Understands expiring capabilities and presence. |
| مسؤول النشر وإدارة الحسابات | A | راجع ملفك وصلاحياتك وإعداد استلام واتساب. ربط حساب المنصة من «حسابات المنصات». | Y01, Y02, Y03, Y04 | Separates personal account from platform accounts. |
| عضو | A | هذه بياناتك وصلاحياتك. يمكنك تعديل الملف وطلب الصلاحيات المتاحة دون تغيير دورك بنفسك. | Y01, Y02, Y03, Y04 | Edits permitted fields and finds the request path. |
| Admin | A | هذه إعداداتك الشخصية. صلاحيات الإدارة والملفات الخاصة بالآخرين لا تُدار من ملفك. | Y01, Y02, Y03, Y04 | Separates own account settings from system management. |

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| Y01 | Profile editor | ملفك كما يراه زملاؤك | عدّل الاسم والصورة والعنوان والحالة والتوقيع، ثم احفظ التغيير. الدور والصفحات لا يتغيران من هذا المحرر. |
| Y02 | Appearance | مظهر هذا المتصفح | الوضع الفاتح أو الداكن يُحفظ في هذا المتصفح. لا يغيّر شكل المركز عند زملائك ولا إعدادات النظام العامة. |
| Y03 | Own permissions | اعرف مصدر صلاحيتك | راجع ما جاء من الدور وما أُضيف ومتى تنتهي المؤقتة أو استخدامات المرة الواحدة. لا تمنح نفسك صلاحية من هنا. |
| Y04 | WhatsApp overview | واتساب اختياري | ربط رقمك يحتاج رمز تحقق، وتختار درجات الرسائل واستقبال المدفوعة. المركز يرسل باتجاه واحد ولا يقرأ ردودك. |

First-section tips:

- Permission request, «اكتب الحاجة والمدة»: «اختر ما يقبل الطلب وحدد السبب والمدة. ظهور الطلب لا يعني الموافقة، ويصلك القرار بإشعار.»
- WhatsApp number, «من يرى رقمك؟»: «تراه أنت ومسؤول النظام فقط. زملاؤك يرون حالة الربط دون الرقم.»
- Verification, «تحقق من رقمك»: «أدخل الرمز الذي يصلك ضمن المهلة الظاهرة. راجع الرقم وحالة واتساب النظام قبل طلب رمز آخر.»
- Disable WhatsApp, «إيقاف الاستلام»: «الإيقاف يحذف رقمك من المركز ويوقف استلامه. إعادته تحتاج التحقق من الرقم من جديد.»
- Presence, «الحالة لا تفوّض عملك»: «تغيير الحالة يوضح توافرك. لا يسند أعمالك إلى غيرك ولا يفعّل تفويضاً أثناء الغياب.»

Empty permissions: «لا صلاحيات إضافية ظاهرة. ما يأتي من دورك وقواعد المركز يظل موضحاً في قائمته حين تُحمّل.» Use G02 on load failure instead of implying the person has no rights.

Deeper help: profile visibility and saving, browser appearance, permission sources and expiry, WhatsApp verification/consent/muting, one-way delivery, and session management.

## 23. الإعدادات

Page key: `settings`. Route: `/settings`. Priority: P1. Sources: `src/components/supporting.tsx`, `src/components/settings/*`, `src/components/feedback.tsx`, `src/components/whatsapp/system-panel.tsx`, `src/lib/setup-guides.ts`.

Gap: the page has eight substantial tabs but one broad tour. Current lead copy misses the director's installed connection/settings rights. Gate: page access plus separate capabilities for each tab/action. Director has settings view/manage, storage management, platform management, secrets, and system WhatsApp by default. Storage migration and backup run/restore are not the director's default grants. Assistant and other roles have no default settings access. Rank restrictions still apply to privileged grants; do not tell a rank-one role that requesting a management capability will necessarily be allowed.

| Role | Access | Proposed Arabic introduction | Cards in order | Success to validate |
|---|---|---|---|---|
| مدير الاتصال المؤسسي | A/C | من هنا تربط خدمات القسم وتدير مزودي التخزين. نقل الملفات والنسخ الاحتياطي يحتاجان حقوقهما المستقلة. | S01, S02, S03, S06 | Finds connection setup and understands additional rights. |
| مساعد مدير الاتصال المؤسسي | C | إن فُتحت لك الإعدادات، فاتبع القسم والصلاحية الممنوحين لك فقط. فتح الصفحة لا يفتح كل إجراءاتها. | S01, S05, S06 | Uses only actually granted settings actions. |
| كاتب المحتوى | C | إذا أُتيحت لك الصفحة فاطّلع على ما تسمح به صلاحيتك. إعداداتك الشخصية في «الحساب». | S01, S05, S06 | Distinguishes conditional view from management. |
| المصمم | C | قد تُتاح لك معلومات إعدادات محددة. ملفاتك في المكتبة، ومظهرك الشخصي في «الحساب». | S01, S05, S06 | Avoids entering unrelated system configuration. |
| المنتج الإعلامي | C | تجهيز الإنتاج لا يمنح إدارة التخزين تلقائياً. استخدم هنا ما أُتيح لك فعلاً. | S01, S05, S06 | Understands storage-management boundaries. |
| مسؤول النشر وإدارة الحسابات | C | ربط حساب نشر يختلف عن إعداد تطبيق المنصة. استخدم هنا فقط ما فُتح لحسابك من إعدادات. | S01, S05, S06 | Distinguishes account reconnection from app configuration. |
| عضو | C | لا تُفتح الإعدادات لدورك افتراضياً. إن أُتيحت فاطّلع على القسم المسموح، وإعداداتك الشخصية في «الحساب». | S01, S05, S06 | Uses observation/recovery without assumed management rights. |
| Admin | A/C | أدر صحة النظام واتصالاته والتخزين والنسخ بحسب الإجراء. الأسرار تُدخل ولا تُقرأ من الواجهة. | S01, S02, S04, S06 | Finds the correct management task and consequence. |

For all conditional rows, denied entry uses B01, B02, B03. If a page grant opens the frame but the first tab is denied, select S01, S05, S06 and the real denial reason, rather than pointing at an absent health panel. A new tab gets its own section guidance when opened.

| ID | Target | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| S01 | Settings tabs | اختر المهمة أولاً | «الاتصالات» للربط، و«التخزين» للملفات ومزوديها، و«النسخ الاحتياطي» للنسخ، و«المنصات» لقائمتها. بقية الأقسام للصحة وواتساب والملاحظات والسجل. |
| S02 | Health or connection overview | افحص الحالة قبل تغييرها | راجع الخدمة وآخر فحص والسبب الظاهر. الاتصال السليم لا يعني وجود نسخة احتياطية أو نشر حقيقي على المنصات. |
| S03 | Connections and setup guide | اتبع خطوات الربط | علامة «!» تشرح المتطلبات والخطوات والعناوين التي تنسخها. أدخل السر في حقله فقط؛ يحفظه المركز في الخزنة ولا يعرضه بعد ذلك. |
| S04 | Storage/backup task navigation | افصل النقل عن النسخ الاحتياطي | النقل يغيّر مكان خدمة الملفات بعد التحقق. النسخ الاحتياطي يحفظ نسخاً دون تغيير الأصل، ولكل منهما صلاحيته. |
| S05 | Actual permission reason | لكل إجراء صلاحية | فتح الصفحة لا يمنح تغيير خدماتها. اقرأ سبب الإجراء المقفل، واطلبه فقط إن سمحت قواعد دورك بطلبه. |
| S06 | Integration/settings log | راجع النتيجة في السجل | بعد الإجراء راجع الحالة والنتيجة المسجّلة. لا ترسل سراً في ملاحظة أو رسالة، ولا تفترض أن مؤقتاً سيكمل العمل عنك. |

First-section tips for every settings tab:

| ID | Tab/target and condition | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| ST01 | عام وصحة النظام; view permitted | افهم حالة الخدمة | «متصل» و«يحتاج ربطاً من جديد» و«موقوف» حالات مختلفة. افتح سبب الحالة أو افحص الخدمة بالإجراء المتاح. |
| ST02 | General settings edit | تغيير يؤثر في المركز | شريط الصيانة وحد الرفع إعدادات عامة. راجع القيمة والأثر قبل الحفظ؛ مظهرك الشخصي ليس هنا. |
| ST03 | الاتصالات; mailbox configuration permitted | صندوق بريد القسم حقيقي | بيانات Gmail تخدم البريد الخارجي. اقرأ دليل «!» ثم افحص واحفظ؛ تغييرها قد يؤثر في إرسال القسم واستقباله. |
| ST04 | Google app card | تطبيق واحد وربطان مختلفان | تطبيق Google يخدم إعداد Drive ويوتيوب. إعداد التطبيق لا يربط كل حساب وحده؛ أكمل خطوة ربط الخدمة المطلوبة. |
| ST05 | Microsoft/OneDrive card | التطبيق ثم حساب OneDrive | اقرأ دليل التطبيق، ثم اربط الحساب من Microsoft. راجع انتهاء سر التطبيق؛ ربط الحساب لا يحوّل إليه الرفع الجديد تلقائياً. |
| ST06 | Secret replacement/expiry | استبدل السر قبل انتهائه | راجع تاريخ الانتهاء إن كان مطلوباً. يدخل السر الجديد في حقله ويُفحص قبل الاستبدال؛ لا تعتمد على عرضه مرة أخرى. |
| ST07 | التخزين; provider actions permitted | مزود التخزين ومكان الملفات | راجع ما يحفظه كل مزود وحالة نسخه. «تحقق من عينة» يفحص ملفات محددة، ولا ينشئ نسخة احتياطية. |
| ST08 | Move plan; migration permitted | احسب الخطة قبل النقل | راجع المصدر والهدف وما سيُنقل وما سيُتخطى وسببه. حساب الخطة لا يبدأ النسخ؛ راجعها قبل «ابدأ النقل». |
| ST09 | Active move | أبق الصفحة مفتوحة للتنفيذ | النقل يعمل على دفعات من الصفحة المفتوحة، وحالته محفوظة. الإيقاف المؤقت والاستئناف يتابعان من موضع التوقف. |
| ST10 | Retire source; migration permitted | المصدر المحفوظ له إجراء مستقل | تحويل الخدمة إلى النسخة الجديدة لا يحذف المصدر. إحالته إلى التقاعد إجراء منفصل بعد مدة الاحتفاظ. |
| ST11 | النسخ الاحتياطي; run permitted | ابدأ النسخ يدوياً | اختر مزود النسخ والنوع، ثم شغّل الإجراء المتاح. لا يوجد تشغيل مجدول؛ الرفع الجديد إلى المكتبة ليس نسخة احتياطية. |
| ST12 | Backup verification | النسخة تحتاج تحققاً | «تحقق من النسخة» يعيد القراءة والمقارنة. وجود ملف أو نجاح تصديره وحده لا يجعل النسخة متحققاً منها. |
| ST13 | File restore; restore permitted | استعادة ملف محدد | راجع الملف ونسخته المتحقق منها قبل الاستعادة. استعادة قاعدة البيانات ليست زراً في الموقع. |
| ST14 | المنصات; manage permitted | القائمة غير حساب المنصة | إضافة منصة هنا تجعلها جزءاً من قائمة المركز. بعدها تُضاف الحسابات من «حسابات المنصات»، والنشر يبقى محاكاة. |
| ST15 | Platform readiness tracker | التجهيز سجل متابعة | حالة «التجهيز» توضح ما أُنجز خارج الموقع. تغييرها لا ينشئ اتصالاً ولا يفعل النشر الحقيقي. |
| ST16 | واتساب النظام; manage permitted | الجسر يحتاج جهازاً متصلاً | جهاز الجسر يسأل المركز عمّا ينتظر. راجع حالته قبل الاختبار؛ الموقع لا يقرأ ردود واتساب ولا ينشئ مؤقت إرسال خلفياً. |
| ST17 | Bridge-key generation | المفتاح يظهر مرة واحدة | احفظ المفتاح في إعداد الجهاز المقصود. إنشاء مفتاح جديد يحتاج تحديث الجسر القائم؛ لا تنشره في المراسلات أو الملاحظات. |
| ST18 | ملاحظات وأخطاء; view permitted | تابع ما أرسله المستخدمون | هنا الملاحظات وأخطاء الصفحات الظاهرة لك. تغيير الحالة إلى «اطّلعت» أو «عولج» يحتاج صلاحية التعديل. |
| ST19 | السجل; view permitted | الأثر مسجّل دون السر | السجل يوضح من فعل ماذا ومتى ونتيجته، دون قيمة السر. لا يُعدّل الحدث لإخفاء الخطأ؛ تُصحح الحالة بإجراء جديد. |

Empty: «لا خدمات أو نسخ ظاهرة في هذا القسم. راجع صلاحيتك وحالة التحميل قبل بدء إعداد جديد.» Use type-specific states such as no backup, no second provider, and no connection only after the relevant data loads. Never tell a restricted observer to create a connection as the sole recovery action.

Deeper help: provider-specific setup guides, prerequisites and exact rights, secret renewal, app/token expiry, file serving and migration, resumable execution, recoverable source retirement, incremental backups, verification/restore, WhatsApp bridge operations, and feedback triage.

## Shared first-use guidance outside the 23 page tours

These are section tips for the common shell and entry/recovery flows. They are not additional page entries in the 23-page count. They must not replay as a global onboarding sequence on every route.

| ID | Audience and trigger | Proposed Arabic title | Proposed Arabic body |
|---|---|---|---|
| SH01 | Every role; first open of sidebar/account navigation | صفحاتك وحسابك | القائمة تعرض ما يمكنك فتحه. افتح اسمك أسفلها للوصول إلى ملفك وصلاحياتك ومظهرك الشخصي. |
| SH02 | Every role; first help use | المساعدة بثلاثة مستويات | إرشاد قصير عند أول زيارة، وشرح للعناصر من زر المساعدة، ودليل كامل للصفحة مع إعادة الإرشاد عند الحاجة. |
| SH03 | Every role; first notification drawer open | الإشعار يفتح موضع الإجراء | «قرارك» يحتاج تصرفك، و«انتباه» يخص عملك، و«للعلم» تحديث. القراءة لا تعتمد العمل ولا تُنجزه. |
| SH04 | Every role; first available undo offer | ما الذي يمكن التراجع عنه؟ | هذا التراجع لتعديلات المكتبة المسموحة خلال ساعة. لا يعيد قرار اعتماد أو نشراً أو إرسال بريد خارجي. |
| SH05 | Every role; first long-press control | إجراء يحتاج ضغطاً مطولاً | راجع أثر الإجراء، ثم أبق الزر مضغوطاً حتى يكتمل التأكيد. النقرة القصيرة تشرح السبب ولا تنفذ الإجراء. |
| SH06 | Every role; first feedback dialog | أرسل ملاحظة واضحة | اكتب ما حدث وما توقعت حدوثه. تصل الملاحظة مع اسمك والصفحة إلى من يحق له متابعتها؛ لا تكتب فيها سراً أو كلمة مرور. |
| SH07 | Admin only; role selector | عرض بصفة للاختبار | اختر دوراً لترى أدواته. هذا الاختيار لا يحوّلك إلى شخص آخر ولا يفتح محادثاته أو بريده الداخلي. |
| SH08 | Every role; first permission explanation | الصفحة والإجراء شيئان مختلفان | قد تستطيع فتح الصفحة دون تنفيذ كل ما فيها. السبب بجانب الإجراء يوضح ما تحتاجه وهل يمكن طلبه. |
| EN01 | Invited person; password setup | أكمل الدخول من أحدث رسالة | افتح أحدث دعوة أو رابط تأكيد وصل إلى بريدك، ثم أكمل الخطوات الظاهرة. إن انتهت صلاحيته فاطلب الرابط الجديد المتاح. |
| EN02 | Every role; expired sign-in link | انتهت صلاحية الرابط | استخدم إجراء إرسال رابط جديد المناسب لهذه الشاشة، ثم افتح أحدث رسالة فقط. لا ترسل كلمة مرورك إلى أحد. |
| EN03 | Every role; pending access request | طلب الوصول ينتظر القرار | تقديم الطلب لا يفتح المركز فوراً. تابع الرسالة التي تصلك بالنتيجة، وأكمل خطوات الدخول بعد الموافقة. |
| EX01 | External review-link visitor; valid link | ملف متاح للمراجعة بالرابط | هذا الرابط يعرض الملف المسموح به فقط حتى انتهاء مدته أو إلغائه. لا يفتح بقية مكتبة المركز. |
| EX02 | External review-link visitor; invalid link | الرابط غير متاح الآن | قد يكون الرابط منتهياً أو ملغى أو غير صالح. اطلب رابطاً جديداً من الشخص الذي شاركه معك. |

Before implementation, match entry cards to the specific screen and available recovery action. Do not imply that an email address exists or is approved. External visitors do not receive internal navigation, account details, or an approval action unless the existing external-review feature actually supplies one.

## Content deferred to levels 2 and 3

Keep these details available without lengthening every first visit:

| Topic | Level 2 at the control | Level 3 procedure |
|---|---|---|
| Approval | Exact part/version, decision effect, self-approval reason. | Partial versus whole-package policy, cycles, correction and resubmission. |
| Publishing | Eligible accounts, approved time, simulated result, confirmation requirement. | Scheduling, expiry/reconnection, manual packs, failed-account retry. |
| Files | New file versus version, actual folder level, lock, provider-specific consequence. | Version lifecycle, review links, trash/recovery, access and migration. |
| Planning | Date type, who can change it, request effect and dependencies. | Extension propagation, final due date, cancellation and approval of date moves. |
| Mail and chat | Real recipient audience, privacy, send/hold effect, importance and acknowledgement. | Outside-mail policy, cards, membership, delivery failures and WhatsApp preferences. |
| Permissions | Current source, restriction, eligible requester and decision owner. | Standing/timed/one-use grants, overrides, rank, scope, templates and audit. |
| Integrations | Connection versus app setup, real state, secret replacement effect. | Existing service-specific setup guides, expiry and reconnection recovery. |
| Backups and moves | Plan/run/verify/retire distinction and required permission. | Manual execution, resumption, verification, incremental copies and limited restoration. |

The page guide should start with the reader's own role and applicable tasks. Other roles remain available as an expandable explanation. Prefer named procedures over a long list of sections alone. Do not duplicate external setup instructions already maintained in `src/lib/setup-guides.ts`.

## Corrections to make before implementing these proposals

This is a correction queue, not a claim that the application has been changed.

| Priority | Current content issue | Required resolution |
|---|---|---|
| P1 | Help collapses director, assistant, and Admin into one group, and all three specialists into another. | Select exact-role introductions and applicable card sequences; retain shared wording where the task is actually the same. |
| P1 | Member creation tour describes production-plan/draft controls. | Use C01, C05, C06, C07 for the request path. |
| P1 | Publisher and Admin creation wording conflicts with the component's role guard. | Use the restricted or role-test paths specified in sections 04 and 20; do not propose an unsupported grant. |
| P1 | Platform help says all connections are simulated. | Distinguish real connection, simulated connection, real expiry/health checks, and simulated publishing. |
| P1 | Settings help omits the director's installed rights. | Explain the installed defaults and the separate migration/backup rights. Preserve the assistant's narrower default access. |
| P1 | Library help assumes every existing file is in Drive and every deletion uses Drive's trash. | Name the actual serving provider where needed. Keep the current Drive destination of new uploads explicit. |
| P1 | Page completion and hidden targets can suppress later relevant instruction. | Track dismissed versus completed guidance; offer newly applicable role/grant/section help without restarting everything. |
| P1 | Tasks help claims broader source unification than the current component demonstrates. | Describe current collection truth. Confirm provider and planning-task parity before promising all tasks in one page. |
| P2 | Settings has eight tabs but a broad first tour only. | Use tab-specific tips ST01 to ST19 with actual permissions and visible targets. |
| P2 | The page guide gives everyone all grouped roles and section prose. | Put the person's applicable task procedures first, with shared rules and other roles available afterward. |
| P2 | First visits do not explain the local export-to-library handoff. | Use M03 and M04 and the existing export format text. |
| P2 | Entry support and external review links sit outside the registry's page tours. | Review the EN and EX cards against those actual screens without inventing extra internal access. |

## Implementation order and review gates

1. Review the content and policy truth in this file. Resolve contradictions before copying text into the help registry. No application, permission, or schema change is authorized by this draft.
2. Pilot sections 04, 03, 06, and 05 as one request/create-to-publishing journey. Include a member request, three specialist contributions, leadership review, publishing, and Admin test behavior.
3. Add access, state, and section-aware selection to the existing guide structure as needed. Current `RoleGroup` and the guide host expose only four groups; this document requires exact-role and effective-action context. Reuse current permission and work-rule results rather than introducing a separate authority model in help.
4. Apply the selected pattern to media, planning, correspondence, personal settings, administration, and system settings. Keep the explicit eight-role coverage for every page.
5. Validate meaningful tasks with real role accounts and permitted test records. Do not substitute Admin's «عرض بصفة» for all account, row-visibility, and privacy checks.
6. Save rerunnable browser checks and JSON evidence under `qa/` when implementation changes rendered output. Run the repository-required typecheck, build, and tests for that implementation session. Record actual results and unresolved limitations in the project records then.

For content review, check the exact role name, primary task, permission prerequisite, ordered cards, handoff, blocked path, empty/error wording, and source rule. The reviewer should be able to resolve every proposed title and body from the local card IDs without inventing copy.

## Acceptance matrix for the later implementation

| Case | Required result |
|---|---|
| 23 pages multiplied by eight roles | Each of the 184 rows selects an allowed tour, observation path, conditional path, or explicit restricted explanation. An unavailable role never receives an action tour. |
| Exact roles | Director and assistant differ in administration/settings guidance. Writer, designer, and producer get their actual contribution. Admin's testing exception is stated separately. |
| Custom permissions | Withdrawn access, standing grants, timed grants, one-use grants, rank restrictions, and action scope produce the correct explanation at the moment of use. |
| Record responsibility | Work owner, stage owner, participant, uploader, sender, folder level, room member, and account publisher checks remain decisive. |
| Lifecycle state | Draft, production, review, requested changes, approved, scheduled, partial/failed result, and closed work do not share an inappropriate next action. |
| Self-approval | Sender/uploader restrictions are explained and remain enforced for leaders and Admin. |
| Page states | Loading is not empty. Filtered is not denied. Failed load does not mark learning complete. Missing content does not reveal protected details. |
| First visit and return | Three or four main cards, later section tips, replay, dismissal, newly relevant role/grant guidance, and meaningful update notices work without repeated global interruption. |
| Tabs and dialogs | A later tab gets its own applicable tip. Hidden targets are not silently counted as learned. Guidance never saves or sends while moving between steps. |
| Keyboard, touch and Arabic | Controls remain reachable, targets visible, wording readable in RTL, and help placement avoids covering the action or its open dialog. Long press retains its existing keyboard support. |
| Real versus simulated | Mail and genuine connections are described accurately. Platform publishing results are explicitly simulated. |
| User understanding | Without coaching, the person finds the next action, states its consequence, completes the permitted task, and recovers from a representative blocker. Advancing a guide alone is not proof of understanding. |

## Source basis and verification limits

Source of product and permission truth:

- `AGENTS.md`, `MVP_draft.md`, `Reference_Build_Plan.md`, and dated owner decisions in `progress.md`.
- `reference/comms-hub-reference-v5.html`, with later owner-approved changes taking precedence where recorded.
- `disscussios/organizational_role_discussion.md` for separation of organizational responsibility, resource access, and system authority. Historical possibilities there are not treated as already built.
- `disscussios/approval_policy_design.md` for version-bound decisions and separation of approval from publishing.
- `disscussios/notification_model.md` for attention tiers and action versus information.
- `src/lib/access.ts`, `src/lib/access-matrix.ts`, `src/lib/permissions.ts`, `src/lib/domain.ts`, and corresponding migrations for current access and role rules.
- `src/lib/help/types.ts`, `registry.ts`, `pages.ts`, `src/lib/kit/guide.ts`, and `src/components/kit.tsx` for current guidance and progress behavior.
- The component and rule sources named on each page, plus the maintained setup guides and existing QA artifacts.

This document was checked structurally for 23 distinct registered page keys, eight exact role rows per page, and resolvable three/four-card sequences. That check is document validation only. It does not establish that a proposed target is visible for every state or that users understand the copy.

No application code, permissions, database, live account, existing guide, or existing project document was edited to produce this proposal. No application build, test suite, signed-in browser walkthrough, live email, connection, approval, grant, publishing simulation, migration, backup, or file move was run as part of writing it. Those checks belong to a later authorized implementation and validation session.

## Implementation record (2026-10-19)

Implemented: the first-visit guide and the page guide, for all 23 pages and all eight exact roles.

- `src/lib/help/roles.ts` holds the cards (title, body, selector) and the role-by-role table (access note, introduction, card order), generated from this file. `tests/help-roles.test.mjs` reads this file and fails if the two differ, if a row has fewer than three or more than four cards, or if a selector names a class or `data-gd` anchor that the page's components do not contain.
- `src/lib/kit/guide.ts`: the first-visit tour shows the cards written for the exact role being viewed (a director and an assistant, or a writer, a designer and a producer, no longer share one list), with the role's introduction under the first card; a card without a selector (the restricted-state cards) is shown as a plain card; the page guide opens with «ما يخصك بصفتك …». A page or role without an entry keeps the older group steps, and «what is new» notices are unchanged.
- Two anchors were added on Home (`data-gd="focus"` and `data-gd="upcoming"`). Everything else points at markup that already existed, so several cards of one page share an anchor (for example the four tab cards of «العمل» all point at the tab row).
- Wording changes made while implementing: Y02 now speaks only of the mode (the design choice was removed on 2026-10-19), A04 uses the status «بحاجة إلى تعديل», and five of the longest cards were shortened (I02, I06, M04, ST10, S04).

Not implemented, and still proposals in this file: the first-section tips of each page, the role-specific empty-state texts, the settings tab tips ST01 to ST19, the shared shell, entry and external-link cards (SH, EN, EX), the conditional replacement cards that need a runtime check of the person's actual grant (L07, Z06, D06 and G01 to G06), dismissed-versus-completed tracking, and levels 2 and 3. The section "Corrections to make before implementing" above is therefore only partly closed: its first two P1 rows (exact roles, the member creation path) are done.
