// ===== הגדרות BUX Fuel =====
window.BUX_CONFIG = {
  // --- מנוע ה-AI (Cloudflare Worker) ---
  // כל עוד ריק ("") — האפליקציה רצה ב"מצב הדגמה" (חישוב מקומי, בלי מפתח API).
  // אחרי פריסת ה-Worker (ראה README.md) — הדבק כאן את הכתובת שלו.
  workerUrl: "",

  // --- ענן: חשבונות מתאמנים + דשבורד למאמן (Firebase) ---
  // כל מתאמן מתחבר עם שם + קוד אישי, רואה רק את עצמו, והנתונים עוברים בין מכשירים.
  // גיא נכנסת עם קוד המאמן ורואה את כולם.
  firebaseDB: "https://command-center-gal-default-rtdb.europe-west1.firebasedatabase.app",
  firebaseNode: "bux-fuel",
  coachPin: "bux2026",   // קוד הכניסה של גיא לדשבורד. אפשר לשנות.

  appName: "BUX Fuel"
};
