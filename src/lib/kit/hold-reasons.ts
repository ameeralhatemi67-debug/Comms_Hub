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
} as const;

export const HOLD_MS = 900;
