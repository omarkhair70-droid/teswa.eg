import type { AuthFailureReason } from '@/lib/backend/contracts/auth';

/** User-facing feedback only. Never display raw server errors or credentials. */
export function loginFailureMessage(reason: AuthFailureReason, oracle = false): string {
  switch (reason) {
    case 'invalid_credentials':
      return oracle
        ? 'البريد أو كلمة المرور غير صحيحين. لو الحساب اتعمل بجوجل فقط، لازم يكون له كلمة مرور مضافة على Oracle.'
        : 'البريد الإلكتروني أو كلمة المرور غير صحيحين.';
    case 'email_not_confirmed':
      return 'لا يمكن تسجيل الدخول قبل تأكيد البريد الإلكتروني. راجع البريد الوارد وSpam/Junk.';
    case 'rate_limited':
      return 'محاولات كثيرة. انتظر قليلًا قبل المحاولة مرة أخرى.';
    case 'network':
      return 'تعذر الوصول لخدمة تسجيل الدخول. تحقق من الاتصال وحاول مرة أخرى.';
    case 'session_expired':
      return 'انتهت جلسة الدخول. حاول تسجيل الدخول مرة أخرى.';
    case 'provider_cancelled':
      return 'تم إلغاء تسجيل الدخول.';
    case 'provider_failed':
      return 'تعذر إكمال تسجيل الدخول بجوجل. حاول مرة أخرى.';
    default:
      return 'تعذر تسجيل الدخول. حاول مرة أخرى.';
  }
}
