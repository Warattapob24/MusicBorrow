# 🛠️ Production Code Review & Refactoring Report
## Music Instrument Borrowing System (ระบบยืมคืนเครื่องดนตรี)

---

## 📐 Phase 0 — Architecture Discovery (Read Before Touching Anything)

### What the system actually is

The production system is a **single-file SPA** (`index.html`, 7,577 lines). It contains:
- All CSS styling
- All HTML markup (login, register, student dashboard, admin dashboard)
- One `<script type="module">` block containing the entire application logic (~6,000 lines of JS)
- Supabase JS SDK imported directly via CDN ESM
- A Service Worker (`sw.js`) for PWA/caching
- Edge Functions called via `supabase.functions.invoke()` for auth operations

**The files `login.js`, `register.js`, `dashboard.js`, `auth.js`, `logout.js`, and `dashboard.html` are NOT used by the live app.** They are legacy/experimental fragments. The `__delete_list.md` file even says to delete them. They should be archived or removed.

This is critical context: all fixes must target `index.html` and `sw.js` only.

---

## 🔴 CRITICAL Issues (Fix Immediately — Production-Breaking)

---

### CRITICAL-1: Exposed Supabase Anon Key — Two Different Keys in Use

**Risk Level: HIGH (security + functionality)**

**Problem:** Two different `SUPABASE_KEY` values exist in the codebase:

- **`index.html` (line 897)** — Key issued at timestamp `1751183149` (iat), expires `2066759149`
- **`login.js`, `logout.js`, `register.js`, `supabaseClient.js`** — Key issued at timestamp `1750822582` (iat), expires `2066398582`

Since the live app is `index.html`, the older key in the dead files is irrelevant to runtime — but both keys are committed to source. Anyone with access to the repository has both keys. While Supabase anon keys are intentionally public (they are client-side keys protected by RLS), having two different issued keys suggests one may be a rotated/revoked key, which is a hygiene issue.

**BEFORE (index.html line 897):**
```js
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...7q2MR7ePBrZKMh08MlZDbeXbFWcoH3dZNgdzWGHOugY';
```

**AFTER — extract to a config block at the top of the script:**
```js
// --- CONFIGURATION ---
// NOTE: The anon key is intentionally public (client-side). It is protected by RLS.
// If you rotate this key, update only this one location.
const APP_CONFIG = {
    supabaseUrl: 'https://qsbvitqxwgtmopjjuxin.supabase.co',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...7q2MR7ePBrZKMh08MlZDbeXbFWcoH3dZNgdzWGHOugY',
};
const supabase = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey, { ... });
```

**Why:** Centralizes the key to one location. If rotated, only one place to update. Prevents the current confusion of having different keys in different files.

**Deployment:** No downtime needed. Change is purely cosmetic/organizational for the live app.

---

### CRITICAL-2: Debug `console.log` with Session Data Exposed in Production

**Risk Level: HIGH (security)**

**Location: `index.html` line 5371**

**BEFORE:**
```js
// <<< เพิ่มบรรทัดนี้เข้าไปเพื่อตรวจสอบ Session ก่อนอัปโหลด >>>
console.log("Checking session before upload:", await supabase.auth.getSession());
```

**AFTER:** Remove this line entirely.

**Why:** `supabase.auth.getSession()` returns the full session object including the JWT access token. Logging this to the browser console means any user who opens DevTools can see the raw access token of the currently logged-in admin. This is a session token exposure vulnerability.

**Deployment:** No downtime needed. Safe to remove immediately.

---

### CRITICAL-3: Debug `console.log` with Internal Data Structures in Return Flow

**Risk Level: MEDIUM (security + information leakage)**

**Location: `index.html` lines 4926-4927**

**BEFORE:**
```js
console.log("--- DEBUGGING RETURN SELECTED ---");
console.log("Data being sent to RPC:", { p_log_ids: logIdsToReturn, p_user_id: currentUser.id });
```

**AFTER:** Remove both lines.

**Why:** Exposes internal user IDs and operation structure to anyone with DevTools open. This should not be in a production system.

---

### CRITICAL-4: `notification-bell` Event Listener Uses Wrong Element ID

**Risk Level: HIGH (broken feature)**

**Location: `index.html` line 7025**

**BEFORE:**
```js
userInfoWrapper.querySelector('#notification-bell')?.addEventListener('click', renderNotificationCenter);
```

**AFTER:**
```js
userInfoWrapper.querySelector('#notification-bell-btn')?.addEventListener('click', renderNotificationCenter);
```

**Why:** The button is rendered with `id="notification-bell-btn"` (line 7008), but the event listener queries `#notification-bell` (without `-btn`). The `?.` optional chaining silently swallows the failure, meaning the notification bell button does nothing when clicked. Users cannot open the notification center. The `is_read` flag never gets updated.

**Deployment:** No downtime needed. Zero-risk fix.

---

### CRITICAL-5: Service Worker `skipWaiting()` Called Outside `waitUntil` — Cache Race Condition

**Risk Level: HIGH (broken update flow for live users)**

**Location: `sw.js` lines 20-21**

**BEFORE:**
```js
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting(); // ← OUTSIDE waitUntil
});
```

**AFTER:**
```js
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
            .then(() => self.skipWaiting()) // ← INSIDE waitUntil, after cache is ready
    );
});
```

**Why:** `self.skipWaiting()` outside of `waitUntil()` means the Service Worker can activate and take control of pages before its cache is fully populated. This can cause failed fetches when the new SW tries to serve resources that haven't been cached yet. Moving it inside ensures activation only happens after the cache install is complete.

**Deployment:** Requires changing `CACHE_NAME` version string to force SW update.

---

### CRITICAL-6: `activate` Handler Returns Promise Outside `waitUntil`

**Risk Level: MEDIUM (SW lifecycle bug)**

**Location: `sw.js` lines 24-38**

**BEFORE:**
```js
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    return self.clients.claim(); // ← OUTSIDE waitUntil, also 'return' does nothing on event listeners
});
```

**AFTER:**
```js
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            ))
            .then(() => self.clients.claim())
    );
});
```

**Why:** `return self.clients.claim()` at the event listener level is ignored — event handlers don't use return values. `clients.claim()` runs before old caches are cleaned up, which can cause a brief period where the new SW serves pages with the old cache. Also cleaned up the `map()` to avoid returning `undefined` for non-deleted caches (which creates spurious rejected promises in older browsers).

---

### CRITICAL-7: SW Uses Cache-First for All Requests — Stale Auth Pages

**Risk Level: HIGH (users stuck on old version)**

**Location: `sw.js` lines 40-47**

**BEFORE:**
```js
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});
```

**AFTER:**
```js
self.addEventListener('fetch', event => {
    // Skip non-GET requests and Supabase API calls — never cache these
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('supabase.co')) return;

    const url = new URL(event.request.url);
    const isNavigationRequest = event.request.mode === 'navigate';

    // Navigation requests (HTML pages): Network-first, fallback to cache
    if (isNavigationRequest) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Cache a fresh copy
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Static assets (CSS, JS, images from CDN): Cache-first
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request)
                .then(networkResponse => {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return networkResponse;
                })
            )
    );
});
```

**Why:** The current implementation serves HTML from cache always. When you deploy a fix to `index.html`, users who have the SW installed will get the cached old version until they manually clear cache or the SW version string is bumped. Network-first for navigation ensures users always get the latest HTML while still benefiting from offline support.

---

## 🟠 HIGH Severity Issues

---

### HIGH-1: `update_practice_streak` Called After Bulk Return But Not After Single Return (Inconsistency)

**Risk Level: HIGH (data integrity — practice hours miscounted)**

**Location: `index.html` lines 4937 vs 4807-4836**

In `handleReturnSelected` (bulk return), line 4937:
```js
await supabase.rpc('update_practice_streak', { p_user_id: currentUser.id });
```

But in `handleReturnSingle` (single return), this call does NOT exist. Only `check_and_award_new_badges` is called.

**AFTER — Add to single return flow after badge check:**
```js
// After badge award check in handleReturnSingle:
await supabase.rpc('update_practice_streak', { p_user_id: currentUser.id });
```

**Why:** Practice streak is only updated when returning multiple items, not single items. Users who consistently return one instrument at a time will never have their streak updated. This is a silent data corruption bug.

**Deployment:** No downtime. Verify `update_practice_streak` is idempotent (safe to call multiple times) — if it uses `NOW()` internally it should be fine.

---

### HIGH-2: `borrow_logs` Schema Missing `home_borrow_request`/`home_borrow_approved` Columns Used in `dashboard.js`

**Risk Level: HIGH — but this affects the DEAD files only**

The legacy `dashboard.js` references `home_borrow_request` and `home_borrow_approved`, which don't exist in `supabase_schema.sql`. However, the live app (`index.html`) does NOT use these column names — it uses the correct `is_take_home` and `approval_status` which DO match the schema.

**Action:** No change needed to the live app. When cleaning up dead files, ensure `dashboard.js` is deleted and the schema is NOT altered to add these columns (they aren't needed).

---

### HIGH-3: `users` Table Schema Missing Many Columns Used by Live App

**Risk Level: HIGH (registration will fail if schema not updated)**

The `supabase_schema.sql` defines a minimal `users` table:
```sql
id, email, student_id, full_name, role, student_group, created_at
```

But the live app `index.html` uses these additional columns on the `users` table:
- `prefix` (line 4959, 7129)
- `first_name` (line 7003, 7129)
- `last_name` (line 7130)
- `nickname` (referenced in profile edit)
- `birth_date` (referenced in profile edit)
- `phone_number` (referenced in profile edit)
- `line_id` (referenced in profile edit)
- `class_level` (line 7262)
- `main_instrument` (line 7139)
- `profile_image_url` (line 7002)
- `is_blocked` (line 6976)
- `block_reason` (line 6980)
- `student_id` (exists ✓)

**Safe Migration Script (non-destructive — only adds, never drops):**

```sql
-- SAFE MIGRATION: Add missing columns to users table
-- Run in Supabase SQL Editor. All columns have safe defaults so existing rows are unaffected.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS prefix text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS line_id text,
  ADD COLUMN IF NOT EXISTS class_level text,
  ADD COLUMN IF NOT EXISTS main_instrument text,
  ADD COLUMN IF NOT EXISTS profile_image_url text,
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_reason text;
```

**Deployment:** Run migration BEFORE deploying any code changes. Zero downtime — `ADD COLUMN IF NOT EXISTS` is non-blocking in PostgreSQL for tables of this size.

---

### HIGH-4: `borrow_logs` Schema Missing Columns Used by Live App

The schema defines: `id, student_id, instrument_id, borrow_timestamp, return_timestamp, is_take_home, approval_status, borrow_status, terms_accepted, damage_notes`

The live app additionally uses:
- `due_date` (line 2090 — take-home due date)
- `is_force_returned` (line 1021 — admin force return flag)
- `latest_repair_status` (line 1027 — joined from repair_logs, likely a view/RPC column)
- `log_id` (returned from RPC — not a direct column issue)

**Safe Migration:**
```sql
ALTER TABLE borrow_logs
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS is_force_returned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_acknowledged boolean DEFAULT false;
```

---

### HIGH-5: `roleLabel()` in `dashboard.js` Has Roles Not in DB Schema CHECK Constraint

**Risk Level: HIGH — but in DEAD FILE ONLY**

`dashboard.js` handles roles: `student`, `club`, `teacher`, `guest`, `admin`. But the DB schema only allows `student` and `admin`. The live app handles `club`, `teacher`, `guest` as `student_group` values, not `role` values. This was an architectural decision made correctly in `index.html` — the `role` column is only `student` or `admin`.

**Action:** No change to live app needed. Delete `dashboard.js`.

---

### HIGH-6: Profile Self-Edit Allows User to Change Their Own `student_group` Without Restriction

**Risk Level: HIGH (privilege escalation)**

**Location: `index.html` ~line 4948 (`handleEditProfile`)**

The profile edit modal (used by all logged-in users) collects and saves `student_group`. A student could change themselves from `student` to `club` or `teacher` to bypass borrowing restrictions.

**Current code pattern (simplified):**
```js
const updatePayload = {
    prefix, first_name, last_name, nickname, phone_number, line_id, birth_date,
    student_group,  // ← user can set this to anything
    ...
};
await supabase.from('users').update(updatePayload).eq('id', currentUser.id);
```

**AFTER — Remove `student_group` from user self-edit, admin-only:**
```js
const updatePayload = {
    prefix, first_name, last_name, nickname, phone_number, line_id, birth_date,
    // student_group intentionally excluded — admin-only field
};
await supabase.from('users').update(updatePayload).eq('id', currentUser.id);
```

**Why:** While RLS theoretically allows self-update, the policy as written allows a student to update any column on their own row including `student_group`. The borrowing rules (which instruments can be taken home, time limits) depend on `student_group`. Allowing self-modification bypasses those rules.

**Also add a DB-level constraint by creating a restricted update policy:**
```sql
-- Drop the overly broad policy
DROP POLICY IF EXISTS "Users: Self or Admin can update" ON users;

-- Students can update only their personal info, not role/group
CREATE POLICY "Users: Self can update personal info" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    -- Students cannot change their own role or student_group
    role = (SELECT role FROM users WHERE id = auth.uid()) AND
    student_group = (SELECT student_group FROM users WHERE id = auth.uid())
  );

-- Admins can update anything
CREATE POLICY "Users: Admin can update all" ON users
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );
```

---

### HIGH-7: `roleLabel` CHECK Constraint Mismatch — DB Allows Only `student`/`admin` But App Uses More Groups

The DB schema has:
```sql
role text check (role in ('student', 'admin')) not null default 'student'
```

But the app treats `club`, `teacher`, `guest`, `resigned`, `graduated`, `deactivated` as valid `student_group` values (not `role`). This is architecturally correct. However, the `roleLabel()` function in dead `dashboard.js` tries to set `role` to these values, which would fail the CHECK constraint. This is another reason those files must be deleted.

---

## 🟡 MEDIUM Severity Issues

---

### MEDIUM-1: Age Calculation Uses Only Year Difference (Off-By-One Risk)

**Location: `index.html` line 7168**

**BEFORE:**
```js
const birthYear = new Date(e.target.value).getFullYear();
const currentYear = new Date().getFullYear();
ageInput.value = currentYear - birthYear;
```

**AFTER:**
```js
const birth = new Date(e.target.value);
const today = new Date();
let age = today.getFullYear() - birth.getFullYear();
const monthDiff = today.getMonth() - birth.getMonth();
if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
}
ageInput.value = age;
```

**Why:** A student born on December 15 who registers in January will be shown as 1 year older than they actually are. The full birthday-aware calculation (same logic as `register.html`) is more accurate.

---

### MEDIUM-2: `sw.js` Does Not Handle `skipWaiting` Message from Client

**Location: `index.html` line 886, `sw.js`**

The update button sends:
```js
newWorker.postMessage({ action: 'skipWaiting' });
```

But `sw.js` has no `message` event listener for this. The only `skipWaiting` in `sw.js` is during install. So clicking the update button calls `postMessage` into a void, then reloads the page — but since the SW didn't actually `skipWaiting`, the old SW may still be in control after reload.

**Add to `sw.js`:**
```js
self.addEventListener('message', event => {
    if (event.data && event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
```

---

### MEDIUM-3: `autoCorrelate` Tuner Can Throw `TypeError` on Silence Edge Case

**Location: `index.html` lines 7276-7280**

```js
let T0 = maxpos;
const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
```

If `maxpos === 0`, then `c[T0 - 1]` is `c[-1]` which returns `undefined`. The subsequent arithmetic produces `NaN` which propagates to `sampleRate / T0` returning `NaN` instead of `-1`.

**AFTER:**
```js
let T0 = maxpos;
if (T0 === 0 || T0 >= c.length - 1) return -1; // Guard against edge indices

const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
const a = (x1 + x3 - 2 * x2) / 2;
const b = (x3 - x1) / 2;
if (a) T0 = T0 - b / (2 * a);
if (T0 <= 0) return -1; // Guard against zero/negative after parabolic interpolation

return sampleRate / T0;
```

---

### MEDIUM-4: Multiple Supabase Clients — Two Different Keys Initialized

**Risk Level: MEDIUM (session confusion for legacy files)**

The live app creates its client in `index.html` with `storageKey: 'supabase.auth.token'`. The legacy files `login.js`/`logout.js`/`register.js` use `window.supabase.createClient()` with a different key and no storage key config. If any legacy file were ever accidentally loaded alongside `index.html`, sessions would conflict.

**Action:** Delete the dead files. They should not coexist with the live app.

---

### MEDIUM-5: `handleUniversalScan` Does Not Handle Invalid URL in QR Code

**Location: `index.html` line 6847**

**BEFORE:**
```js
const urlParams = new URLSearchParams(new URL(decodedText).search);
```

If `decodedText` is not a valid URL (e.g., the camera reads a random QR code), `new URL(decodedText)` throws a `TypeError` that is not caught, causing the entire scan flow to crash silently inside `.then()`.

**AFTER:**
```js
let instrumentId = null;
try {
    const urlParams = new URLSearchParams(new URL(decodedText).search);
    instrumentId = urlParams.get('scan');
} catch {
    return Swal.fire('ผิดพลาด', 'QR Code ไม่ถูกต้องหรือไม่ใช่ QR ของระบบนี้', 'error');
}
if (!instrumentId) {
    return Swal.fire('ผิดพลาด', 'QR Code นี้ไม่มีข้อมูลเครื่องดนตรี', 'error');
}
```

---

### MEDIUM-6: Commented-Out Code Is Excessive and Clutters Production File

**Scope:** ~50+ commented-out lines across `index.html` (lines 7019-7035, 7026-7035, etc.)

Large blocks of commented-out code should not be in production. Use git history for recovery. This is a maintenance issue that makes the 7,500-line file even harder to navigate.

**Action:** Remove all commented-out code blocks before next major release. Do not do this during a hotfix window.

---

### MEDIUM-7: `escapeHtml` Not Applied to All User-Controlled Rendered Content

**Location:** Several places in admin views

`escapeHtml()` is correctly defined and used in most places. However, in `renderAdminHomeBorrowRequests` and `renderAdminBorrowLogs` equivalents inside `index.html`, `log.users?.full_name` is sometimes interpolated without escaping:

```js
// Potential XSS if full_name contains HTML
`<strong>${log.users?.full_name || '-'}</strong>`
```

Since `full_name` is user-provided during registration, a user with a name like `<script>alert(1)</script>` could inject HTML into admin views.

**AFTER — Wrap all user-provided strings:**
```js
`<strong>${escapeHtml(log.users?.full_name || '-')}</strong>`
```

Audit every `innerHTML` assignment that includes data from the database and ensure `escapeHtml()` is applied.

---

## 🔵 LOW Severity Issues

---

### LOW-1: `h4` Nested Inside `h4` — Invalid HTML

**Location: `index.html` lines 2483-2484**
```html
<h4 style="...">
    <h3 style="margin: 0;">📈 ความเคลื่อนไหวล่าสุด</h3>
```
A block-level `<h3>` cannot be a child of `<h4>`. Change to `<div>` wrapper or restructure.

---

### LOW-2: `tuner-indicator` Reset Uses `transform` But Display Uses `left`

**Location: `index.html` lines 7395-7396 (stopTuner)**
```js
indicatorEl.style.transform = 'translateX(0)';  // resets transform
indicatorEl.style.backgroundColor = 'var(--pico-primary)';
```

But the active tuner positions the indicator with `left` (line 7328):
```js
indicatorEl.style.left = `${needlePositionPercent}%`;
```

When stopping, `left` is never reset. The needle stays at its last position instead of returning to center.

**Fix:**
```js
indicatorEl.style.left = '50%'; // Reset to center
indicatorEl.style.transform = 'translateX(-50%)'; // Restore centering transform
```

---

### LOW-3: `instruments` Table Missing `condition`, `brand`, `serial_number`, `instrument_code`, `purchase_date`, `description`, `image_url` Columns

These are used in `handleAddNewInstrument()` via `admin_create_instrument` RPC. The schema only has `id, name, type, status, current_borrower_id, created_at`. Since the RPC function handles insertion, the DB likely has these columns — but `supabase_schema.sql` is out of date and doesn't reflect reality.

**Action:** Update `supabase_schema.sql` to match the actual DB columns for documentation accuracy. No runtime change needed if the DB already has them.

---

### LOW-4: `logIdsToReturn` Array Uses `Number()` But IDs May Already Be Numbers

**Location: `index.html` line 4909**
```js
const logIdsToReturn = Array.from(checkedCheckboxes).map(cb => Number(cb.dataset.logId));
```
`dataset` values are always strings, so `Number()` conversion is correct. However, if `cb.dataset.logId` is empty or non-numeric, `Number('')` returns `0` which could cause incorrect DB operations. Add a filter:
```js
const logIdsToReturn = Array.from(checkedCheckboxes)
    .map(cb => Number(cb.dataset.logId))
    .filter(id => id > 0);
```

---

### LOW-5: `timeAgo` Function Referenced but Never Shown in Provided Files

**Location: `index.html` line 1336**
```js
<small style="...>${timeAgo(n.created_at)}</small>
```
A `timeAgo()` function is called but not visible in the provided code segments. If it's defined elsewhere in the 7,577-line file (in a section not shown), this is fine. If missing, it will throw `ReferenceError` when the notification center opens.

**Action:** Search for `function timeAgo` in `index.html`. If not found, add:
```js
function timeAgo(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    const intervals = [
        [31536000, 'ปีที่แล้ว'], [2592000, 'เดือนที่แล้ว'],
        [86400, 'วันที่แล้ว'], [3600, 'ชั่วโมงที่แล้ว'],
        [60, 'นาทีที่แล้ว'], [1, 'เมื่อกี้']
    ];
    for (const [threshold, label] of intervals) {
        const interval = Math.floor(seconds / threshold);
        if (interval >= 1) return `${interval} ${label}`;
    }
    return 'เมื่อกี้';
}
```

---

### LOW-6: Metronome `scheduler()` Uses `window.setTimeout` Instead of `self.setTimeout`

Minor: In browser context `window.setTimeout` and `setTimeout` are equivalent. No bug, but inconsistent with `window.clearTimeout` on line 7495. Minor style issue only.

---

## 🗄️ Database Migration — Complete Safe Script

Run these in order in Supabase SQL Editor. All are non-destructive.

```sql
-- =========================================================
-- MIGRATION 001: Add missing user columns
-- Safe: IF NOT EXISTS prevents errors on re-run
-- =========================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS prefix text,
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS line_id text,
  ADD COLUMN IF NOT EXISTS class_level text,
  ADD COLUMN IF NOT EXISTS main_instrument text,
  ADD COLUMN IF NOT EXISTS profile_image_url text,
  ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS block_reason text;

-- =========================================================
-- MIGRATION 002: Add missing borrow_logs columns
-- =========================================================
ALTER TABLE borrow_logs
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS is_force_returned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_acknowledged boolean DEFAULT false;

-- =========================================================
-- MIGRATION 003: Tighten RLS on users table
-- Prevents students from changing their own role/group
-- =========================================================
DROP POLICY IF EXISTS "Users: Self or Admin can update" ON users;

CREATE POLICY "Users: Self can update personal info only" ON users
  FOR UPDATE 
  USING (auth.uid() = id)
  WITH CHECK (
    -- Cannot change role
    role = (SELECT role FROM users WHERE id = auth.uid()) AND
    -- Cannot change student_group
    student_group = (SELECT student_group FROM users WHERE id = auth.uid()) AND
    -- Cannot unblock self
    is_blocked = (SELECT is_blocked FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users: Admin can update all fields" ON users
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
  );

-- =========================================================
-- MIGRATION 004: Add CHECK constraint for borrow_status  
-- (Only if your existing data is consistent)
-- =========================================================
-- Run this separately after verifying existing data:
-- ALTER TABLE borrow_logs 
--   ADD CONSTRAINT borrow_status_check 
--   CHECK (borrow_status IN ('active', 'returned', 'overdue', 'force_returned'));
```

---

## 📦 Files to Delete (Dead Code)

The following files are **not used by the live app** and should be deleted or archived:

| File | Status | Reason |
|------|--------|--------|
| `login.js` | ❌ DELETE | Legacy fragment. Crashes on load (top-level DOM queries). Not referenced by live app. |
| `register.js` | ❌ DELETE | Superseded by Edge Function `sign-up`. Not referenced by live app. |
| `auth.js` | ❌ DELETE | Incomplete code fragment without imports. Not referenced by any HTML file. |
| `logout.js` | ❌ DELETE | Logout handled in `index.html`. Not referenced. |
| `dashboard.js` | ❌ DELETE | 750-line legacy file. Not referenced by `index.html`. Has critical bugs. |
| `dashboard.html` | ❌ DELETE | Uses `dashboard.js`. Not the live app. |
| `staffwar.html` | ❌ DELETE | 0 bytes — empty file. |
| `supabaseClient.js` | ⚠️ ARCHIVE | Not used by live app. Keep if planning separate module-based rebuild. |
| `register.html` | ⚠️ ARCHIVE | Standalone page. May be used as fallback. Verify before deleting. |

---

## 🚀 Deployment Checklist (Step-by-Step)

### Phase 1: Database (No Downtime)
1. ✅ Run Migration 001 (user columns) in Supabase SQL Editor
2. ✅ Run Migration 002 (borrow_logs columns)
3. ✅ Run Migration 003 (RLS policy tightening)
4. ✅ Verify with: `SELECT column_name FROM information_schema.columns WHERE table_name = 'users';`

### Phase 2: Code Fixes in `index.html` (Low Risk)
Apply in this order — each is independently safe:
1. ✅ Remove debug `console.log` at line 5371
2. ✅ Remove debug `console.log` at lines 4926-4927
3. ✅ Fix notification bell event listener ID (line 7025: `#notification-bell` → `#notification-bell-btn`)
4. ✅ Fix age calculation in registration (line 7168)
5. ✅ Add `update_practice_streak` call to single-return flow
6. ✅ Fix QR scan URL parsing error handling (line 6847)
7. ✅ Add `Number()` filter for logIds (line 4909)
8. ✅ Fix `escapeHtml()` for all admin-rendered user-provided strings
9. ✅ Fix indicator reset in `stopTuner()` (line 7395)

### Phase 3: Service Worker `sw.js` (Requires Version Bump)
1. ✅ Fix `skipWaiting()` placement (inside `waitUntil`)
2. ✅ Fix `activate` handler (move `clients.claim()` into `waitUntil`)
3. ✅ Add `message` event listener for client-side `skipWaiting` trigger
4. ✅ Change fetch strategy to network-first for navigation
5. ✅ **Bump `CACHE_NAME`** to `'music-borrow-v6.0.0'` to force all clients to update
6. ✅ Deploy — existing users will see the update notification banner

### Phase 4: File Cleanup (Low Risk)
1. ✅ Verify none of the dead files are `<script src="">`'d anywhere
2. ✅ Archive to `_legacy/` folder or delete from repository
3. ✅ Update `__delete_these_files.md` to mark as completed

---

## 📊 Final Summary

### Overall Health Assessment: **7/10 — Good Foundation, Fixable Issues**

The live application (`index.html`) is architecturally sound for its scale:
- Correctly uses Supabase ES module import
- Properly uses RPCs for atomic operations (borrow, return)
- Has solid `escapeHtml()` for XSS prevention (mostly applied correctly)
- Good use of `onAuthStateChange` for session management
- Properly handles Google OAuth new-user profile flow
- Blocked-user check on login is correctly implemented

### Remaining Risks After Fixes
| Risk | Severity | Status After Fixes |
|------|----------|-------------------|
| Session token exposed in console | HIGH | ✅ Fixed |
| Notification bell broken | HIGH | ✅ Fixed |
| SW race condition on update | HIGH | ✅ Fixed |
| User self-escalates student_group | HIGH | ✅ Fixed (DB policy) |
| Missing DB columns | HIGH | ✅ Fixed (migration) |
| Practice streak inconsistency | MEDIUM | ✅ Fixed |
| QR scan crash on invalid URL | MEDIUM | ✅ Fixed |
| Dead files with critical bugs | HIGH | ✅ Deleted |
| File is 7,577 lines | MEDIUM | ⚠️ Future: split into modules |

### Top 5 Future Scaling Improvements
1. **Split `index.html` into modules** — Move JS into separate `.js` files and use a bundler (Vite). The current single-file approach works but becomes unmaintainable beyond ~10k lines.
2. **Add input validation to Edge Functions** — The `sign-up` Edge Function should validate all input server-side (min length, format, SQL injection even via parameterized queries).
3. **Add Supabase Realtime for borrowed items** — Currently borrowed list requires manual refresh. Supabase Realtime subscriptions would give live updates.
4. **Add rate limiting to borrow/return RPCs** — The RPC functions should include a rate-limit check to prevent rapid repeated borrows.
5. **Add structured error logging** — Replace `console.error` with a structured logging service (e.g., Sentry) so errors in production are tracked, not just seen by individual users in DevTools.