// Why a button needs a long press, in the words of the reference («النموذج المرجعي للمركز»,
// version 5, HOLD_WHY). A button carries its reason in data-hold; the hold engine reads it.
// The work pages add theirs in Steps 3 to 5.
export const HOLD = {
  /** Library: approve a version and lock it. */
  approveLock: 'الاعتماد يقفل هذا الإصدار في كل عمل يدخل فيه.',
  /** Library: delete one file. */
  trashOne: 'الحذف ينقل الملف إلى سلة Drive.',
  /** Library: delete the selected files. */
  trashSelected: 'الحذف ينقل الملفات المحددة إلى سلة Drive.',
  /** Mail: approve held outside mail and send it. */
  holdSend: 'البريد الخارجي يخرج من صندوق القسم ولا يُستعاد.',
  /** Mail: approve from an approval card. */
  mailCardApprove: 'الاعتماد يقفل هذا الإصدار.',
  /** Messaging: approve from an approval card, or approve a shared file. */
  chatApprove: 'الاعتماد يقفل هذا الإصدار.',
  /** Messaging: delete a message for everyone. */
  chatDelete: 'تُحذف الرسالة عند كل الأعضاء.',
  /** Work page: close a work with its reason. */
  closeWork: 'الإغلاق يخرج العمل من القوائم النشطة ومن حمل صاحبه.',
  /** Review screen: approve the pending parts or the whole package. */
  approveAll: 'الاعتماد قرار يُسجَّل باسمك ويجعل العمل جاهزاً للنشر.',
  /** Review screen: confirm a rejection. */
  rejectWork: 'الرفض يوقف العمل عن غرضه، وقد يغلقه.',
  /** Publishing: publish now, and confirm an ask-first publication when its time comes. */
  publishNow: 'النشر يصل إلى المنصات ولا يُتراجع عنه.',
  /** «الحسابات المرتبطة»: delete an account. */
  accountDelete: 'حذف الحساب يفصله عن المركز ويحذف مفاتيحه.',
  // Permissions (Permissions_Plan.md 10, «New hold buttons»).
  /** «الحسابات»: remove a member. */
  removeMember: 'إزالة العضو تفصله عن المركز وتبقي أعماله لدى من يُسند إليه.',
  /** «الحسابات»: end every grant a person was given. */
  endAllGrants: 'تنتهي كل الصلاحيات المضافة لهذا الشخص الآن.',
  /** «الحسابات», roles: switch a capability off for a whole role. */
  roleDefaultOff: 'التغيير يمسّ كل من يحمل هذا الدور.',
  /** «الحسابات»: change a person's role to a lower one. */
  roleDown: 'ينقص هذا التغيير ما يستطيع الشخص فعله فوراً.',
  /** «الحسابات»: an administrator unlinks a member's WhatsApp number. */
  waUnlink: 'يقطع ربط رقم هذا العضو ولا يُعاد إلا بتحقق جديد.',
} as const;

export const HOLD_MS = 900;
