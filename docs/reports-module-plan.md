# خطة تنفيذ — موديول التقارير (Backend)

وثيقة تخطيط لموديول **التقارير** `modules/reports/`: تعميم تقرير التقييم اليومي القائم إلى
**مؤشر الأداء العام** على أربعة مستويات، واشتقاق ثلاثة تقارير جزئية منه، مع إدراج
**محتوى المصحف** (السور والآيات والصفحات والأجزاء) في الردود لا الأرقام المجرّدة فقط.

> **حالة الوثيقة:** خطة للمراجعة والموافقة — **لم يُكتب أي كود بعد**.
> مبنية على مراجعة فعلية للكود القائم بتاريخ 2026-07-30، وعلى قرارات المالك في §2.

---

## 0. الغاية والنطاق

**داخل النطاق:** أربعة أنواع تقارير × أربعة مستويات × مدى زمني حر، مع كتلة مصحفية في كل رد،
ووحدات بالصفحات والأجزاء.

**خارج النطاق (مؤجَّل):** التصدير PDF/Excel، جداول تجميع مادية (materialized aggregates)،
إعادة توحيد Dashboard فوق طبقة التجميع الجديدة، المقارنة بين الفترات (period-over-period).

---

## 1. الوضع الحالي وتحليل الفجوة

| المكوّن | الموجود اليوم | ما يطلبه الموديول الجديد | الفجوة |
|---|---|---|---|
| التقرير اليومي | `GET /halaqat/:id/daily-report?date=` — **يوم واحد، حلقة واحدة** (`daily-report.controller.ts`) | نفس المحتوى على **مدى زمني** و**أربعة مستويات** | طبقة تجميع جديدة فوق ما هو مخزّن |
| التخزين | `daily_halaqa_reports` + `daily_student_evaluations` بأعمدة رقمية جاهزة لكل مسار | كما هي — تُقرأ ولا تُعدَّل | **لا جداول جديدة** في v1 |
| العضوية التاريخية | `student_halaqa_enrollments` (start/end date) ✅ | نسبة كل يوم للحلقة التي كان فيها الطالب ذلك اليوم | ✅ محلولة أصلاً |
| حساب الصفحات | `pageCoverage` / `pagesRecited` في `src/quran/page-coverage.ts` (مطابق للفرونت، 604 صفحة) | كما هو + **رقم الصفحة** لا التغطية الكسرية فقط | `pageForGlobal` و`pageBounds` **خاصّتان** — تحتاجان تصديراً |
| الأجزاء | `juzStarts` (30 مدخلاً) في `data/quran-structure.json` — **غير مستخدم إطلاقاً** | تحويل الأرقام إلى أجزاء + تحديد الأجزاء المشمولة | ملف مولَّد + دوال جديدة |
| أسماء السور | `SURAH_NAMES_AR` معرّف في `quran.constants.ts` — **غير مستهلك في أي مكان** | عرض «البقرة 5 — 20» في الردود | مُنسِّق نصّي جديد |
| دمج المدايات | `unionIntervals` / `unionPageCoverage` / `subtractIntervals` في `range-union.ts` ✅ | دمج إنجازات الفترة وإزالة التكرار، واستخراج الفجوات | ✅ جاهزة، تُعاد استخدامها كما هي |
| مدايات الخطة والفجوات | مخزّنة في `*_reconciliation` JSON (`plannedRanges` / `approvedSegments` / `gaps` / `outsidePlanSegments`) ✅ | تُقرأ وتُعرض كنص مصحفي | ✅ البيانات موجودة، ينقص العرض |
| النطاق حسب الدور | `DashboardScopeService` + `HalaqaAccessGuard` | نفس المنطق + **ولي الأمر** | خدمة نطاق موسَّعة |
| حضور المعلمين | `teacher_attendances` | قسم مستقل في تقرير الحضور | استعلام جديد |
| Snapshot | **أسبوعي** (السبت 01:00 UTC) — الأسبوع الحالي يُحسب live | مدى شهري لمدرسة كاملة | خطر أداء — §11.1 |

**أساسات نستفيد منها كما هي:** `@Roles` / `HalaqaAccessGuard` / `@RequiresHalaqaPermission`،
مغلّف الاستجابة العام (`ResponseInterceptor`) وأسلوب DTOs بـ `@ApiProperty`، `roundHalfUp`،
حساب الصفحات وأدوات المدايات، أعمدة التقييم اليومي المفهرسة.

---

## 2. القرارات المحسومة ✅

1. ✅ **التسمية.** التقرير القائم يصبح مفهومياً **«مؤشر الأداء العام»**، وتُشتق منه ثلاثة تقارير:
   الإنجاز فقط، الإنجاز مقابل الخطة، الحضور فقط.
2. ✅ **المستويات الأربعة كلها:** طالب، حلقة، مشرف، مدرسة.
3. ✅ **التجميع الزمني = Σ المُنجز ÷ Σ المخطط** — لا متوسط النِسب اليومية.
   (المثال المعتمد: يوم 2/4 ويوم 1/1 → **60%** لا 75%.) لا يجوز أبداً أخذ متوسط أعمدة
   `*_completion_rate`؛ تُجمع `*_planned_pages` و`*_achieved_pages` أولاً ثم تُقسم.
4. ✅ **ولي الأمر** يرى التقارير الأربعة **لأبنائه فقط** وعلى **مستوى الطالب حصراً**.
5. ✅ **تقرير الحضور يشمل حضور المعلمين** كقسم مستقل، **محجوب عن دور المعلم**.
6. ✅ **`ethics_rating` خارج تقرير الحضور** — يبقى ضمن مؤشر الأداء العام فقط.
7. ✅ **المسار القديم يبقى** كما هو (`/halaqat/:id/daily-report`)، و`/reports/*` يُضاف بجانبه.
   لا كسر للفرونت الحالي.
8. ✅ **محتوى المصحف في كل رد** — لا أرقام مجرّدة (طلب المالك، هذه الوثيقة).
9. ✅ **الوحدات: الصفحات والأجزاء** في كل الأرقام الكمّية (طلب المالك، §3).
10. ✅ **لا جداول جديدة في v1.** التجميع على الطاير من الجداول القائمة، مع سقف زمني.

---

## 3. نموذج الوحدات — الصفحات والأجزاء

هذا القسم هو أهم ما في الخطة، لأن الخلط بين المفهومين التاليين يُنتج أرقاماً تبدو صحيحة وهي خاطئة.

### 3.1 مفهومان مختلفان — لا يُخلطان

| | **موقع فعلي في المصحف** | **تحويل وحدة** |
|---|---|---|
| متى | حين نملك **مدىً محدداً** (إنجاز، بند خطة، فجوة) | حين نملك **مجموعاً رقمياً** فقط (مجموع صفحات حلقة في شهر) |
| الصفحات | أرقام صفحات حقيقية: `من 3 إلى 11` | عدد كسري: `84.25 صفحة` |
| الأجزاء | أرقام أجزاء حقيقية: `[1, 2]` | مكافئ كسري: `4.18 جزءاً` |
| الحقل | `page_range` / `juz_touched` | `pages` / `juz_equivalent` |

### 3.2 الصيغ

- **تغطية الصفحات (كسرية):** `pageCoverage(range)` القائمة — نصيب كل صفحة = (آيات المدى فيها ÷ آيات الصفحة).
  لا تتغيّر، وتبقى محكومة باختبار المطابقة مع الفرونت (`page-coverage.parity.spec.ts`).
- **رقم الصفحة (صحيح):** `pageForGlobal(global)` — موجودة لكنها `private`؛ تُصدَّر.
- **الصفحات الملموسة (صحيح):** `pages_touched = last_page − first_page + 1` — تختلف عن التغطية الكسرية،
  وتُعرض بجانبها لا بدلاً منها.
- **مكافئ الأجزاء:** `juz_equivalent = pages ÷ (604 ÷ 30)` أي **÷ 20.1333**.
  اخترنا 604/30 لا 20 المتعارف عليها كي يعطي المصحف كاملاً **30.00** بالضبط لا 30.2.
- **الأجزاء المشمولة:** من `juzStarts` عبر بحث ثنائي على الفهرس العالمي — أرقام أجزاء حقيقية.

### 3.3 التكرار — رقمان لا رقم واحد

المراجعة (Near / Far) تُعيد نفس المدى مراراً. لذلك كل كتلة مصحفية تعرض:

- **`pages_recited`** = **مجموع** تغطيات الإنجازات (يشمل التكرار) → يقيس **الجهد**.
- **`pages_unique`** = تغطية **اتحاد** المدايات بعد دمج التداخل (`unionPageCoverage`) → يقيس **التغطية الفعلية من المصحف**.

للحفظ الجديد (Hifz) يتقاربان عادةً؛ للمراجعة يفترقان كثيراً، وهذا مقصود ويُوثَّق في الـ API.

### 3.4 التقريب

`roundHalfUp` القائمة: الصفحات والأجزاء **منزلتان عشريتان**، النِسب المئوية **منزلتان**،
أرقام الصفحات والأجزاء **أعداد صحيحة**. التقريب عند العرض النهائي فقط.

---

## 4. طبقة المصحف الجديدة

### 4.1 `src/quran/quran-juz-starts.ts` (مولَّد)

على نمط `quran-page-starts.ts` تماماً: `export const JUZ_STARTS: readonly string[]` بـ 30 مدخلاً،
مولَّد من `data/quran-structure.json` (`juzStarts`)، بترويسة «لا تُحرَّر يدوياً».

### 4.2 `src/quran/quran-locator.ts` (جديد)

الوحدة الوحيدة التي تعرف كيف يُترجم المدى إلى لغة المصحف:

| الدالة | الوظيفة |
|---|---|
| `pageOf(surah, verse): number` | رقم الصفحة (1..604) |
| `pageRangeOf(range): { from, to, count }` | أول وآخر صفحة + عدد الصفحات الملموسة |
| `juzOf(surah, verse): number` | رقم الجزء (1..30) |
| `juzRangeOf(range): number[]` | الأجزاء المشمولة بالترتيب |
| `pagesToJuz(pages): number` | تحويل الوحدة (÷ 20.1333) |
| `juzPageExtents(): {juz, pages}[]` | امتداد كل جزء بالصفحات — لتوزيع `juz_breakdown` |
| `surahName(surah, lang): string` | من `SURAH_NAMES_AR` / `SURAH_NAMES_EN` |
| `formatRange(range): string` | «البقرة 5 — 20» أو عبر السور «البقرة 255 — آل عمران 10» |
| `describeRange(range): MushafSegment` | الكتلة الكاملة: من/إلى/تسمية/صفحات/أجزاء |

**تغيير مطلوب على ملف قائم:** تصدير `pageForGlobal` و`pageBounds` من `page-coverage.ts`
(حالياً خاصّتان) بدل تكرارهما — التكرار يكسر ضمانة المطابقة مع الفرونت.

### 4.3 شكل `MushafSegment` الموحّد

```jsonc
{
  "from":  { "surah": 2, "surah_name": "البقرة", "verse": 1,   "page": 2  },
  "to":    { "surah": 2, "surah_name": "البقرة", "verse": 141, "page": 21 },
  "label": "البقرة 1 — 141",
  "pages": 19.60,          // تغطية كسرية
  "pages_touched": 20,     // صفحات ملموسة (صحيح)
  "juz": [1, 2]
}
```

هذا الشكل **واحد** في كل التقارير: إنجاز، بند خطة، فجوة، ما وقع خارج الخطة.

---

## 5. أنواع التقارير الأربعة ومصادرها

| التقرير | المسار | المصدر | الكتلة المصحفية تعرض |
|---|---|---|---|
| مؤشر الأداء العام | `GET /reports/performance` | `daily_student_evaluations` (+ live لليوم الحالي) | ما أُنجز بعد المطابقة، لكل مسار |
| الإنجاز فقط | `GET /reports/achievements` | جدول `achievements` المعتمدة مباشرةً | كل ما سُمِّع فعلاً — **يشمل ما خارج الخطة** |
| الإنجاز مقابل الخطة | `GET /reports/plan` | `weekly_plan_items` + `*_reconciliation` | المخطط / المُنجز / **الفجوات** / خارج الخطة |
| الحضور فقط | `GET /reports/attendance` | `student_attendances` + `teacher_attendances` + `school_schedules` + `holidays` | — (لا كتلة مصحفية) |

### 5.1 تبعة يجب توثيقها صراحةً في الـ API

`achievements.pages_recited` سيكون **≥** نظيره في `performance` / `plan`، لأن الأول يشمل ما أُنجز
خارج الخطة والثاني محسوب بعد المطابقة معها. الفرق **مقصود**، وإن لم يُوثَّق سيُبلَّغ عنه كخطأ.
يُضاف حقل صريح `outside_plan_pages` في تقرير الخطة يفسّر الفارق عددياً.

---

## 6. المستويات والصفوف والصلاحيات

### 6.1 قاعدة الصفوف — كل تقرير يعرض المستوى الأدنى مباشرة

| `level` | كل صف يمثل | الكتلة المصحفية |
|---|---|---|
| `student` | يوماً (أو أسبوعاً/شهراً حسب `group_by`) | **تفصيلية** — مدايات مسمّاة |
| `halaqa` | طالباً | مختصرة لكل طالب + `juz_breakdown` للحلقة |
| `supervisor` | حلقة | `juz_breakdown` فقط |
| `school` | حلقة | `juz_breakdown` فقط |

**السبب:** عرض مدايات خام على مستوى المدرسة لشهر = عشرات الآلاف من المقاطع. لذلك التفصيل
المصحفي الكامل **حصراً** على مستوى الطالب؛ وفوقه توزيع على الأجزاء الثلاثين.

### 6.2 مصفوفة الصلاحيات

| الدور | المستويات المتاحة | ملاحظات |
|---|---|---|
| `principal` / `vice_principal` | الأربعة | المدرسة كاملة |
| `supervisor` | طالب/حلقة/مشرف | حلقاته المُشرَف عليها فقط |
| `teacher` | طالب/حلقة | حلقاته المُسنَدة فقط + **قسم حضور المعلمين محجوب** |
| `parent` | **طالب فقط** | أبناؤه المرتبطون به حصراً |

خارج النطاق ⇒ نتيجة فارغة/أصفار (نمط Dashboard)، عدا مستوى الطالب المحدد صراحةً ⇒ **404**
(نمط `HalaqaAccessGuard`، حتى لا يتسرّب وجود الطالب).

---

## 7. عقد الـ API

### 7.1 بارامترات موحّدة للأربعة

| البارامتر | القيم | الافتراضي |
|---|---|---|
| `level` | `student` \| `halaqa` \| `supervisor` \| `school` | مطلوب |
| `id` | مُعرِّف الكيان | مطلوب لغير `school` |
| `from` / `to` | `YYYY-MM-DD` | مطلوبان، بحد أقصى **366 يوماً** |
| `group_by` | `none` \| `day` \| `week` \| `month` | `none` |
| `track` | `Hifz` \| `Near` \| `Far` \| `all` | `all` |
| `include_mushaf` | `boolean` | `true` على مستوى الطالب، `false` فوقه |

### 7.2 هيكل الرد الموحّد

```jsonc
{
  "report_type": "plan",
  "level": "student",
  "scope":  { "id": 55, "name": "محمد علي", "halaqa": { "id": 10, "name": "حلقة الفرقان" } },
  "period": { "from": "2026-07-01", "to": "2026-07-31", "working_days": 22, "counted_days": 20 },
  "summary": { /* أرقام الفترة كاملة — Σ÷Σ */ },
  "rows":    [ /* حسب §6.1 */ ],
  "series":  [ /* فقط عند group_by ≠ none */ ],
  "meta":    { "source": "mixed", "weights_changed": false, "truncated": false }
}
```

### 7.3 مثال — `GET /reports/plan?level=student&id=55&from=2026-07-01&to=2026-07-31`

```jsonc
{
  "summary": {
    "planned_pages": 42.50,
    "achieved_pages": 31.20,
    "plan_completion_rate": 73.41,          // 31.20 ÷ 42.50 — Σ÷Σ لا متوسط يومي
    "outside_plan_pages": 4.80,
    "planned_juz_equivalent": 2.11,
    "achieved_juz_equivalent": 1.55,
    "items": { "completed": 12, "partial": 5, "overdue": 3, "due": 1 }
  },
  "mushaf": {
    "planned": [
      { "label": "البقرة 1 — 141", "pages": 19.60, "juz": [1, 2],
        "from": { "surah": 2, "surah_name": "البقرة", "verse": 1, "page": 2 },
        "to":   { "surah": 2, "surah_name": "البقرة", "verse": 141, "page": 21 } }
    ],
    "achieved": [ /* نفس الشكل */ ],
    "gaps": [
      { "label": "البقرة 100 — 141", "pages": 5.80, "juz": [1],
        "from": { "surah": 2, "surah_name": "البقرة", "verse": 100, "page": 15 },
        "to":   { "surah": 2, "surah_name": "البقرة", "verse": 141, "page": 21 } }
    ],
    "outside_plan": [ /* نفس الشكل */ ]
  }
}
```

الفجوات (`gaps`) هي أثمن ما في هذا التقرير: **«لم يُنجز من البقرة 100 إلى 141»** بدل «73%».

### 7.4 مثال — الكتلة المصحفية على مستوى مُجمَّع

```jsonc
"mushaf": {
  "pages_recited": 1240.50,
  "pages_unique":  612.30,
  "juz_equivalent": 30.42,
  "juz_breakdown": [ { "juz": 1, "pages": 84.20 }, { "juz": 2, "pages": 61.75 } ]
}
```

### 7.5 مثال — تقرير الحضور

```jsonc
{
  "summary": {
    "students": { "present": 380, "late": 22, "absent": 31, "excused": 14,
                  "missing_attendance": 3, "attendance_rate": 89.62 },
    "teachers": { "present": 40, "absent": 2, "attendance_rate": 95.24 }   // null لدور المعلم
  }
}
```

`missing_attendance` حالة مشتقّة من التقرير لا قيمة في `student_attendances`؛ تُعرض هنا صراحةً
لكنها **تُستبعد من مقام** `attendance_rate`، ولا تُخلط بالغياب.

---

## 8. دلالات التجميع — حالات الحافة

1. **النِسب:** Σ÷Σ دائماً (قرار §2.3). المقام صفر ⇒ `null` لا `0`.
2. **متوسط الدرجات:** يُستبعد `total_score = NULL` (أي `missing_attendance`) من البسط والمقام.
3. **الأيام:** `day_status = non_working_day` والعطل تُستبعد من كل المقامات.
4. **الأوزان:** ملقوطة لكل يوم على `daily_halaqa_reports`. إن اختلفت داخل الفترة ⇒ `meta.weights_changed = true`
   وتُعرض الأوزان كمدى لا كقيمة واحدة.
5. **الطالب المنقول:** النسبة للحلقة تأتي من `daily_halaqa_reports.halaqa_id` لليوم المخزَّن،
   ومن `student_halaqa_enrollments` للأيام الحيّة — لا من الحلقة الحالية.
6. **الطالب/المستخدم المحذوف (soft delete):** يظهر في التقارير التاريخية بعَلَم `inactive`، لا يُحذف من الماضي.
   القطع بتاريخ الحذف: تُحتسب أيامه السابقة لـ `deleted_at` فقط، وتُستبعد أيام الحذف وما بعده
   (صف الحضور الذي أنشأه الـ seed صباح يوم الحذف يُستبعد حتى لا يرفع النسبة زوراً).
   القاعدة مصدرها واحد — `activeStudentAttendance()` / `activeStaffAttendance()` في
   `src/modules/attendance/attendance-visibility.sql.ts` — تُستخدم حرفياً في كل استعلام تجميع،
   كما تفعل شاشات الحضور و Dashboard. الاسترجاع (restore) يمسح `deleted_at` فتعود كل الصفوف.
7. **الاتحاد لا الجمع:** `pages_unique` يُحسب باتحاد المدايات (`unionIntervals`) لا بجمع الصفحات.

---

## 9. المراحل والتنفيذ

### المرحلة 1 — طبقة المصحف (مستقلة تماماً، قابلة للاختبار وحدها)
- `src/quran/quran-juz-starts.ts` (مولَّد) + سكربت التوليد.
- `src/quran/quran-locator.ts` بكل دوال §4.2.
- تصدير `pageForGlobal` / `pageBounds` من `page-coverage.ts`.
- اختبارات: حدود الأجزاء الثلاثين، المصحف كاملاً = 30.00 جزءاً و604 صفحة، مدايات عابرة للسور.

### المرحلة 2 — النواة المشتركة
- `ReportsScopeService` — النطاق حسب الدور شاملاً **ولي الأمر** (يُعاد استخدام منطق `DashboardScopeService`).
- `ReportsAggregationService` — Σ÷Σ، استبعاد العطل و`missing_attendance`، سقف 366 يوماً.
- `MushafPresenter` — يحوّل أي `VerseRangeLike[]` إلى `MushafSegment[]` مدموجة.
- DTOs مشتركة: `ReportQuery`، `MushafSegmentDto`، `PeriodDto`، `ReportMetaDto`.

### المرحلة 3 — `GET /reports/performance` بالمستويات الأربعة
المسار الحرج: يثبت شكل الرد والنطاق والتجميع قبل تكرارها ثلاث مرات.

### المرحلة 4 — `GET /reports/achievements` و `GET /reports/plan`
هنا تظهر الكتلة المصحفية بأقصى قيمتها (الفجوات، وما خارج الخطة).

### المرحلة 5 — `GET /reports/attendance`
طلاب + معلمون، مع حجب قسم المعلمين عن دور المعلم.

### المرحلة 6 — الإنهاء
`pnpm run lint` + `pnpm run test` + `pnpm run docs:export`، ووصف Swagger يشرح صراحةً
الفرق بين `pages_recited` و`pages_unique`، وبين أرقام `achievements` و`plan` (§5.1).

### جرد الملفات

**جديدة:**
```
src/quran/quran-juz-starts.ts            (مولَّد)
src/quran/quran-locator.ts
src/quran/quran-locator.spec.ts
src/modules/reports/reports.module.ts
src/modules/reports/controllers/reports.controller.ts
src/modules/reports/services/reports-scope.service.ts
src/modules/reports/services/reports-aggregation.service.ts
src/modules/reports/services/performance-report.service.ts
src/modules/reports/services/achievements-report.service.ts
src/modules/reports/services/plan-report.service.ts
src/modules/reports/services/attendance-report.service.ts
src/modules/reports/presenters/mushaf.presenter.ts
src/modules/reports/dto/report.query.ts
src/modules/reports/dto/report.responses.ts
src/modules/reports/dto/mushaf.dto.ts
(+ ملفات .spec.ts للخدمات الحسابية)
```

**معدَّلة:**
```
src/quran/page-coverage.ts        (تصدير pageForGlobal / pageBounds — لا تغيير سلوكي)
src/app.module.ts                 (تسجيل ReportsModule)
docs/openapi.json                 (مولَّد)
```

**بلا مساس:** `modules/daily-reports/` كاملاً، `modules/dashboard/`، أي migration، أي entity.
**لا migrations في v1.**

---

## 10. خطة الاختبار

| الطبقة | ما يُختبر |
|---|---|
| `quran-locator` | حدود الأجزاء 30، المصحف كاملاً = 30.00 جزءاً، مدى عابر لسورتين، مدى داخل صفحة واحدة |
| التجميع | **اختبار المثال المعتمد:** يوم 2/4 + يوم 1/1 ⇒ **60%** لا 75% |
| التجميع | مقام صفر ⇒ `null`؛ `missing_attendance` مستبعد؛ يوم عطلة مستبعد |
| الاتحاد | ثلاثة إنجازات متداخلة ⇒ `pages_recited > pages_unique` بالفارق الصحيح |
| النطاق | ولي أمر يطلب طالباً ليس ابنه ⇒ 404؛ معلم يطلب `level=school` ⇒ فارغ؛ معلم يطلب حضور المعلمين ⇒ `null` |
| التكافؤ | `/reports/performance?level=halaqa&from=X&to=X` (يوم واحد) **يطابق رقمياً** `/halaqat/:id/daily-report?date=X` — ضمانة عدم انحراف الرقمين |

اختبار التكافؤ الأخير هو صمام الأمان الأهم في الخطة كلها.

---

## 11. المخاطر والقرارات المؤجَّلة

### 11.1 🚦 الأداء — الـ Snapshot أسبوعي
`daily-report-snapshot.cron.ts` يعمل السبت 01:00 UTC، فالأسبوع الحالي كله **يُحسب live**.
تقرير شهري لمدرسة كاملة = حساب حيّ لسبعة أيام × كل الحلقات في الطلب الواحد.
**المقترح:** تحويل اللقطة إلى **يومية** (كل ليلة ليوم أمس) مع إبقاء الأسبوعية شبكة أمان، فيبقى
«اليوم الحالي» وحده حيّاً. **القرار مؤجَّل:** يُبنى بدونه أولاً ثم يُقاس على بيانات حقيقية.

### 11.2 🚦 ازدواج المنطق مع Dashboard
`GET /dashboard/halaqat` يُخرج اليوم نِسب حضور ومعدل درجات بمنطقه المستقل. بعد اكتمال التقارير
يجب أن يقرأ من `ReportsAggregationService` نفسها، وإلا فرقمان مختلفان لنفس المؤشر في شاشتين.
**خارج نطاق v1** عمداً حتى لا يتضخّم التغيير.

### 11.3 حجم الرد
مستوى الطالب لسنة كاملة قد يُنتج مئات المقاطع المصحفية. **السقف:** 500 مقطع لكل كتلة،
مع `meta.truncated = true` — لا اقتطاع صامت.

### 11.4 مطابقة الفرونت
أرقام الصفحات يجب أن تطابق مصحف المدينة (604) الذي يعتمده الفرونت. مضمون ما دام
`quran-locator` يستهلك `PAGE_STARTS` نفسه؛ **يُمنع** إعادة تنفيذ حساب الصفحات داخل الموديول.

---

## 12. المراجع

- `docs/daily-evaluation-report-plan.md` — خطة التقرير اليومي (المرجع الأساس)
- `src/quran/page-coverage.ts` — حساب الصفحات المطابق للفرونت
- `src/quran/range-union.ts` — دمج/طرح/تقاطع المدايات
- `src/modules/daily-reports/types/report-json.ts` — شكل `TrackReconciliation`
- `src/modules/dashboard/services/dashboard-scope.service.ts` — نمط النطاق حسب الدور
