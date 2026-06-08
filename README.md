# BUX Fuel 🦌 — יומן התזונה החי של קרוספיט BUX

אפליקציית PWA בעברית למעקב תזונה: המתאמן רושם בחופשי מה אכל ואיך התאמן, מנוע AI מעריך קלוריות ומאקרו ושריפה, והאפליקציה מראה בזמן אמת איפה הוא עומד מול היעדים שגיא קבעה — עם משוב וצ'אט כמו דיאטנית אישית.

- **מתאמן**: רואה הכל, מזין ארוחות/אימונים/מים/משקל, משוחח עם המאמן.
- **מאמן (בעל סמכות)**: נכנס עם קוד 🔒 וקובע יעדים, תפריט והערות.
- כל הנתונים נשמרים מקומית על המכשיר (פרטיות מלאה, אפס עלות שרת).
- **קוד מאמן ברירת מחדל:** `1234` — חובה לשנות אותו במסך הפרופיל ← כניסת מאמן ← "קוד מאמן".

---

## הרצה מקומית (לבדיקה)

מהתיקייה `bux-fuel`:

```
python3 -m http.server 4178
```

ואז לפתוח בדפדפן:

```
http://localhost:4178
```

> כל עוד לא חיברת את ה-Worker (ראה למטה), האפליקציה רצה ב**מצב הדגמה**: היא מחשבת קלוריות, מאקרו ושריפה בעצמה (הערכה מקומית), בלי צורך במפתח API. הכל עובד — רק שהניתוח הוא חכם-בסיסי ולא Claude מלא.

---

## שלב 1 — פריסת האתר (Frontend) ל-Cloudflare Pages

1. להיכנס ל-Cloudflare Pages:

   ```
   https://dash.cloudflare.com/?to=/:account/pages
   ```

2. **Create application → Pages → Upload assets** (או חיבור ל-GitHub).
3. לגרור את **כל התיקייה `bux-fuel`** (בלי תיקיית `worker`).
4. בסיום מתקבלת כתובת כמו:

   ```
   https://bux-fuel.pages.dev
   ```

---

## שלב 2 — פריסת מנוע ה-AI (Worker)

ה-Worker מחזיק את מפתח Anthropic בצד השרת — **המפתח לעולם לא נמצא באתר עצמו.**

מתוך התיקייה `bux-fuel/worker`:

```
npm install -g wrangler
wrangler login
wrangler secret put ANTHROPIC_API_KEY
wrangler deploy
```

- את המפתח משיגים כאן (חשבון Anthropic):

  ```
  https://console.anthropic.com/settings/keys
  ```

- בסיום הפריסה מתקבלת כתובת כמו:

  ```
  https://bux-fuel.<שם-המשתמש>.workers.dev
  ```

---

## שלב 3 — לחבר את השניים

לפתוח את הקובץ `config.js` ולהדביק את כתובת ה-Worker:

```js
window.BUX_CONFIG = {
  workerUrl: "https://bux-fuel.<שם-המשתמש>.workers.dev",
  appName: "BUX Fuel"
};
```

לשמור, ולהעלות שוב את האתר ל-Pages. זהו — כל ניתוחי ה-AI עוברים עכשיו דרך Claude האמיתי. 🦌

**אבטחה (מומלץ):** ב-`worker/wrangler.toml` להוסיף את כתובת ה-Pages כדי להגביל מי יכול לפנות ל-Worker:

```
ALLOWED_ORIGIN = "https://bux-fuel.pages.dev"
```

---

## מבנה הקבצים

```
bux-fuel/
├── index.html        מבנה כל המסכים
├── styles.css        עיצוב + מיתוג BUX + RTL
├── app.js            כל הלוגיקה (אונבורדינג, דשבורד, ניתוח, צ'אט, התקדמות, מצב מאמן)
├── config.js         כתובת ה-Worker (כאן מחברים את ה-AI)
├── manifest.json     הגדרות PWA (התקנה למסך הבית)
├── sw.js             Service Worker (עבודה אופליין)
├── icons/            אייקוני האפליקציה (אמבלמת הצבי)
├── logos/            הלוגואים הרשמיים של BUX
└── worker/           מנוע ה-AI ל-Cloudflare
    ├── src/index.js  שלושה נתיבים: analyze-meal / analyze-activity / coach
    └── wrangler.toml הגדרות פריסה
```

## התקנה לטלפון

נכנסים לכתובת ה-Pages בטלפון → תפריט הדפדפן → **הוסף למסך הבית**. האפליקציה תיפתח כמו אפליקציה רגילה, עם אייקון הצבי, ותעבוד גם בלי אינטרנט (הרישום עובד אופליין; ה-AI דורש חיבור).

Let's Go BUX 🦌
