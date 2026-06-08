// ===== הגדרות BUX Fuel =====
// כאן מגדירים את כתובת ה-Worker של Cloudflare (מנוע ה-AI).
// כל עוד workerUrl ריק ("") — האפליקציה עובדת ב"מצב הדגמה":
// היא מחשבת קלוריות, מאקרו ושריפה בעצמה (הערכה מקומית), בלי צורך במפתח API.
// אחרי שתפרוס את ה-Worker (ראה README.md) — הדבק כאן את הכתובת שלו,
// וכל ניתוחי ה-AI יעברו דרך Claude האמיתי.
window.BUX_CONFIG = {
  workerUrl: "",            // לדוגמה: "https://bux-fuel.<שם-המשתמש>.workers.dev"
  appName: "BUX Fuel"
};
