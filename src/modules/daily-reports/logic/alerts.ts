import type { SystemAlert } from '../types/report-json';

/**
 * System-alert codes and Arabic messages for the daily report (§23). Alerts are
 * independent of the teacher note and are stored as JSON on the student row.
 */
export const ALERTS = {
  noApprovedPlan: (): SystemAlert => ({
    code: 'NO_APPROVED_PLAN',
    severity: 'warning',
    message: 'لا توجد خطة معتمدة لهذا اليوم',
  }),
  missingAttendance: (): SystemAlert => ({
    code: 'MISSING_ATTENDANCE',
    severity: 'warning',
    message: 'لم يتم تسجيل حضور الطالب',
  }),
  outsidePlan: (): SystemAlert => ({
    code: 'OUTSIDE_PLAN',
    severity: 'info',
    message: 'يوجد جزء من الإنجاز خارج نطاق الخطة',
  }),
  planGaps: (): SystemAlert => ({
    code: 'PLAN_GAPS',
    severity: 'info',
    message: 'توجد فجوات غير منجزة داخل الخطة',
  }),
  weightsRedistributed: (): SystemAlert => ({
    code: 'WEIGHTS_REDISTRIBUTED',
    severity: 'info',
    message: 'أعيد توزيع الأوزان لعدم وجود بعض المسارات',
  }),
  recalculated: (): SystemAlert => ({
    code: 'RECALCULATED',
    severity: 'info',
    message: 'أعيد احتساب التقرير بعد تعديل بيانات تاريخية',
  }),
} as const;
