# خطة تنفيذ — تقرير التقييم اليومي (Backend)

وثيقة تخطيط تنفيذ لميزة **تقرير التقييم اليومي لطلاب الحلقة**، مبنية على المواصفة
`halaqa_daily_evaluation_report_spec.md` (الجذر) وعلى مراجعة فعلية لكود الـ backend الحالي.

> **حالة الوثيقة:** خطة للمراجعة والموافقة — **لم يُكتب أي كود بعد**.
> بعد الموافقة تُنفَّذ على دفعات حسب المراحل أدناه.

---

## 0. الوضع الحالي وتحليل الفجوة

الـ backend مشروع **NestJS 11 + TypeORM (MySQL) + `@nestjs/schedule`** ناضج (وليس scaffold كما يوحي `CLAUDE.md` القديم). لا يوجد نظام Queue (لا Bull/BullMQ)، والجدولة عبر `@Cron`.

| المكوّن | الموجود اليوم | ما يطلبه الـ spec | الفجوة |
|---|---|---|---|
| أوزان التقييم | `halaqat.evaluation_settings` (JSON) = أوزان **أخطاء التسميع** (mistake/warning/tajweed/harakat) | أوزان **المسارات** hifz/near/far/ethics بمجموع 100 (§5) | **جديد كلياً** — عمود/إعداد منفصل |
| المطابقة (Reconciliation) | `PlanReconciliationService` على مستوى **الأسبوع** (حالة عناصر الخطة) | مطابقة على مستوى **اليوم/الطالب/المسار** مع JSON للفجوات والتداخل (§12، §13) | خدمة جديدة مستقلة |
| حساب الصفحات | **غير موجود** في الـ backend (فقط `SURAH_VERSES`) | خوارزمية `useVerseToPage.ts` مطابقة حرفياً (§9) | نقل كامل + بيانات `quran-structure.json` |
| الأخلاق | `student_attendances.ethics_rating` (1..5) موجود ✅ | كما هو (§18) | لا شيء |
| ملاحظة المحفّظ | `excuse_note` فقط | `daily_note` على الحضور (§22) | عمود جديد |
| عضوية الطالب التاريخية | `student_halaqa` (الحالة الراهنة) | `student_halaqa_enrollments` تاريخي (§8) | جدول جديد + backfill |
| حقول الخطة | `weekly_plan_items` بلا global-ayah/planned_pages | `start/end_global_ayah` + `planned_pages` (§10.1) | أعمدة جديدة + backfill |
| تخزين التقرير | **غير موجود** | `daily_halaqa_reports` + `daily_student_evaluations` (§25، §26) | جدولان جديدان |
| الـ APIs | **غير موجودة** | 3 endpoints (§29) | جديدة |
| Snapshot الأسبوعي | **غير موجود** | Cron نهاية الأسبوع (§28.2) | Cron جديد |
| إعادة الاحتساب التاريخي | **غير موجود** | تلقائي عند تعديل المصدر (§28.4) | خدمة + ربط بالخدمات القائمة |

**أساسات جاهزة نستفيد منها:** نمط `resolveEvaluationSettings` (دمج فوق الافتراضي)، حراس `HalaqaAccessGuard`/`HalaqaEditAccessGuard` + `@RequiresHalaqaPermission`، `@Roles`/`@MinRoleLevel`، `AuditService` + `@Audit`، `HalaqaActivityLogService`، نمط `@Cron`، أسلوب الـ migrations (timestamps متسلسلة يدوية، `up`+`down`).

---

## 1. قرارات التصميم (محسومة ✅ / بانتظار تأكيد 🚦)

1. ✅ **تخزين أوزان المسارات — 4 أعمدة DECIMAL صريحة** (قرار المالك). على `halaqat`: `hifz_weight`, `near_weight`, `far_weight`, `ethics_weight` — كل منها `DECIMAL(5,2) NOT NULL` بافتراضيات `40.00 / 25.00 / 30.00 / 5.00` (مثال §6.2). التحقق: `sum = 100.00` و`0 ≤ w ≤ 100` على مستوى التطبيق (+ CHECK اختياري في MySQL 8 على المجموع). لا حاجة لـ `resolve()`-merge لأن الأعمدة NOT NULL بافتراضيات.
2. ✅ **المنطقة الزمنية وحدود الأسبوع — UTC في v1** (قرار المالك). كل الحسابات على منتصف ليل UTC (يطابق الـ crons الحالية، بلا حقول جديدة). الضبط المحلي حسب منطقة المدرسة (§28.2) مؤجَّل كتحسين لاحق. يؤثر على تعريف "الأسبوع الحالي" (§28.1) وتوقيت الـ Snapshot.
3. ✅ **`student_halaqa_enrollments` — يُبنى بـ backfill من `student_halaqa` ويصبح مصدر الحقيقة للعضوية التاريخية في التقارير** ("اعمل المناسب"). التفاصيل في §2.3.
4. ✅ **مصدر بيانات الصفحات.** نسخ `quran-structure.json` (`pageStarts`، **604 صفحة**) إلى `src/quran/data/`، util مطابق، + **golden vectors** من الفرونت في اختبارات الـ backend (لا workspace مشترك).
5. ✅ **604 وليس 614.** الـ backend يعتمد `pageStarts` (604) للتغطية مطابقاً لـ `pageCoverage` في الفرونت.
6. ✅ **التقريب.** helper `roundHalfUp(value, decimals)` موحّد، يُطبَّق عند العرض/التخزين النهائي فقط مع إبقاء الوسائط بدقة كاملة (§27).
7. ✅ **المطابقة اليومية منفصلة.** `DailyReconciliationService` جديدة ومستقلة عن `PlanReconciliationService` القائمة (مقاطع ذرّية + أعلى `percentage_score`، لا "أول عنصر يستهلك"). لا نلمس القائمة.
8. ✅ **ملكية `percentage_score`.** التقرير يستهلك القيمة المخزّنة كما هي (§15.1). إعادة الاشتقاق في الخادم خارج النطاق، موصى بها لاحقاً.

---

## 2. المرحلة 1 — قاعدة البيانات ✅ (مُنفَّذة)

الأعمدة snake_case، أنواع MySQL، migrations بـ `up`+`down` كاملين على نمط `1779700000000-AttendanceEthicsRating.ts`. الترقيم يكمل بعد آخر migration (`1779900000000`).

> **حالة التنفيذ:** كل بنود المرحلة 1 مُنفَّذة (6 migrations `1780000000000`–`1780500000000`، 3 entities جديدة، 3 entities معدّلة، مسجّلة في `data-source.ts` + `forFeature`). `pnpm run build` نظيف؛ اختبارات halaqat/attendance/achievements كلها تعبر (291 اختباراً). **التحقق المتبقي:** تشغيل `up`/`down` على قاعدة نظيفة (يحتاج MySQL حيّة، حسب نمط `docs/CHANGES-*.md`). التقاط `daily_note` في DTO/خدمة الحضور مؤجَّل لتدفّق الالتقاط. backfill الـ `planned_pages`/global-ayah مؤجَّل للمرحلة 2 (يحتاج util الصفحات).

### 2.1 أوزان المسارات على الحلقة — `1780000000000-HalaqaReportWeights` (4 أعمدة صريحة)
- **Migration:** `addColumn('halaqat', ...)` أربع مرات: `hifz_weight`, `near_weight`, `far_weight`, `ethics_weight` — كل منها `DECIMAL(5,2) NOT NULL` بافتراضيات `40.00 / 25.00 / 30.00 / 5.00`. الصفوف القائمة تأخذ الافتراضيات تلقائياً. اختيارياً: `CHECK (hifz_weight + near_weight + far_weight + ethics_weight = 100)` و`CHECK (w BETWEEN 0 AND 100)` (نمط `chk_sa_ethics_rating`).
- **Entity:** `halaqa.entity.ts` — أربعة `@Column({type:'decimal', precision:5, scale:2})` بأسماء snake_case.
- **DTO/الافتراضي:** `dto/report-weights.dto.ts` جديد: `hifz_weight/near_weight/far_weight/ethics_weight`، كل منها `@IsNumber() @Min(0) @Max(100)` + `REPORT_WEIGHTS_DEFAULTS = {40,25,30,5}`. لا حاجة لـ `resolve()`-merge (الأعمدة NOT NULL).
- **تحقق المجموع = 100:** validator مخصّص على مستوى الكائن `@WeightsSumTo100()` (نمط `is-after-field.decorator.ts`) — يرفض (400) إن اختلّ المجموع.
- **الربط:** `create-halaqa.dto.ts` / `update-halaqa.dto.ts` (كائن `report_weights?` اختياري؛ عند غيابه تبقى الافتراضيات/القيم الحالية)، `halaqa.responses.ts`، ونقاط اللمس في `halaqat.service.ts` (create/detail/update).

### 2.2 ملاحظة المحفّظ — `1780100000000-AttendanceDailyNote`
- **Migration:** `addColumn('student_attendances', 'daily_note' TEXT NULL)`.
- **Entity:** `student-attendance.entity.ts` — `@Column({name:'daily_note', type:'text', nullable:true}) dailyNote!: string | null`.
- **الالتقاط:** يُضاف حقل `daily_note` إلى DTO تصحيح الحضور (`correct-student-attendance.dto.ts` / `sync-student-attendance.dto.ts`) وخدمة الحضور. (منفصل عن `excuse_note` و`modification_reason`.)

### 2.3 العضوية التاريخية — `1780200000000-CreateStudentHalaqaEnrollments`
- **جدول جديد** `student_halaqa_enrollments` (§8.1): `id BIGINT UNSIGNED PK`, `student_id INT`, `halaqa_id INT`, `start_date DATE`, `end_date DATE NULL`, `status ENUM('active','transferred','completed','archived')`, `end_reason VARCHAR(255) NULL`, `created_by INT NULL`, `created_at/updated_at DATETIME(6)`.
- **فهارس:** على `(student_id, start_date)` و`(halaqa_id, start_date)` لدعم استعلام العضوية §8.2.
- **الـ backfill (المناسب) داخل نفس الـ migration:** صف واحد لكل صف في `student_halaqa` الحالي:
  - `start_date = student_halaqa.enrollment_date`
  - `status = student_halaqa.status` (نفس enum: active/transferred/completed/archived)
  - `end_date = NULL` للجميع — لأن `student_halaqa` **لا يخزّن تاريخ انتهاء**؛ لا نخترع تواريخ. *أثر معلوم:* الصفوف غير النشطة ستطابق أي تاريخ ≥ `start_date` في استعلام §8.2؛ مقبول في v1 لأن الدقة التاريخية للانتهاء غير متوفرة أصلاً في المصدر.
  - `created_by = NULL`.
- **مصدر الحقيقة (القرار 3):** الجدول الجديد يصبح مرجع العضوية التاريخية **للتقارير**. عمليات العضوية الجارية (تسجيل/نقل/إزالة/أرشفة في وحدة `halaqat`) يجب أن **تكتب صفاً في الجدول الجديد أيضاً** — تُغلق الصف السابق (`end_date` + `status` + `end_reason`) وتفتح صفاً جديداً عند النقل. (`student_halaqa` يبقى كما هو للحالة الراهنة في v1 لتقليل الاضطراب؛ التوحيد الكامل لاحقاً.) — ربط هذه الكتابة يتم ضمن المرحلة 5 / وحدة halaqat.

### 2.4 حقول الخطة المساعدة — `1780300000000-WeeklyPlanItemPageFields`
- **Migration:** إضافة `start_global_ayah INT UNSIGNED NULL`, `end_global_ayah INT UNSIGNED NULL`, `planned_pages DECIMAL(8,4) NOT NULL DEFAULT 0` إلى `weekly_plan_items` (§10.1).
- **Entity:** الحقول المقابلة في `weekly-plan-item.entity.ts`.
- **Backfill:** حساب القيم للصفوف القائمة عبر util الصفحات الجديد (المرحلة 2). يُعاد احتساب `planned_pages` في الـ backend عند إنشاء/تعديل عناصر الخطة (§32).

### 2.5 رأس التقرير اليومي — `1780400000000-CreateDailyHalaqaReports`
- **جدول** `daily_halaqa_reports` بالحقول الكاملة في §25.1 (school/halaqa/report_date، `day_status ENUM('working_day','non_working_day')`، `report_status ENUM('complete','partial','failed')`، لقطة الأوزان الخمسة DECIMAL(5,2)، `calculation_version`، `generated_at/by`، `recalculated_at/by/reason`، timestamps).
- **قيود §25.2:** `UNIQUE (halaqa_id, report_date)` + فهرسا (school_id,date) و(halaqa_id,date).

### 2.6 صفوف تقييم الطلاب — `1780500000000-CreateDailyStudentEvaluations`
- **جدول** `daily_student_evaluations` بالحقول الكاملة §26 (المفاتيح، `attendance_status` بما فيها `missing_attendance`، `teacher_note`, `system_alerts JSON`, `calculation_details JSON`، وحقول كل مسار hifz/near/far الثمانية بما فيها `*_reconciliation JSON`، والأخلاق/الإجمالي).
- **قيود §26.6:** `UNIQUE (daily_report_id, student_id)`، فهرسان، `FK → daily_halaqa_reports(id) ON DELETE CASCADE`.

> **ملاحظة enum الحضور:** جدول `student_attendances` يبقى `present|absent|excused|late`. قيمة `missing_attendance` **مشتقة على مستوى التقرير** (لا يوجد صف حضور) وتُخزَّن فقط في `daily_student_evaluations.attendance_status` — لا تعديل على enum المصدر.

---

## 3. المرحلة 2 — المنطق المشترك (النواة الحسابية) ✅ (مُنفَّذة)

كل ما يلي منطق نقي (pure) قابل لاختبار الوحدة بمعزل عن قاعدة البيانات.

> **حالة التنفيذ:** مُنفَّذة بالكامل. `src/quran/`: `quran-page-starts.ts` (604) + `data/quran-structure.json` + `page-coverage.ts` (نقل حرفي + `pageCoverageGlobal`/`globalToVerse`) + `range-union.ts`، مع `page-coverage.parity.spec.ts` يقارن **672 golden vector** مولّدة من مصدر الفرونت. `src/common/rounding.ts` (roundHalfUp). `src/modules/daily-reports/logic/`: `reconciliation.ts` (§13)، `weight-redistribution.ts` (§6)، `scoring.ts` (§16–§20) — كلها باختبارات تغطّي حالات §33 (4–8، إعادة التوزيع، الحضور). `pnpm run build` نظيف؛ **595 اختباراً** تعبر (مجموع المشروع)؛ lint نظيف على الملفات الجديدة. **مؤجَّل للمرحلة 3:** ربط هذه الدوال بخدمة تجلب البيانات من قاعدة البيانات (DailyReportService)، وbackfill حقول `weekly_plan_items`.

### 3.1 نقل حساب الصفحات — `src/quran/`
- **بيانات:** `src/quran/data/quran-structure.json` (نسخة من الفرونت: `pageStarts` 604 + juz/hizb/rub عند الحاجة).
- **الفهرسة العالمية:** `SURAH_OFFSETS` + `verseToGlobal(surah,verse)` + `TOTAL_VERSES=6236` (مشتقة من `SURAH_VERSES` الموجودة — تطابق `VERSE_COUNTS` في الفرونت).
- **`page-coverage.ts`:** نقل حرفي لـ `pageForGlobal` (بحث ثنائي)، `pageBounds`، `pageCoverage(range)`، و`pagesRecited(range, positions?)` (مجموع تغطية المواضع في وضع الاختبار، وإلا تغطية المدى؛ حد أدنى 1).
- **اختبار تطابق:** `page-coverage.parity.spec.ts` يقارن نتائج الـ backend بـ golden vectors مولّدة من `useVerseToPage.ts` (معيار قبول §9.1، §36).

### 3.2 مساعدات المدى
- **اتحاد النطاقات** في فضاء الفهرس العالمي (دمج فترات متداخلة/متجاورة) لمنع احتساب الآية مرتين (§9.4، §13.2).
- **`roundHalfUp(value, decimals)`** (القرار 4).

### 3.3 `DailyReconciliationService` (لكل طالب/مسار/يوم — §13)
منطق نقي يُنتج JSON المسار (§12):
1. تحويل نطاقات الخطة والإنجاز إلى فهارس عالمية.
2. اتحاد نطاقات الخطة (منع التكرار).
3. قص كل إنجاز على حدود الخطة → الزائد إلى `outsidePlanSegments`.
4. جمع نقاط الحدود → تقسيم الخطة إلى **مقاطع ذرّية** غير متداخلة.
5. لكل مقطع: تحديد الإنجازات المغطية؛ إن لا شيء → `gap`؛ إن أكثر من إنجاز → أعلى `percentage_score`، وعند التعادل الأحدث `approved_at` ثم أعلى `id` (حتمية).
6. دمج المقاطع المتجاورة بنفس النتيجة والإنجاز.
   - **نطاق الإنجاز المحتسَب = مدى الإنجاز كاملاً، بما في ذلك `recitation_method='test'`.** الاختبار في مواضع مختارة أسلوبٌ لاختصار الوقت في المراجعة القريبة/البعيدة، لا تقصيرٌ في الخطة؛ فأخطاء تلك المواضع تنعكس في `percentage_score` (الجودة) فقط ولا تنقص التغطية. يطابق ذلك مصالحة بنود الخطة في `PlanReconciliationService`.
7. حساب تغطية الصفحات (اتحاد، بلا تكرار) → `planned_pages`, `achieved_pages`.
8. `completion_rate = min(achieved/planned×100, 100)` (§14.3)، `quality_rate` = متوسط موزون بتغطية الصفحات (§15.4).
- **الإخراج:** `{version, trackType, plannedPages, achievedPages, completionRate, qualityRate, plannedRanges[], approvedSegments[], gaps[], outsidePlanSegments[]}` مطابقاً للبنية في §12.

### 3.4 إعادة توزيع الأوزان — `weight-redistribution.ts` (§6)
- المسارات الموجودة من **الخطة المعتمدة** لذلك اليوم (لا من الإنجاز).
- `academic_weight = 100 − ethics_weight`؛ `effective = base ÷ Σ(base للمسارات المخطّطة) × academic_weight`. الأخلاق لا يُعاد توزيعها. حالة "لا خطة" §6.3.

### 3.5 حساب الدرجات — `scoring.ts` (§16–§19)
- `track_score = effective_weight × completion/100 × quality/100` (§16).
- `overall_plan_completion_rate = Σ(effective×completion) ÷ academic_weight` (§17).
- `ethics_score = ethics_weight × ethics_rating ÷ 5` (§18).
- `total_score = Σ track_scores + ethics_score`، حد أعلى 100 (§19).
- **قواعد الحضور §20:** present/late عادي؛ absent/excused → كل شيء 0؛ `missing_attendance` → `total_score = NULL` + تنبيه؛ `non_working_day` على مستوى اليوم.

---

## 4. المرحلة 3 — الخدمات وواجهات API ✅ (المسار المباشر Live مُنفَّذ)

> **حالة التنفيذ:** `DailyReportService` (حساب Live مجمّع batched) + `DailyReportController` بالـ endpointين للعرض، مربوطة في `DailyReportsModule` (يستورد `HalaqatModule` للحراس). `pnpm run build` نظيف؛ **601 اختبار** يعبر (منها 6 لخدمة التقرير: يوم غير دراسي/حاضر بخطة/حضور مفقود/غائب/بلا خطة/404). lint نظيف.
> - **قرار مسار:** الحارس `HalaqaAccessGuard` يقرأ `req.params.id` → المسار **`/halaqat/:id/daily-report`** (وليس `:halaqaId`). الاستجابة تُعيد `halaqa_id`.
> - **قرار casing:** حقول الاستجابة **snake_case** (اتساق مع halaqat/students/achievements)؛ يبقى JSON المطابقة الداخلي camelCase كما هو مخزَّن (§12).
> - **الحضور:** استعلام مباشر على `student_attendances` (لا `findForStudentOnDate` التي تُرجع present-افتراضياً) للتمييز الصحيح لـ `missing_attendance`.
> - **العضوية:** `student_halaqa_enrollments` بشرط §8.2 + `status='active'` (دقيق للـ Live؛ الدقة التاريخية الكاملة تنتظر تعبئة الجدول في المرحلة 5).
> - **مؤجَّل:** خدمة/كرون الـ Snapshot و`source:'snapshot'` (المرحلة 4)؛ endpoint إعادة الاحتساب §29.3 (المرحلة 4/5، يشارك كود التخزين)؛ حالياً `source` دائماً `live`. تصدير `docs/openapi.json` يحتاج قاعدة حيّة (`pnpm docs:export`).

### 4.1 وحدة جديدة `modules/daily-reports/`
- `DailyReportService` — الحساب المباشر (Live) ليوم/حلقة: يجمع العضوية (§8.2) + الحضور + الخطط المعتمدة + الإنجازات المعتمدة، ويستدعي خدمات المرحلة 2، ويبني الاستجابة.
- منطق **المصدر**: تاريخ ضمن الأسبوع الحالي → Live؛ خارجه → Snapshot من قاعدة البيانات؛ حقل `source: "live"|"snapshot"` (§29.1). غياب Snapshot لتاريخ قديم → خطأ واضح لا بيانات حالية صامتة (§28.3).

### 4.2 الـ Endpoints (§29)
| Method | Route | الحارس/الصلاحية |
|---|---|---|
| `GET` | `/halaqat/:halaqaId/daily-report?date=YYYY-MM-DD` | `HalaqaAccessGuard` + `@RequiresHalaqaPermission('read')` |
| `GET` | `/halaqat/:halaqaId/daily-report/:date/students/:studentId` | كسابقه (تفاصيل §29.2) |
| `POST` | `/halaqat/:halaqaId/daily-reports/:date/recalculate` | `HalaqaEditAccessGuard` + `@RequiresHalaqaPermission('write')` + `@Audit('daily_report.recalculate')` |

- **الصلاحيات §30:** محفّظ/مشرف/مدير عبر `@Roles(...)` + حراس الحلقة القائمة؛ تعديل الأوزان لمدير المدرسة فقط.
- **تحذير الحارس:** حراس الحلقة الحاليون يقرؤون `req.params.id`؛ المسارات هنا تستخدم `:halaqaId` → يلزم إمّا مواءمة اسم الـ param أو تمرير صريح (يُحسم عند التنفيذ، بلا تغيير سلوك الحراس).

### 4.3 لقطة الاستجابة
مطابقة لـ §29.1 (halaqaId, date, source, dayStatus, reportStatus, weights, students[]) و§29.2 للتفاصيل. كل النسب/الدرجات بمنزلتين عشريتين.

---

## 5. المرحلة 4 — Snapshot الأسبوعي (§28.2) ✅ (مُنفَّذة)

> **حالة التنفيذ:** طبقة التخزين + القراءة + الكرون + إعادة الاحتساب.
> - **`persistDay`** (في `DailyReportService`): يحسب اليوم ويكتب رأس التقرير + صفوف الطلاب في transaction، **يستبدل التقرير القائم في مكانه** (تحديث `recalculated_at/by/reason`، حذف صفوف الطلاب القديمة، لا نسخة ثانية §28.4)؛ يعالج `non_working_day` و`partial` (حضور مفقود). لقطة الأوزان + `calculation_details` JSON + `CALCULATION_VERSION`.
> - **قراءة Snapshot:** `getDailyReport` للتواريخ قبل `currentWeekStart()` يجلب من الجداول المحفوظة (`source:'snapshot'`)؛ الأسبوع الحالي دائماً Live؛ وإن لم يوجد Snapshot لتاريخ قديم يعيد حساباً Live مؤقتاً (لأن بيانات المصدر سليمة وقابلة للإنتاج).
> - **الكرون:** `DailyReportSnapshotCron` بـ `@Cron('0 1 * * 6')` (السبت 01:00 UTC) → `persistWeek(previousWeekStart)` على كل حلقة نشطة × 7 أيام، مع **عزل الأخطاء** (فشل يوم لا يوقف البقية) وتسجيلها.
> - **إعادة الاحتساب:** `POST /halaqat/:id/daily-reports/:date/recalculate` (`HalaqaEditAccessGuard` + `write` + `@Roles(principal/vice_principal/supervisor)` + `@Audit('daily_report.recalculate')`) → `recalculateDay` → `persistDay`.
> - **التحقق:** build نظيف؛ **607 اختبار** (منها اختبارات persist/snapshot/recalc/عزل فشل الكرون)؛ lint نظيف.
> - **مؤجَّل للمرحلة 5:** الربط التلقائي لإعادة الاحتساب عند تعديل بيانات تاريخية (الحضور/الخطة/الإنجاز)، وتعبئة `student_halaqa_enrollments` من عمليات العضوية الجارية.

- `DailyReportSnapshotCron` بـ `@Cron` (نمط `halaqa-cron.service.ts`)؛ لكل حلقة ولكل يوم من الأسبوع المنتهي: حساب + حفظ رأس التقرير + صف لكل طالب كان عضواً ذلك اليوم؛ معالجة `non_working_day` (§21) و`missing_attendance` (§20.2) و`partial`؛ تسجيل الأخطاء وإعادة المحاولة. **لا Queue** — تنفيذ set-based داخل الـ cron (نمط `overdue-cron`)، مع مراعاة عدم حجب الطلبات (يعمل في الخلفية).
- توقيت التشغيل والمنطقة الزمنية مرهونان بالقرار 6.

---

## 6. المرحلة 5 — إعادة الاحتساب التاريخي (§28.4) ✅ (النواة مُنفَّذة)

> **حالة التنفيذ:**
> - **ناقل أحداث محايد** `DomainEvents` (`common/events/domain-events.ts`، وحدة `@Global` بلا تبعيات) — يكسر التبعية الدائرية: الوحدات المحرِّرة تبعث حدثاً دون استيراد وحدة التقارير.
> - **`HistoricalRecalcListener`** (في وحدة التقارير): يستمع، يحدّد الحلقات التي لديها **Snapshot محفوظ** لذلك التاريخ (عبر `halaqaId` مباشرة أو باستنتاجها من صفوف الطالب المحفوظة)، ويعيد احتسابها بـ `persistDay` مع سبب `auto: source data changed`. أيام الأسبوع الحالي (بلا snapshot) تُتجاهَل (فهي Live أصلاً). المعالج يبتلع أخطاءه فلا يكسر الطلب الأصلي.
> - **باعث الإنجازات:** `AchievementsService` يبعث `report.source-changed {studentId, halaqaId, date}` بعد المطابقة في create/softDelete/approve/unapprove.
> - **تعبئة `student_halaqa_enrollments`:** `StudentEnrollmentService` يكتب فترات العضوية (dual-write): enroll → فترة مفتوحة؛ remove → إغلاق (completed/archived)؛ transfer → إغلاق القديمة (transferred) + فتح جديدة.
> - **بواعث المصادر — مكتملة الآن:**
>   - `AchievementsService`: create/softDelete/approve/unapprove.
>   - `StudentAttendanceService.correct`: يبعث `{studentId, date}` عند تغيّر الحالة/الأخلاق/الملاحظة (+ أُضيف التقاط `daily_note` في DTO/الخدمة — §22).
>   - `WeeklyPlansService`: approve/unapprove/hardDelete يبعث لكل يوم فيه عناصر.
>   - `PlanItemsService.updateItem`: يبعث لليوم (واليوم القديم إن تغيّر) عند تعديل عنصر في خطة **معتمدة**؛ ويحسب `start/end_global_ayah` + `planned_pages` عند create/update (§10.2/§32).
> - **التحقق:** `nest build` نظيف؛ **613 اختبار**؛ lint نظيف على كل الملفات الجديدة/المعدّلة (عدا خطأ lint واحد **موجود مسبقاً** في `weekly-plans.service.ts:260` بمعالجة `QueryFailedError` القديمة، غير متعلق بهذا العمل).
> - **ملاحظة `planned_pages`:** الصفوف القائمة تبقى 0/NULL حتى أول تعديل؛ لا يؤثر ذلك على صحة التقرير لأن الحساب المباشر يشتق الصفحات من النطاقات لا من العمود المخزَّن.

- `DailyReportRecalcService.recalculateDay(halaqaId, date, reason, actor)` — يعيد بناء رأس التقرير وصفوفه ويستبدلها (لا نسخة ثانية §28.4/§25)، يحدّث `recalculated_at/by/reason`، ويكتب Audit Log.
- **ربط المصادر:** استدعاء إعادة الاحتساب من خدمات الحضور/الأخلاق/الملاحظة/الخطة/الإنجاز/الاعتماد/المواضع عند تعديل تاريخ خارج الأسبوع الحالي (§28.4). يتم عبر Services لا كتابة مباشرة (§28.4 الفقرة الأخيرة).
- endpoint إعادة الاحتساب اليدوي (§29.3) يستدعي نفس الخدمة.

---

## 7. خطة الاختبار (§33)

- **وحدة (نقية):** الحالات 1–9 (إعادة التوزيع بكل التركيبات، إنجاز جزئي/زائد، الفجوة، التداخل بتقييمين، خارج الخطة، قاسم <1 صفحة).
- **حضور:** 10–14 (غائب/بعذر/حضور مفقود/يوم غير دراسي/متأخر).
- **دورة الحياة:** 15 (تعديل أسبوع قديم يستبدل Snapshot).
- **العرض:** 16 (منزلتان عشريتان).
- **تطابق الصفحات:** golden vectors backend↔frontend (§9، §36).
- **Migrations:** `up` و`down` على قاعدة نظيفة، وتحديث `docs/openapi.json` (`pnpm docs:export`).

---

## 8. جرد الملفات (جديد/معدّل)

| النوع | مسارات |
|---|---|
| Migrations (6) | `migrations/17800000000{00..05}-*.ts` |
| Entities جديدة | `student-halaqa-enrollment.entity.ts`, `daily-halaqa-report.entity.ts`, `daily-student-evaluation.entity.ts` |
| Entities معدّلة | `halaqa.entity.ts`, `student-attendance.entity.ts`, `weekly-plan-item.entity.ts` |
| Quran | `src/quran/data/quran-structure.json`, `page-coverage.ts`, `range-union.ts`, `rounding.ts` (+ specs) |
| وحدة التقارير | `modules/daily-reports/` (module, controller, `DailyReportService`, `DailyReconciliationService`, `weight-redistribution.ts`, `scoring.ts`, `DailyReportSnapshotCron`, `DailyReportRecalcService`, DTOs/mappers, specs) |
| DTOs/خدمات معدّلة | `report-weights.dto.ts` (جديد)، `create/update-halaqa.dto.ts`، `halaqa.responses.ts`، `halaqat.service.ts`، DTO/خدمة الحضور |
| ربط | `app.module.ts` / وحدات ذات صلة |

---

## 9. الترتيب والمخاطر

- **الترتيب:** المرحلة 1 (DB) → 2 (منطق + اختبارات تطابق) → 3 (خدمات/APIs) → 4 (Snapshot) → 5 (إعادة الاحتساب). كل مرحلة قابلة للدمج مستقلة.
- **أعلى المخاطر:** انحراف منطق الصفحات عن الفرونت (يخفَّف بـ golden vectors)؛ المنطقة الزمنية/حدود الأسبوع (القرار 6)؛ backfill العضوية (القرار 8).
- **الحجم التقديري:** ~6 migrations، ~3 entities جديدة، وحدة خدمات كاملة، 3 endpoints، cron، خدمة إعادة احتساب + ربطها بعدة خدمات قائمة — عمل كبير على عدة دفعات.

---

## المراجع
- المواصفة: `../../halaqa_daily_evaluation_report_spec.md`
- تقرير الفرونت: `../../halaqa_daily_evaluation_report_frontend_notes.md`
- منطق الفرونت المرجعي: `halaqa-frontend/app/composables/useVerseToPage.ts`, `app/utils/quran-structure.ts`, `app/utils/quran.ts`, `app/utils/score.ts`
