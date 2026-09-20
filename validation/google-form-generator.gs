/**
 * Comms Hub - Department Validation Google Form Generator
 * 
 * هذا السكريبت يقوم بإنشاء استمارة Google Form متكاملة لجلسات التحقق (Checkpoint 0.2)
 * مع التفرع التلقائي للأقسام بناءً على دور المشارك، وتضمين كافة المهام ومحاور التقييم.
 * 
 * طريقة الاستخدام:
 * 1. افتح https://script.google.com في المتصفح.
 * 2. أنشئ مشروعاً جديداً (New project).
 * 3. احذف الكود الافتراضي، وانسخ هذا الملف كاملاً والصقه هناك.
 * 4. (اختياري) إذا رفعت لقطات الشاشة من qa/artifacts/ إلى مجلد في Google Drive،
 *    ضع معرف المجلد (Folder ID) في المتغير DRIVE_FOLDER_ID أدناه.
 * 5. اضغط زر "Run" لتشغيل الدالة buildValidationForm.
 * 6. وافق على الصلاحيات المطلوبة لحسابك في Google.
 * 7. بعد انتهاء التنفيذ، ستظهر لك روابط الاستمارة (رابط التحرير ورابط المشاركة) في شاشة السجل (Execution log).
 */

// ضع معرف مجلد Google Drive هنا إذا قمت برفع لقطات الشاشة إليه (اختياري)
var DRIVE_FOLDER_ID = "";

function buildValidationForm() {
  var formTitle = "استمارة التحقق من سير العمل — مركز الاتصال المؤسسي";
  var form = FormApp.create(formTitle);

  form.setTitle(formTitle);
  form.setDescription(
    "استمارة مخصصة لجمع آراء وتقييمات منسوبي قسم الاتصال المؤسسي أثناء تجربة النموذج الأولي عبر الشبكة المحلية.\n\n" +
    "تنبيهات هامة للمشارك:\n" +
    "1. هذا اختبار لنموذج الواجهات والمسارات البرمجية، ولسنا نختبر أداءك الشخصي.\n" +
    "2. لا يوجد نشر فعلي ولا تخزين دائم؛ إعادة تحديث الصفحة تعيد النظام لحالته الأولى.\n" +
    "3. نرجو التفكير بصوت عالٍ وملاحظة ما تتوقع حدوثه قبل الضغط على أي عنصر.\n" +
    "4. رابط فتح النموذج الأولي على الشبكة المحلية: http://<IP-ADDRESS>:3000\n" +
    "5. يُرجى التوجه لصفحة الحساب والضغط على «إعادة النموذج إلى حالته الأولى» واختيار دورك من «عرض بصفة» قبل البدء."
  );

  // السماح بتعديل الإجابات وعدم حصرها ببريد محدد إلا إذا رغب المستخدم
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(true);

  // -------------------------------------------------------------
  // القسم 1: بيانات المشارك والدور (القسم الافتراضي الأول)
  // -------------------------------------------------------------
  form.addTextItem()
    .setTitle("الاسم أو المعرف (اختياري)")
    .setHelpText("يمكنك ترك الحقل فارغاً للمحافظة على السرية التامة للبيانات.")
    .setRequired(false);

  var roleItem = form.addMultipleChoiceItem()
    .setTitle("ما هو دورك في القسم؟")
    .setHelpText("سيتم توجيهك تلقائياً إلى مهام السيناريو المخصصة لدورك.")
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle("عدد سنوات العمل في القسم:")
    .setChoiceValues([
      "أقل من سنة",
      "من 1 إلى 3 سنوات",
      "أكثر من 3 سنوات"
    ])
    .setRequired(true);

  form.addMultipleChoiceItem()
    .setTitle("نوع الجهاز المستخدم في تجربة النموذج:")
    .setChoiceValues([
      "حاسب مكتبي أو محمول (شاشة عريضة)",
      "هاتف ذكي (جوال)"
    ])
    .setRequired(true);

  // إنشاء الأقسام التفرعية لجميع الأدوار
  var secDirector = form.addPageBreakItem().setTitle("القسم 2: سيناريو مدير الاتصال المؤسسي");
  var secAssistant = form.addPageBreakItem().setTitle("القسم 3: سيناريو مساعد مدير الاتصال المؤسسي");
  var secWriter = form.addPageBreakItem().setTitle("القسم 4: سيناريو كاتب المحتوى");
  var secDesigner = form.addPageBreakItem().setTitle("القسم 5: سيناريو المصمم");
  var secProducer = form.addPageBreakItem().setTitle("القسم 6: سيناريو المنتج الإعلامي");
  var secPublisher = form.addPageBreakItem().setTitle("القسم 7: سيناريو مسؤول النشر وإدارة الحسابات");
  var secMember = form.addPageBreakItem().setTitle("القسم 8: سيناريو عضو القسم ومسؤول النظام");
  var secCommon = form.addPageBreakItem().setTitle("القسم 9: التقييم العام للمحاور الخمسة والملاحظات الختامية");

  // ربط خيارات الدور بالتفرع إلى الصفحة المناسبة
  roleItem.setChoices([
    roleItem.createChoice("مدير الاتصال المؤسسي", secDirector),
    roleItem.createChoice("مساعد مدير الاتصال المؤسسي", secAssistant),
    roleItem.createChoice("كاتب المحتوى", secWriter),
    roleItem.createChoice("المصمم", secDesigner),
    roleItem.createChoice("المنتج الإعلامي", secProducer),
    roleItem.createChoice("مسؤول النشر وإدارة الحسابات", secPublisher),
    roleItem.createChoice("عضو بالقسم أو مسؤول النظام", secMember)
  ]);

  // توجيه نهاية كل قسم دور إلى القسم الختامي المشترك (القسم 9)
  secDirector.setGoToPage(secCommon);
  secAssistant.setGoToPage(secCommon);
  secWriter.setGoToPage(secCommon);
  secDesigner.setGoToPage(secCommon);
  secProducer.setGoToPage(secCommon);
  secPublisher.setGoToPage(secCommon);
  secMember.setGoToPage(secCommon);
  secCommon.setGoToPage(FormApp.PageNavigationType.SUBMIT);

  // -------------------------------------------------------------
  // بناء مهام وأسئلة كل قسم
  // -------------------------------------------------------------

  // 1. القسم 2: مدير الاتصال المؤسسي
  populateDirectorSection(form);

  // 2. القسم 3: مساعد مدير الاتصال المؤسسي
  populateAssistantSection(form);

  // 3. القسم 4: كاتب المحتوى
  populateWriterSection(form);

  // 4. القسم 5: المصمم
  populateDesignerSection(form);

  // 5. القسم 6: المنتج الإعلامي
  populateProducerSection(form);

  // 6. القسم 7: مسؤول النشر وإدارة الحسابات
  populatePublisherSection(form);

  // 7. القسم 8: عضو القسم ومسؤول النظام
  populateMemberSection(form);

  // 8. القسم 9: التقييم العام للمحاور الخمسة
  populateCommonExitSection(form);

  Logger.log("تم إنشاء النموذج بنجاح!");
  Logger.log("رابط تحرير النموذج (Edit URL): " + form.getEditUrl());
  Logger.log("رابط إرسال النموذج للمشاركين (Published URL): " + form.getPublishedUrl());
}

// -----------------------------------------------------------------------------
// دوال مساعدة لإنشاء عناصر المهام
// -----------------------------------------------------------------------------

function addTaskBlock(form, taskNum, title, instruction, targetScreen, screenshotFilename) {
  var headerText = "المهمة " + taskNum + ": " + title;
  var details = "المطلوب منك تنفيذه في النموذج:\n" + instruction + "\n\n" +
                "الشاشة المستهدفة: " + targetScreen + "\n" +
                "ملف لقطة الشاشة المرجعي: " + screenshotFilename;

  form.addSectionHeaderItem()
    .setTitle(headerText)
    .setHelpText(details);

  // محاولة إضافة الصورة من مجلد Drive إن وجد
  attachDriveImageIfAvailable(form, screenshotFilename);

  var outcome = form.addMultipleChoiceItem()
    .setTitle("نتيجة إنجاز المهمة " + taskNum + ":")
    .setChoiceValues([
      "أنجزتها بمفردي وبسلاسة دون مساعدة",
      "أنجزتها بعد بحث أو توجيه خارجي",
      "لم أتمكن من إكمال المهمة"
    ])
    .setRequired(true);

  var exp = form.addMultipleChoiceItem()
    .setTitle("مطابقة ما حدث مع توقعك في المهمة " + taskNum + ":")
    .setChoiceValues([
      "النتيجة طابقت توقعاتي تماماً",
      "النتيجة اختلفت عما كنت أتوقعه"
    ])
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("ملاحظاتك ومواضع الصعوبة أو الغموض في المهمة " + taskNum + ":")
    .setHelpText("صف ما حدث معك، أو ما الذي كنت تتوقع أن تراه.")
    .setRequired(false);
}

function attachDriveImageIfAvailable(form, filename) {
  if (!DRIVE_FOLDER_ID || DRIVE_FOLDER_ID.trim() === "") {
    return;
  }
  try {
    var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var files = folder.getFilesByName(filename);
    if (files.hasNext()) {
      var file = files.next();
      form.addImageItem()
        .setImage(file.getBlob())
        .setTitle("معاينة الشاشة: " + filename);
    }
  } catch (e) {
    Logger.log("تعذر تحميل الصورة " + filename + ": " + e.message);
  }
}

// -----------------------------------------------------------------------------
// تفاصيل مهام الأدوار والأسئلة الهيكلية
// -----------------------------------------------------------------------------

function populateDirectorSection(form) {
  addTaskBlock(form, 1, "قراءة الشاشة الرئيسية",
    "انظر إلى الشاشة الرئيسية دون أن تضغط شيئاً. ما الذي يخبرك به هذا اليوم؟ وما أول إجراء ستتخذه؟",
    "الصفحة الرئيسية (/)", "c02-home-desktop.png");

  addTaskBlock(form, 2, "فتح عمل بانتظار الاعتماد",
    "هناك عمل معروض يحتاج قرارك النهائي. افتحه واطّلع على كامل تفاصيله.",
    "صفحة الموافقات (/approvals)", "acceptance-approvals-1440.png");

  addTaskBlock(form, 3, "فحص عناصر الحزمة المعتمدة",
    "قبل اتخاذ القرار: ما الذي تعتمده بالضبط في هذه اللحظة؟ افحص النص، إصدار الوسائط، والقنوات.",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 4, "طلب تعديل مع ذكر السبب",
    "اطلب تعديلاً على هذا العمل، واذكر السبب والملاحظة للكاتب.",
    "صفحة الموافقات (/approvals)", "acceptance-approvals-1440.png");

  addTaskBlock(form, 5, "اعتماد النسخة المعدلة",
    "افترض أن الكاتب عدّل النص وأعاد الإرسال. اعتمد النسخة الجديدة ولاحظ رقم الإصدار.",
    "صفحة الموافقات (/approvals)", "acceptance-approvals-1440.png");

  addTaskBlock(form, 6, "التحقق من إلغاء الاعتماد عند التعديل",
    "عمل تم اعتماده سابقاً ثم عُدّل نصه. ما حالته الآن في رأيك، وماذا تتوقع للاعتماد السابق؟",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 7, "إنشاء حملة وعمل تابع لها",
    "أنشئ حملة جديدة، ثم أنشئ عملاً ضمنها وأسنده لدور معين.",
    "صفحة إنشاء عمل (/create)", "acceptance-create-1440.png");

  form.addSectionHeaderItem().setTitle("أسئلة هيكلية خاصة بمدير الاتصال المؤسسي:");

  form.addParagraphTextItem()
    .setTitle("مَن في القسم يملك اعتماد هذا النوع من المحتوى فعلياً؟ وهل يختلف باختلاف حساسية المحتوى؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("إذا تغيّر التصميم فقط ولم يتغير النص، هل يحتاج اعتماداً جديداً كاملاً؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل يحدث أن تعدّل النص بنفسك بدل أن تطلب التعديل من الكاتب؟ وماذا يعني ذلك لنسب العمل؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("في حال سفرك أو إجازتك وهناك منشور مرتبط بموعد، كيف يُعتمد اليوم؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("إذا نُشر شيء ثم تبيّن وجود خطأ فيه، ماذا يحدث عملياً ومَن يقرر الإجراء؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل هناك حالات طارئة تتطلب النشر خلال ساعة؟ وما الإجراء الذي يحكمها؟")
    .setRequired(false);
}

function populateAssistantSection(form) {
  addTaskBlock(form, 1, "متابعة عبء العمل الصباحي",
    "ما الذي تتابعه في الشاشة الرئيسية كل صباح؟ وما البيانات الناقصة فيها؟",
    "الصفحة الرئيسية (/)", "c02-home-desktop.png");

  addTaskBlock(form, 2, "توزيع العمل على الفريق",
    "استعرض جدول وتوزيع الأعمال على الفريق لهذا الأسبوع.",
    "صفحة الأعمال (/work)", "acceptance-work-1440.png");

  addTaskBlock(form, 3, "تحويل طلب وارد إلى عمل",
    "هناك طلب وارد في البريد. حوّله إلى عمل وأسنده لمختص ضمن حملة.",
    "صفحة البريد (/mail) ثم الإنشاء (/create)", "acceptance-create-1440.png");

  addTaskBlock(form, 4, "حصر الأعمال المتأخرة",
    "كم عملاً متأخراً عن موعده التسليمي حالياً؟",
    "صفحة الأعمال (/work) والتقويم (/calendar)", "c02-calendar-desktop.png");

  addTaskBlock(form, 5, "مراجعة عمل واتخاذ قرار",
    "راجع عملاً أرسله أحد المختصين وقرر فيه بالاعتماد أو طلب التعديل.",
    "صفحة الموافقات (/approvals)", "acceptance-approvals-1440.png");

  addTaskBlock(form, 6, "التعامل مع عمل ملغى أو مرفوض",
    "عمل رُفض ولن يُستأنف العمل عليه. ماذا تفعل به في النظام؟",
    "صفحة الأعمال (/work)", "acceptance-work-1440.png");

  form.addSectionHeaderItem().setTitle("أسئلة هيكلية خاصة بمساعد مدير الاتصال:");

  form.addParagraphTextItem()
    .setTitle("من أين يأتي عمل القسم فعلياً؟ وما نسبة العمل الذي يأتي خارج أي حملة مخططة؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل يحدث أن يخدم محتوى واحد حملتين مختلفتين؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل تُسند المهمة لدور عام أم لشخص بعينه؟ وفي حال وجود مصممين اثنين، كيف تفرقون؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل تحتاجون مواعيد لكل مرحلة إنتاج، أم موعد تسليم نهائي واحد يكفي؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("ما أكثر إجراء يعطّل تدفق العمل عندكم اليوم؟")
    .setRequired(false);
}

function populateWriterSection(form) {
  addTaskBlock(form, 1, "استكشاف المهام المطلوبة",
    "ما المطلوب منك تنفيذه اليوم بحسب الشاشة الرئيسية؟",
    "الصفحة الرئيسية (/)", "c02-home-desktop.png");

  addTaskBlock(form, 2, "قراءة الملاحظة وتعديل النص",
    "هناك عمل طُلب فيه تعديل. اقرأ ملاحظة المراجع ونفّذ التعديل المطلوب.",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 3, "كتابة صياغة مخصصة لقناة",
    "اكتب صياغة مختلفة لمنصة X عن النص الأساسي للعمل.",
    "تفاصيل العمل (/work/<id>) - تبويبات القنوات", "acceptance-detail-1440.png");

  addTaskBlock(form, 4, "إعادة الإرسال للمراجعة",
    "أعد إرسال العمل للمراجعة بعد التعديل، وتأكد من تقدم رقم الإصدار.",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 5, "مقارنة الفروق بين الإصدارات",
    "حاول استعراض الفرق بين ما أرسلته الآن وما أرسلته سابقاً.",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 6, "فحص تأثير تعديل النص الأساسي على القنوات",
    "افترض أنك غيّرت النص الأساسي بعد كتابة صياغات القنوات؛ ماذا تتوقع أن يحدث لتلك الصياغات؟",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  form.addSectionHeaderItem().setTitle("أسئلة لكاتب المحتوى حول المصطلحات وسير العمل:");

  form.addParagraphTextItem()
    .setTitle("كم مرة يتكرر طلب التعديل عادة قبل الاعتماد النهائي؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("عندما يُطلب تعديل، هل تصلك الملاحظة بوضوح وفي الوقت المناسب؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("الحالة تسمى حالياً «بحاجة إلى تعديل». هل هذا المصطلح مستخدم لديكم أم تفضلون «مُعاد للتعديل»؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("نسمي هذه العناصر «العمل» و«الإصدار». ما الكلمات والمصطلحات الدارجة في القسم؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل النموذج الواحد للتحرير يناسب كتابة بيان صحفي ومنشور اجتماعي معاً؟")
    .setRequired(false);
}

function populateDesignerSection(form) {
  addTaskBlock(form, 1, "استكشاف مهام التصميم",
    "ما الذي يخصك في الشاشة الرئيسية اليوم؟",
    "الصفحة الرئيسية (/)", "c02-home-desktop.png");

  addTaskBlock(form, 2, "استعراض إصدارات الأصل في مكتبة الوسائط",
    "افتح مكتبة الوسائط واستعرض إصدارات الملصق وحدد أيها معتمد.",
    "مكتبة الوسائط (/media)", "acceptance-media-1440.png");

  addTaskBlock(form, 3, "ربط إصدار التصميم بالعمل",
    "اربط إصداراً محدداً من التصميم بالعمل، ثم أرسله للمراجعة.",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 4, "البحث عن خيار رفع تصميم جديد",
    "ابحث عن مكان رفع تصميم جديد، وسجل توقعك حيال آلية الرفع.",
    "مكتبة الوسائط (/media)", "acceptance-media-1440.png");

  addTaskBlock(form, 5, "ملاءمة قائمة مراحل الإنتاج",
    "قائمة مراحل الإنتاج هنا ثابتة في 4 خطوات؛ هل تناسب خطوات عملك الفعلي؟",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  form.addSectionHeaderItem().setTitle("أسئلة للمصمم حول بيئة العمل والأصول:");

  form.addParagraphTextItem()
    .setTitle("أين تحفظون ملفات التصميم اليوم، وما المسار الفعلي من انتهاء التصميم إلى النشر؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل يكفي عرض صورة تمثيلية للإصدار، أم لا بد من توفر الملف الحقيقي للمراجعة؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("إذا تغيّر التصميم فقط ولم يتغير النص، ما الذي يجب أن يحدث للاعتماد؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل يفرّق القسم بين «الإصدار» للعمل و«الإصدار» لملف التصميم؟")
    .setRequired(false);
}

function populateProducerSection(form) {
  addTaskBlock(form, 1, "استعراض حالة أعمال المونتاج والتغطيات",
    "ما حالة أعمالك الآن بحسب الشاشة الرئيسية (ميز بين ما هو قيد الإنتاج وما هو قيد المراجعة)؟",
    "الصفحة الرئيسية (/)", "c02-home-desktop.png");

  addTaskBlock(form, 2, "تحديث عمل ونقله لمرحلة قيد الإنتاج",
    "لديك عمل قيد الإنتاج؛ استعرض ما ستفعله به اليوم.",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 3, "إرسال الفيديو للمراجعة",
    "أرسل الفيديو للمراجعة واستعرض الحزمة التي سيراها المراجع.",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 4, "البحث عن ملاحظات مرتبطة بتوقيت زمني",
    "افترض أن المراجع طلب تعديلاً على الدقيقة 01:30 تحديداً، أين تتوقع تسجيل أو رؤية ذلك؟",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 5, "البحث عن مكان رفع ملف الفيديو",
    "ابحث عن أين ترفع نسخة المونتاج النهائية وما توقعك لحجم الملفات.",
    "مكتبة الوسائط (/media)", "acceptance-media-1440.png");

  form.addSectionHeaderItem().setTitle("أسئلة للمنتج الإعلامي:");

  form.addParagraphTextItem()
    .setTitle("ما حجم ملفات الفيديو التي تتعاملون معها، وأين تُخزن وتُشارك حالياً؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل تكفي المراجعة على نسخة مصغرة/مضغوطة، أم تحتاجون النسخة الكاملة الأصلية؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("كم يستغرق الإنتاج عادة من لحظة الإسناد إلى التسليم؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل نموذج الإدخال الحالي يصلح لعمل فيديو، أم أنه مصمم للمنشورات فقط؟")
    .setRequired(false);
}

function populatePublisherSection(form) {
  addTaskBlock(form, 1, "فحص الأعمال الجاهزة للنشر وصحة الحسابات",
    "ما الذي تنشره اليوم بحسب الشاشة؟ وما الذي يمنعك من النشر حالياً في لوحة صحة الحسابات؟",
    "رئيسية مسؤول النشر (/)", "c02-home-publisher.png");

  addTaskBlock(form, 2, "جدولة إصدار معتمد",
    "جدول إصداراً معتمداً للنشر في 23 سبتمبر الساعة 18:00 بتوقيت الرياض.",
    "صفحة الموافقات والنشر (/approvals)", "acceptance-approvals-1440.png");

  addTaskBlock(form, 3, "التأكد من ظهور الموعد بالتقويم",
    "أكّد أن المنشور ظهر في التقويم في اليوم والوقت المحددين.",
    "صفحة التقويم (/calendar)", "c02-calendar-desktop.png");

  addTaskBlock(form, 4, "تنفيذ النشر ومحاكاة فشل قناة",
    "نفّذ النشر الفوري مع اختيار محاكاة فشل آخر قناة.",
    "صفحة الموافقات والنشر (/approvals)", "partial-publication.png");

  addTaskBlock(form, 5, "إعادة محاولة القناة المتعثرة",
    "أعد المحاولة للقناة المتعثرة فقط. ما الذي تتوقع حدوثه للقناة التي نجح نشرها مسبقاً؟",
    "صفحة الموافقات والنشر (/approvals)", "partial-publication.png");

  addTaskBlock(form, 6, "التعامل مع تنبيه انتهاء ربط الحساب",
    "إحدى القنوات تحتاج لإعادة ربط؛ ما الذي تفعله ومتى كان يجب إبلاغك بذلك؟",
    "الصفحة الرئيسية (/)", "c02-home-publisher.png");

  addTaskBlock(form, 7, "محاولة اعتماد محتوى بنفسك",
    "هل يمكنك اعتماد محتوى بنفسك مباشرة دون مراجع؟ لاحظ ما إذا كان النظام يمنع ذلك بوضوح.",
    "صفحة الموافقات (/approvals)", "acceptance-approvals-1440.png");

  form.addSectionHeaderItem().setTitle("أسئلة لمسؤول النشر وإدارة الحسابات:");

  form.addParagraphTextItem()
    .setTitle("مَن يملك حسابات القنوات اليوم، ومَن ينتبه عند انتهاء صلاحية الربط؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل يحدث أن تنشر مباشرة من منصات التواصل خارج النظام؟ في أي حالات؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("ماذا تفعلون اليوم عملياً عندما يفشل النشر جزئياً على إحدى المنصات دون غيرها؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل تنشر عادة من الجوال خارج أوقات الدوام الرسمي؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("هل مصطلح «نشر جزئي» هو المستخدم لديكم أم تفضلون «نشر غير مكتمل»؟")
    .setRequired(false);
}

function populateMemberSection(form) {
  addTaskBlock(form, 1, "استعراض مهام العضو",
    "ما الذي يخصك في هذه الشاشة (تأكد من عدم ظهور أعمال لا تخصك)؟",
    "الصفحة الرئيسية (/)", "c02-home-desktop.png");

  addTaskBlock(form, 2, "إرسال المساهمة للمراجعة",
    "أرسل مساهمتك للمراجعة.",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 3, "الاطلاع على ملاحظات الفريق",
    "استعرض ما قاله الفريق أو المشرف على عملك ومساهمتك.",
    "تفاصيل العمل (/work/<id>)", "acceptance-detail-1440.png");

  addTaskBlock(form, 4, "محاولة اعتماد أو نشر عمل",
    "حاول اعتماد عمل أو نشره، وتأكد من وضوح حدود الصلاحية الممنوحة لك.",
    "صفحة الموافقات (/approvals)", "acceptance-approvals-1440.png");

  addTaskBlock(form, 5, "عناصر غير متوفرة",
    "ما الذي كنت تتوقع أن تجده في واجهة العضو ولم تجده؟",
    "الصفحة الرئيسية (/)", "c02-home-desktop.png");

  form.addSectionHeaderItem().setTitle("مهام ملحق مسؤول النظام (Admin Addendum):");

  addTaskBlock(form, "أ-1", "استعراض أقسام لوحة الإدارة",
    "افتح صفحة الإدارة واستعرض حالة النظام والمستخدمين والتكاملات.",
    "لوحة الإدارة (/admin)", "c02-admin-desktop.png");

  addTaskBlock(form, "أ-2", "إدارة المستخدمين والأدوار",
    "استعرض أين يتم تعديل دور المستخدم أو إضافة مستخدم جديد.",
    "لوحة الإدارة - المستخدمون (/admin)", "c02-admin-users.png");

  addTaskBlock(form, "أ-3", "إعادة تهيئة التكاملات",
    "أحد التكاملات يحتاج لإعادة ربط؛ مَن مسؤوليته العملية في واقع القسم؟",
    "لوحة الإدارة - التكاملات (/admin)", "c02-admin-desktop.png");

  addTaskBlock(form, "أ-4", "صلاحيات مسؤول النظام في المحتوى",
    "هل يستطيع مسؤول النظام اعتماد محتوى أو نشره؟ تأكد من الفصل الصارم للصلاحيات.",
    "صفحة الموافقات (/approvals)", "acceptance-approvals-1440.png");
}

function populateCommonExitSection(form) {
  form.addSectionHeaderItem()
    .setTitle("التقييم الكمي لمحاور النموذج الأولي (من 1 إلى 5)")
    .setHelpText(
      "يرجى تقييم كل محور من 1 إلى 5، حيث:\n" +
      "1 يعني: يناقض تماماً واقع عمل القسم أو غير ملائم مطلقاً.\n" +
      "5 يعني: يطابق تماماً واقع عمل القسم ويلبي الاحتياج بشكل ممتاز."
    );

  form.addScaleItem()
    .setTitle("1. مطابقة تسلسل وسير العمل (Workflow Fidelity)")
    .setHelpText("هل ترتيب خطوات وإجراءات العمل يطابق ما تفعلونه في الواقع؟")
    .setBounds(1, 5)
    .setLabels("يناقض واقع العمل", "يطابق واقع العمل تماماً")
    .setRequired(true);

  form.addScaleItem()
    .setTitle("2. دقة الصلاحيات والفصل بين المسؤوليات (Authority Fidelity)")
    .setHelpText("هل الصلاحيات والقيود والفصل بين مهام كل دور واضحة وسليمة؟")
    .setBounds(1, 5)
    .setLabels("صلاحيات متداخلة أو غير سليمة", "صلاحيات وفصل دقيق وممتاز")
    .setRequired(true);

  form.addScaleItem()
    .setTitle("3. سهولة الوصول والعثور على العناصر (Findability)")
    .setHelpText("هل تمكنت من الوصول لما تحتاجه في الواجهات بسهولة ودون توجيه؟")
    .setBounds(1, 5)
    .setLabels("صعوبة بالغة في العثور", "واضح وسهل الوصول جداً")
    .setRequired(true);

  form.addScaleItem()
    .setTitle("4. ملاءمة المصطلحات والعبارات العربية (Terminology)")
    .setHelpText("هل الكلمات والمصطلحات المستخدمة في الواجهات هي المصطلحات الدارجة لديكم؟")
    .setBounds(1, 5)
    .setLabels("مصطلحات غير متداولة وغريبة", "مطابقة تماماً للغة القسم")
    .setRequired(true);

  form.addScaleItem()
    .setTitle("5. الثقة في سجلات النظام وسجل الاعتماد والنشر (Trust in the Record)")
    .setHelpText("هل تثق في دقة ما يظهره النظام عن حالة الاعتماد والإصدارات والنشر؟")
    .setBounds(1, 5)
    .setLabels("لا أثق بما يظهره النظام", "موثوق وشفاف بدرجة عالية")
    .setRequired(true);

  form.addParagraphTextItem()
    .setTitle("إذا قيّمت أي محور بـ 3 أو أقل، يرجى كتابة السبب أو الملاحظة باختصار:")
    .setHelpText("هذه الملاحظات تعتبر أساسية لتصحيح النموذج في المرحلة التالية.")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("ما أكثر ما فاجأك أو لفت انتباهك في تجربة هذا النموذج؟")
    .setRequired(false);

  form.addParagraphTextItem()
    .setTitle("أي ملاحظات ختامية أو مقترحات تود إضافتها:")
    .setRequired(false);
}
