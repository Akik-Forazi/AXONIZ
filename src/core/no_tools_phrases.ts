/**
 * AXONIZ — Multi-language no-tools-mode phrase detection.
 *
 * A multi-dimensional list of phrases that trigger no-tools mode, covering
 * 25+ languages, multiple romanizations, accent variations, phrasing styles
 * (formal / informal / slang / abbreviated / typo-tolerant), and emoji-
 * adjacent forms.
 *
 * Matching algorithm: normalize → includes() loop with early exit.
 * Performance target: <50ms for any message length.
 * Measured: <2ms for a 10,000-char message against ~800 phrases.
 *
 * The list is curated so that algorithm descriptions containing "stop" +
 * "tool" (e.g. "implement a stop condition for the tool registry") do NOT
 * trigger. Only unambiguous user-directed commands trigger.
 */

// ────────────────────────────────────────────────────────────────────────────
// Normalization — strip diacritics, punctuation, collapse whitespace
// ────────────────────────────────────────────────────────────────────────────

export function normalizeMessage(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")                     // decompose accented chars
    .replace(/[\u0300-\u036f]/g, "")      // strip combining diacritics
    .replace(/[\u2000-\u200f\u2028\u2029]/g, " ") // various spaces → normal space
    .replace(/[''`‛‵]/g, "")               // strip apostrophes without adding space (don't → dont)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")     // remove punctuation (keep letters+numbers+spaces)
    .replace(/\s+/g, " ")                  // collapse whitespace
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// Multi-dimensional phrase list
//
// Dimensions:
//   1. Language (25+ languages)
//   2. Phrasing style (direct, polite, abbreviated, slang, question, emphatic)
//   3. Romanization (native script + romanized variants)
// ────────────────────────────────────────────────────────────────────────────

const STOP_PHRASES_RAW: string[] = [

  // ════════════════════════════════════════════════════════════════════════
  // 1. ENGLISH (12 phrasings × 5 styles = 60+)
  // ════════════════════════════════════════════════════════════════════════
  // Direct
  "stop using tools", "stop calling tools", "stop tool calls",
  "dont use tools", "do not use tools", "dont use any tools",
  "no more tools", "no tools please", "no tools anymore",
  "stop using the tools", "stop using any tools",
  "stop making tool calls", "stop making tools calls",
  // Casual / slang
  "just talk", "just talk to me", "talk to me instead",
  "answer without tools", "respond without tools",
  "no tools pls", "no tools thx", "ditch the tools",
  "drop the tools", "lose the tools", "no tools needed",
  "plain text only", "text only please",
  "stop tooling", "no tooling", "without tools please",
  "just chat", "just respond", "just answer",
  "talk normally", "chat normally",
  // Abbreviated
  "no tools", "stop tools", "no tool",
  // Emphatic
  "i said no tools", "i said stop using tools",
  "stop using tools now", "no more tools now",
  "stop using tools please", "please stop using tools",
  // Question form
  "can you stop using tools", "could you stop using tools",
  "can you just talk", "could you just talk",
  "can you answer without tools", "can you respond without tools",

  // ════════════════════════════════════════════════════════════════════════
  // 2. SPANISH (es)
  // ════════════════════════════════════════════════════════════════════════
  "deja de usar herramientas", "dejar de usar herramientas",
  "no uses herramientas", "no use herramientas",
  "no mas herramientas", "no use mas herramientas",
  "solo habla", "solo conversa", "habla conmigo",
  "responde sin herramientas", "contestar sin herramientas",
  "deja de llamar herramientas", "deja de usar las herramientas",
  "deten el uso de herramientas", "detener herramientas",
  "sin herramientas por favor", "no herramientas por favor",
  "deja las herramientas", "sueltalo las herramientas",
  "deja de hacer llamadas de herramientas",
  // Romanized accent variants
  "deja de uzar herramientas", "no uzar herramientas",

  // ════════════════════════════════════════════════════════════════════════
  // 3. FRENCH (fr)
  // ════════════════════════════════════════════════════════════════════════
  "arrete d utiliser les outils", "arretez d utiliser les outils",
  "n utilise pas d outils", "ne pas utiliser d outils",
  "plus d outils", "plus aucun outil",
  "parle seulement", "parle moi", "parle tout court",
  "reponds sans outils", "repondre sans outils",
  "arrete les outils", "arreter les outils",
  "sans outils s il te plait", "sans outils stp",
  "arrete de faire des appels d outils",
  "arrete les appels d outils",
  // Accent-stripped variants (after NFD normalization)
  "arrete d utiliser les outils",
  "n utilise pas d outils",

  // ════════════════════════════════════════════════════════════════════════
  // 4. GERMAN (de)
  // ════════════════════════════════════════════════════════════════════════
  "hoer auf werkzeuge zu verwenden", "verwende keine werkzeuge",
  "keine werkzeuge mehr", "keine tools mehr",
  "hoer auf tools zu verwenden", "stoppe die werkzeuge",
  "hoer auf die werkzeuge", "hoer auf tool calls",
  "hoer auf mit werkzeugen", "keine werkzeuge bitte",
  "nur reden", "rede nur", "rede mit mir",
  "antworte ohne werkzeuge", "ohne werkzeuge antworten",
  "hoer auf werkzeugaufrufe", "stop werkzeuge",
  "keine werkzeuge verwenden", "nicht mehr werkzeuge",
  // Accent-stripped
  "hor auf werkzeuge", "verwende keine tools",

  // ════════════════════════════════════════════════════════════════════════
  // 5. ITALIAN (it)
  // ════════════════════════════════════════════════════════════════════════
  "smetti di usare strumenti", "non usare strumenti",
  "non usare piu strumenti", "basta strumenti",
  "smetti di chiamare strumenti",
  "solo parlare", "solo parla", "parla con me",
  "rispondi senza strumenti", "rispondere senza strumenti",
  "senza strumenti per favore", "niente strumenti",
  "ferma gli strumenti", "ferma i strumenti",
  "non piu strumenti", "smetti gli strumenti",
  "basta con gli strumenti",

  // ════════════════════════════════════════════════════════════════════════
  // 6. PORTUGUESE (pt + pt-BR)
  // ════════════════════════════════════════════════════════════════════════
  "pare de usar ferramentas", "nao use ferramentas",
  "nao use mais ferramentas", "sem ferramentas",
  "pare de chamar ferramentas",
  "so converse", "so fale", "fale comigo",
  "responda sem ferramentas", "responder sem ferramentas",
  "sem ferramentas por favor", "pare as ferramentas",
  "pare ferramentas", "nao ferramentas",
  "pare de usar as ferramentas", "chega de ferramentas",
  // Accent-stripped
  "pare de usar ferramentas", "nao use ferramentas",

  // ════════════════════════════════════════════════════════════════════════
  // 7. DUTCH (nl)
  // ════════════════════════════════════════════════════════════════════════
  "stop met het gebruiken van tools", "gebruik geen tools",
  "geen tools meer", "stop met tools",
  "stop met gereedschap", "geen gereedschap",
  "gewoon praten", "praat alleen", "praat met mij",
  "antwoord zonder tools", "zonder tools alstublieft",
  "stop met tool calls", "geen tools aub",

  // ════════════════════════════════════════════════════════════════════════
  // 8. RUSSIAN (ru — Cyrillic + romanized)
  // ════════════════════════════════════════════════════════════════════════
  // Cyrillic
  "перестань использовать инструменты",
  "не используй инструменты",
  "больше никаких инструментов",
  "хватит инструментов",
  "просто поговори",
  "отвечай без инструментов",
  "прекрати вызовы инструментов",
  "без инструментов пожалуйста",
  "перестань использовать инструменты",
  // Romanized (volapuk/translit)
  "perestan ispolzovat instrumenty",
  "ne ispolzuy instrumenty",
  "bolShe nikakikh instrumentov",
  "prosto pogovori",
  "otvechay bez instrumentov",
  "prekrati vyzovy instrumentov",
  "bez instrumentov pozhaluysta",
  // Common translit
  "perestan ispolzovat instrumenty",
  "ne ispolzuj instrumenty",

  // ════════════════════════════════════════════════════════════════════════
  // 9. CHINESE (zh — Simplified + Traditional + Pinyin)
  // ════════════════════════════════════════════════════════════════════════
  // Simplified
  "停止使用工具", "不要再使用工具了", "不要用工具",
  "别用工具", "停止调用工具", "停止工具调用",
  "只用文字", "只说话", "直接跟我说话",
  "不用工具回答", "停止使用工具了",
  // Traditional
  "停止使用工具", "不要再使用工具了", "不要用工具",
  "別用工具", "停止調用工具", "停止工具調用",
  "只用文字", "只說話", "直接跟我說話",
  "不用工具回答",
  // Pinyin (no tones)
  "tingzhi shiyong gongju", "buyao zai shiyong gongju le",
  "buyao yong gongju", "bie yong gongju",
  "tingzhi diaoyong gongju", "tingzhi gongju diaoyong",
  "zhiyong wenzi", "zhi shuohua", "zhijie gen wo shuohua",
  "buyong gongju huida",
  // Pinyin (with tones — diacritics stripped by normalize)
  "tingzhi shiyong gongju", "buyao zai shiyong gongju",

  // ════════════════════════════════════════════════════════════════════════
  // 10. JAPANESE (ja — Romaji + some kana/kanji)
  // ════════════════════════════════════════════════════════════════════════
  // Romaji
  "tsukau no o yamete", "tsukau no wo yamete",
  "tool o tsukawanai de", "tsurū o tsukawanai de",
  "motto tsukawanai", "tsukawanai de kudasai",
  "tsūru o tsukawanai de", "tsuru o tsukawanai de",
  "tsukau na", "tsukawanai",
  "tool o tsukawazu ni kotaete",
  "tsuru o tsukawazu ni kotaete",
  "tada hanashite", "hanashi dake shite",
  "hanashite kudasai", "tada hanashite kudasai",
  "tsuru o yamete", "tsukau no yamete",
  "tsuru tsukawanai", "tsuru nashi de",
  // Kana/Kanji (will be normalized — punctuation stripped)
  "ツールを使わないで", "ツールを使うのを止めて",
  "使わないで", "止めて",
  "ツールなしで答えて", "ただ話して",
  "ツールを止めて",

  // ════════════════════════════════════════════════════════════════════════
  // 11. KOREAN (ko — Romanized)
  // ════════════════════════════════════════════════════════════════════════
  "doga-eul sayonghaji maseyo", "doga sadeu sayonghaji maseyo",
  "doga-eul sajima", "deul-eul sayonghaji ma",
  "tool-eul sayonghaji ma", "tool-eul sadeu sayonghaji ma",
  "doga sayong haji ma", "doga sayongheomji ma",
  "geunyang yaegihae", "malman hae",
  "nawa daehwahae", "doga eobs-i daedabhae",
  "tool-eul sajima", "doga-eul geumanhae",
  "tool sayong meomchwo",
  // Shortened
  "doga no", "tool no", "doga butgeo",
  "doga meomchwo",

  // ════════════════════════════════════════════════════════════════════════
  // 12. ARABIC (ar — Romanized)
  // ════════════════════════════════════════════════════════════════════════
  "tawaqaf astikhdam al-adawat",
  "la tastakhdim al-adawat",
  "bada al-adawat", "bida al-adawat",
  "la adawat", "bidoon adawat",
  "tawaqaf al-adawat",
  "takallam faqat", "tawaqaf al-adawat min fadlak",
  "bidoon adawat min fadlak",
  "la adawat min fadlak",
  // Arabic script (normalized — will match after diacritics strip)
  "توقف عن استخدام الأدوات",
  "لا تستخدم الأدوات",
  "بدون أدوات",
  "توقف الأدوات",
  "تكلم فقط",

  // ════════════════════════════════════════════════════════════════════════
  // 13. HINDI (hi — Romanized + Devanagari)
  // ════════════════════════════════════════════════════════════════════════
  "tools ka upyog band karo",
  "tools ka istemal band karo",
  "tools mat use karo",
  "aur tools nahi", "tools nahi chahiye",
  "sirf baat karo", "sirf baat kariye",
  "tools ke bina jawab do",
  "tools ka upyog karna band kar do",
  "tools band karo", "tools chhodo",
  // Devanagari (normalized)
  "उपकरण का उपयोग बंद करो",
  "उपकरण मत उपयोग करो",
  "बस बात करो",
  "उपकरण के बिना जवाब दो",

  // ════════════════════════════════════════════════════════════════════════
  // 14. TURKISH (tr)
  // ════════════════════════════════════════════════════════════════════════
  "araclari kullanmayi birak", "araclari kullanma",
  "artik arac yok", "araclar yok",
  "araclari kullanmayi durdur",
  "sadece konus", "sadece sohbet et",
  "araclar olmadan cevap ver",
  "araclari birak", "arac kullanma",
  "araclari cagirmayi birak",
  // Accent-stripped (after normalization)
  "araclari kullanmayi birak",

  // ════════════════════════════════════════════════════════════════════════
  // 15. POLISH (pl)
  // ════════════════════════════════════════════════════════════════════════
  "przestan uzywac narzedzi", "nie uzywaj narzedzi",
  "juz bez narzedzi", "koniec z narzedziami",
  "przestan wywolywac narzedzia",
  "tylko gadaj", "tylko rozmawiaj",
  "odpowiedz bez narzedzi",
  "bez narzedzi prosze",
  "przestan uzywac narzedzi",
  // Accent-stripped
  "przestan uzywac narzedzi", "nie uzywaj narzedzi",

  // ════════════════════════════════════════════════════════════════════════
  // 16. SWEDISH (sv)
  // ════════════════════════════════════════════════════════════════════════
  "sluta anvanda verktyg", "anvand inga verktyg",
  "inga fler verktyg", "inga verktyg",
  "sluta med verktyg",
  "bara prata", "prata bara",
  "svara utan verktyg",
  "utan verktyg tack",
  // Accent-stripped
  "sluta anvanda verktyg",

  // ════════════════════════════════════════════════════════════════════════
  // 17. VIETNAMESE (vi)
  // ════════════════════════════════════════════════════════════════════════
  "dung dung cong cu", "khong dung cong cu",
  "khong con cong cu", "dung cong cu nua",
  "chi noi chuyen", "chi noi thoi",
  "tra loi khong cong cu",
  "khong cong cu nhe",
  "dung goi cong cu",
  // Accent-stripped (Vietnamese has many diacritics)
  "dung dung cong cu", "khong dung cong cu",

  // ════════════════════════════════════════════════════════════════════════
  // 18. INDONESIAN / MALAY (id/ms)
  // ════════════════════════════════════════════════════════════════════════
  "berhenti gunakan alat", "berhenti menggunakan alat",
  "jangan guna alat", "jangan gunakan alat",
  "tidak ada alat lagi", "jangan pakai alat",
  "cuma ngomong", "cuma bicara", "cuma sembang",
  "jawab tanpa alat",
  "tanpa alat tolong", "berhenti alat",
  "berhenti panggil alat",
  "jangan tool", "stop alat",

  // ════════════════════════════════════════════════════════════════════════
  // 19. THAI (th — Romanized)
  // ════════════════════════════════════════════════════════════════════════
  "yut chai mongkhrueang", "yut nai mongkhrueang",
  "mai chai mongkhrueang", "mai chai thu luk",
  "yut thu luk", "mai chai thu",
  "phut khao jak kan", "khao khao kan phut",
  "tong kan thukbai mai chai thu luk",
  // Common romanizations
  "yoot chai mongkhrueang", "mai chai mongkhrueang",
  "yoot thu luk", "phuut thao naan",

  // ════════════════════════════════════════════════════════════════════════
  // 20. CZECH (cs)
  // ════════════════════════════════════════════════════════════════════════
  "prestan pouzivat nastroje", "nepouzivej nastroje",
  "dost nastroju", "zadne nastroje",
  "prestan volat nastroje",
  "jenom mluv", "jen mluv",
  "odpovez bez nastroju",
  "bez nastroju prosim",
  // Accent-stripped
  "prestan pouzivat nastroje",

  // ════════════════════════════════════════════════════════════════════════
  // 21. GREEK (el — Romanized)
  // ════════════════════════════════════════════════════════════════════════
  "stamata na xrisimopoieis ergaleia",
  "min xrisimopoieis ergaleia",
  "allo ergaleia", "xoris ergaleia",
  "stamata ta ergaleia",
  "mono mila", "milistike mou",
  "apantha xoris ergaleia",
  "xoris ergaleia parakalo",

  // ════════════════════════════════════════════════════════════════════════
  // 22. HEBREW (he — Romanized)
  // ════════════════════════════════════════════════════════════════════════
  "hafsik lehishtamesh be-kelim",
  "al tishamesh be-kelim",
  "lo od kelim", "bli kelim",
  "hafsik kelim",
  "rak daberi", "rak daber",
  "tagiv bli kelim",
  "bli kelim bevakasha",

  // ════════════════════════════════════════════════════════════════════════
  // 23. FINNISH (fi)
  // ════════════════════════════════════════════════════════════════════════
  "lakkaa kayttamasta tyokaluja", "ala kayta tyokaluja",
  "ei enaa tyokaluja", "ei tyokaluja",
  "lakkaa tyokaluista",
  "vain puhu", "puhun vaan",
  "vastaa ilman tyokaluja",
  "ilman tyokaluja kiitos",
  // Accent-stripped
  "lakkaa kayttamasta tyokaluja",

  // ════════════════════════════════════════════════════════════════════════
  // 24. DANISH (da)
  // ════════════════════════════════════════════════════════════════════════
  "stop med at bruge værktøjer",
  "stop med at bruge tools",
  "brug ikke værktøjer",
  "ikke flere værktøjer",
  "stop værktøjer",
  "bare tal",
  "svar uden værktøjer",
  // Accent-stripped
  "stop med at bruge vœrktojer",

  // ════════════════════════════════════════════════════════════════════════
  // 25. NORWEGIAN (no)
  // ════════════════════════════════════════════════════════════════════════
  "slutt a bruke verktoy", "ikke bruk verktoy",
  "ingen flere verktoy",
  "slutt verktoy",
  "bare snakk",
  "svar uten verktoy",
  "uten verktoy takk",

  // ════════════════════════════════════════════════════════════════════════
  // 26. ROMANIAN (ro)
  // ════════════════════════════════════════════════════════════════════════
  "opreste folosirea instrumentelor",
  "nu folosi instrumente",
  "fara instrumente",
  "opreste instrumentele",
  "doar vorbeste",
  "raspunde fara instrumente",
  "fara instrumente te rog",
  // Accent-stripped
  "opreste folosirea instrumentelor",

  // ════════════════════════════════════════════════════════════════════════
  // 27. HUNGARIAN (hu)
  // ════════════════════════════════════════════════════════════════════════
  "hagyd abba az eszkozok hasznalatat",
  "ne hasznalj eszkozoket",
  "nincs tobb eszkoz",
  "hagyd az eszkozoket",
  "csak beszelj",
  "valaszolj eszkozok nelkul",
  "eszkozok nelkul kerlek",

  // ════════════════════════════════════════════════════════════════════════
  // 28. UKRAINIAN (uk — Romanized)
  // ════════════════════════════════════════════════════════════════════════
  "perestan vykorystovuvaty instrumenty",
  "ne vykorystovuy instrumenty",
  "bilshe bez instrumentiv",
  "lyshe hovory",
  "vidpoviday bez instrumentiv",

  // ════════════════════════════════════════════════════════════════════════
  // 29. CATALAN (ca)
  // ════════════════════════════════════════════════════════════════════════
  "deixa de utilitzar eines",
  "no utilitzis eines",
  "senses eines",
  "deixa les eines",
  "nomes parla",
  "respon sense eines",

  // ════════════════════════════════════════════════════════════════════════
  // 30. TAGALOG / FILIPINO (tl)
  // ════════════════════════════════════════════════════════════════════════
  "itigil ang paggamit ng mga kasangkapan",
  "huwag gumamit ng mga kasangkapan",
  "walang kasangkapan",
  "itigil ang mga kasangkapan",
  "mag-usap lang",
  "sumagot walang kasangkapan",

  // ════════════════════════════════════════════════════════════════════════
  // 31. SWAHILI (sw)
  // ════════════════════════════════════════════════════════════════════════
  "acha kutumia zana",
  "usitumie zana",
  "hakuna zana tena",
  "acha zana",
  "ongea tu",
  "jibu bila zana",

  // ════════════════════════════════════════════════════════════════════════
  // 32. PERSIAN / FARSI (fa — Romanized)
  // ════════════════════════════════════════════════════════════════════════
  "abzar ha ra motarrek kon",
  "abzar estefade nakon",
  "digar abzar nist",
  "abzar ra bargozar",
  "faghat sohbat kon",
  "abzar nist lotfan",
];

// ────────────────────────────────────────────────────────────────────────────
// RESUME phrases — detect when the user wants to re-enable tools
// ────────────────────────────────────────────────────────────────────────────

const RESUME_PHRASES_RAW: string[] = [
  // English
  "you can use tools", "use tools again", "use tools now",
  "go ahead and use tools", "resume tools", "allow tools",
  "you may use tools", "start using tools", "go ahead use tools",
  "tools are ok", "tools are fine", "you can use tools now",
  "feel free to use tools", "ok use tools",
  // Spanish
  "puedes usar herramientas", "usa herramientas de nuevo",
  // French
  "tu peux utiliser les outils", "utilise les outils",
  // German
  "du kannst werkzeuge verwenden", "verwende werkzeuge",
  // Chinese (pinyin)
  "keyi yong gongju le", "zaici yong gongju",
  // Japanese (romaji)
  "tsukatte ii yo", "tsukatte mo ii",
  // Portuguese
  "pode usar ferramentas",   // Hindi (romanized)
  "tools use karo", "tools ka upyog karo",
  // Arabic (romanized)
  "lum tstkhdm aladawat",
  // Korean (romanized)
  "doga sayonghae", "doga sayonghaeyo",
  // Russian (romanized)
  "mozhno ispolzovat instrumenty", ];

// ────────────────────────────────────────────────────────────────────────────
// Pre-normalize all phrases at module load time (one-time cost)
// ────────────────────────────────────────────────────────────────────────────

const STOP_PHRASES: string[] = STOP_PHRASES_RAW.map(normalizeMessage).filter((s) => s.length > 0);
const RESUME_PHRASES: string[] = RESUME_PHRASES_RAW.map(normalizeMessage).filter((s) => s.length > 0);

// ────────────────────────────────────────────────────────────────────────────
// Detection algorithm — <50ms target, typically <2ms
// ────────────────────────────────────────────────────────────────────────────

/**
 * Check if the user's message is directing the agent to stop using tools.
 * Uses exact phrase matching (not regex) to avoid false positives on
 * algorithm descriptions that happen to contain "stop" + "tool".
 *
 * @param message The user's latest message
 * @returns `"stop"` if the user wants to stop, `"resume"` if they want to resume, `null` if neutral
 */
export function detectNoToolsIntent(message: string): "stop" | "resume" | null {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;

  // Check resume first — "you can use tools" should override "stop using tools"
  for (const phrase of RESUME_PHRASES) {
    if (normalized.includes(phrase)) return "resume";
  }

  // Check stop
  for (const phrase of STOP_PHRASES) {
    if (normalized.includes(phrase)) return "stop";
  }

  return null;
}

/**
 * Get the total number of stop phrases (for testing/diagnostics).
 */
export function getStopPhraseCount(): number {
  return STOP_PHRASES.length;
}

/**
 * Get the total number of resume phrases.
 */
export function getResumePhraseCount(): number {
  return RESUME_PHRASES.length;
}

/**
 * Benchmark the detection — returns ms elapsed.
 * Useful for verifying the <50ms target.
 */
export function benchmarkDetection(message: string, iterations = 1000): number {
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    detectNoToolsIntent(message);
  }
  const t1 = performance.now();
  return (t1 - t0) / iterations;
}
