// ===== BUX Fuel — Cloudflare Worker (פרוקסי ל-AI) =====
// מחזיק את מפתח Anthropic כסוד (env.ANTHROPIC_API_KEY). הלקוח לעולם לא רואה אותו.
// שלושה נתיבים: /analyze-meal , /analyze-activity , /coach
//
// פריסה (ראה README.md):
//   wrangler secret put ANTHROPIC_API_KEY
//   wrangler deploy

const MODEL_DEFAULT = 'claude-sonnet-4-6';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// CORS — בברירת מחדל פתוח ל-* כדי שיהיה קל להתחיל.
// מומלץ: הגדר env.ALLOWED_ORIGIN לכתובת ה-Pages שלך (למשל https://bux-fuel.pages.dev)
function corsHeaders(env, origin) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  const allowOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, env, origin, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(env, origin) },
  });
}

// בונה קדם-טקסט עם ההקשר האישי של המתאמן (פרופיל, יעדים, צבירת היום, הנחיות גיא)
function ctxPreamble(context) {
  if (!context) return '';
  return `הקשר על המתאמן/ת (לשימושך בלבד, אל תחזור/י עליו מילה במילה):\n${JSON.stringify(context)}\n\n`;
}

// חילוץ JSON מתשובת המודל גם אם עטף ב-```json ... ```
function parseModelJson(text) {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
  try { return JSON.parse(t); } catch { return null; }
}

async function callClaude(env, system, userContent, maxTokens = 700) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: env.MODEL || MODEL_DEFAULT,
      max_tokens: maxTokens,
      system,
      messages: Array.isArray(userContent) ? userContent : [{ role: 'user', content: userContent }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err}`);
  }
  const data = await res.json();
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

// ---- מערכת ההנחיות לכל נתיב ----
const SYS_MEAL = `את/ה מנתח/ת התזונה של חדר הכושר קרוספיט BUX, דובר/ת עברית ומכיר/ה מאכלים ישראליים נפוצים (חומוס, שניצל, פיתה, לאפה, קוטג', במבה, פלאפל, טחינה, בורקס וכו').
תקבל/י תיאור ארוחה וגם הקשר על המתאמן/ת (JSON): פרופיל, יעדי מאקרו יומיים, סיכום מה שכבר נאכל היום (consumedToday + remainingToday), והנחיות המאמנת גיא (coachGuidelines).

נתח/י את הארוחה והערך/י ערכים תזונתיים, ותוך כך:
- אם לא צוינה כמות — הנח/י כמות סבירה לפי המין, המשקל ורמת הפעילות של המתאמן/ת.
- כתוב/כתבי "note" אישי וקצר בעברית שמתייחס למצב היום: אם נותר חלבון רב להשלים (remainingToday.proteinG) ציין/י זאת; אם הארוחה מקפיצה מעל הקלוריות שנותרו, כוון/י בעדינות; התאם/י לפי המטרה (חיטוב/מסה/שמירה).
- כבד/י תמיד את הנחיות גיא (אלרגיות, איסורים, העדפות). אל תמליץ/י על משהו שמנוגד להן.
- אל תהיה/י שיפוטי/ת, ועודד/י גישה בריאה ובת-קיימא.

החזר/י JSON בלבד במבנה הזה:
{"items":[{"name":"...","kcal":0,"protein":0,"carbs":0,"fat":0}],
 "total":{"kcal":0,"protein":0,"carbs":0,"fat":0},
 "note":"משפט אישי קצר בעברית, רשאי לכלול 🦌"}
אל תוסיף/י שום טקסט מחוץ ל-JSON.`;

const SYS_PARSE = `את/ה מנוע שמחלץ מאכלים מתיאור ארוחה בעברית, כדי לחבר אותם למאגר מזון רשמי.
ייתכן שתקבל/י גם הקשר על המתאמן/ת (JSON) — השתמש/י בו רק כדי להניח כמות סבירה כשלא צוינה (לפי המין/המשקל/רמת הפעילות).
לכל מאכל החזר/י: q = שם המאכל בעברית בצורה פשוטה ובסיסית כפי שמופיע במאגר מזון (למשל "לחם לבן", "חזה עוף", "גבינה צהובה", "קוטג'"); amount = כמות מספרית (ברירת מחדל 1); unit = יחידת מידה בעברית (פרוסה/כף/כפית/כוס/יחידה/גביע/צלחת/קערית) או null אם צוין משקל; grams = משקל בגרמים אם צוין במפורש, אחרת null.
החזר/י JSON בלבד: {"items":[{"q":"...","amount":1,"unit":"פרוסה","grams":null}]}
אל תוסיף/י טקסט מחוץ ל-JSON ואל תמציא/י ערכים תזונתיים — רק זיהוי המאכל והכמות.`;

const SYS_ACTIVITY = `את/ה מומחה/ית לפיזיולוגיה של המאמץ. הערך/י כמה קלוריות נשרפו לפי סוג הפעילות, משך, עצימות ומשקל המתאמן, בשיטת MET.
זהה/י פעילויות ישראליות נפוצות (הליכה, ריצה, קרוספיט, מטקות, שחייה, אופניים). החזר/י JSON בלבד:
{"activity":"...","minutes":0,"kcalBurned":0,"note":"משפט קצר בעברית"}
אל תוסיף/י שום טקסט מחוץ ל-JSON.`;

const SYS_FEEDBACK = `את/ה מאמן/ת התזונה של חדר הכושר קרוספיט BUX. תן/י משפט משוב חם, מעודד וקצר בעברית על מצב היום ביחס למטרה.
אם החלבון רחוק מהיעד — ציין/י זאת. אם יש עודף קלורי גדול — כוון/י בעדינות. סיים/י באנרגיה. מותר אימוג'י צבי 🦌.
אל תהיה/י שיפוטי/ת או קיצוני/ת, ועודד/י גישה בריאה ובת-קיימא. משפט אחד עד שניים בלבד.`;

const SYS_COACH = `את/ה מאמן/ת התזונה האישי/ת של מתאמן/ת בקרוספיט BUX. את/ה יודע/ת את המטרה שלו, את יעדי הקלוריות והמאקרו שגיא קבעה, את התפריט שלו ומה אכל היום.
ענה/י במדויק, אישית ומעשית, בעברית, בסגנון חם ואנרגטי של BUX. תן/י עצות ישימות שמתאימות למטרה.
אל תעודד/י דיאטות קיצוניות, הגבלה מסוכנת או יעד קלורי נמוך מדי — עודד/י הרגלים בריאים ובני-קיימא; אם המתאמן מציב יעד מסוכן, הצע/י בעדינות לדבר עם גיא.
את/ה תומך/ת, לא תחליף לייעוץ רפואי. סיים/י באנרגיה כשמתאים: Let's Go BUX 🦌.`;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env, origin) });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '');

    if (request.method !== 'POST') {
      return json({ error: 'use POST' }, env, origin, 405);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ error: 'missing ANTHROPIC_API_KEY secret' }, env, origin, 500);
    }

    let body = {};
    try { body = await request.json(); } catch { /* empty */ }

    try {
      if (path.endsWith('/parse-meal')) {
        const text = String(body.text || '').slice(0, 1500);
        const out = await callClaude(env, SYS_PARSE, ctxPreamble(body.context) + `הארוחה: ${text}`, 700);
        const parsed = parseModelJson(out);
        if (!parsed) return json({ error: 'parse', raw: out }, env, origin, 502);
        return json(parsed, env, origin);
      }

      if (path.endsWith('/analyze-meal')) {
        const text = String(body.text || '').slice(0, 1500);
        const out = await callClaude(env, SYS_MEAL, ctxPreamble(body.context) + `הארוחה לניתוח: ${text}`, 800);
        const parsed = parseModelJson(out);
        if (!parsed) return json({ error: 'parse', raw: out }, env, origin, 502);
        return json(parsed, env, origin);
      }

      if (path.endsWith('/analyze-activity')) {
        const text = String(body.text || '').slice(0, 800);
        const weight = Number(body.weight) || 75;
        const out = await callClaude(env, SYS_ACTIVITY, `משקל המתאמן: ${weight} ק"ג. הפעילות: ${text}`, 400);
        const parsed = parseModelJson(out);
        if (!parsed) return json({ error: 'parse', raw: out }, env, origin, 502);
        return json(parsed, env, origin);
      }

      if (path.endsWith('/coach')) {
        const ctx = String(body.context || '');
        // מצב משוב יומי
        if (body.mode === 'feedback') {
          const out = await callClaude(env, SYS_FEEDBACK, `הקשר היום:\n${ctx}`, 200);
          return json({ text: out }, env, origin);
        }
        // מצב צ'אט מלא
        const history = Array.isArray(body.messages) ? body.messages : [];
        const messages = [
          { role: 'user', content: `הקשר על המתאמן (לשימושך, אל תחזור עליו מילה במילה):\n${ctx}` },
          { role: 'assistant', content: 'קיבלתי את ההקשר. אני כאן 🦌' },
          ...history.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) })),
        ];
        const out = await callClaude(env, SYS_COACH, messages, 700);
        return json({ text: out }, env, origin);
      }

      return json({ error: 'unknown endpoint' }, env, origin, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, env, origin, 502);
    }
  },
};
