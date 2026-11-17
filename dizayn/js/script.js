// ===== Karyera Mentoru — interaktivlik =====

// ===== Köməkçi: localStorage-i təhlükəsiz oxu/yaz =====
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Yaddaş əlçatan deyil — sadəcə keçirik
  }
}

// ===== 1. Elan zolağı =====
const announcement = document.querySelector("#elan");
const announcementClose = document.querySelector(".announcement-close");

if (readStorage("elanBaglandi") === "1") {
  announcement.classList.add("is-hidden");
}

announcementClose.addEventListener("click", () => {
  announcement.classList.add("is-hidden");
  writeStorage("elanBaglandi", "1");
});

// ===== 2. Header: mobil menyu (☰) =====
const menuToggle = document.querySelector(".menu-toggle");
const mainNav = document.querySelector("#main-nav");

function setMenu(open) {
  mainNav.classList.toggle("is-open", open);
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Menyunu bağla" : "Menyunu aç");
  menuToggle.textContent = open ? "✕" : "☰";
}

menuToggle.addEventListener("click", () => {
  setMenu(!mainNav.classList.contains("is-open"));
});

// Menyudakı linkə klikləyəndə bağla
mainNav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => setMenu(false));
});

// Esc düyməsi ilə bağla
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && mainNav.classList.contains("is-open")) {
    setMenu(false);
    menuToggle.focus();
  }
});

// Menyudan kənara klikləyəndə bağla
document.addEventListener("click", (event) => {
  if (!mainNav.contains(event.target) && !menuToggle.contains(event.target)) {
    setMenu(false);
  }
});

// Ekran kompüter ölçüsünə böyüyəndə menyunu sıfırla
window.matchMedia("(min-width: 1200px)").addEventListener("change", () => setMenu(false));

// ===== Ümumi: ekrana girəndə animasiya =====
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Rəqəmi 0-dan hədəfə qədər sayaraq artır
function countUp(element) {
  const target = Number(element.dataset.count);
  if (reduceMotion) {
    element.textContent = target;
    return;
  }
  const duration = 1400;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// Sayğaclar animasiya başlayana qədər 0 göstərsin
if (!reduceMotion) {
  document.querySelectorAll("[data-count]").forEach((el) => {
    el.textContent = "0";
  });
}

function showElement(element) {
  element.classList.add("is-visible");
  element.querySelectorAll("[data-count]").forEach(countUp);
}

const revealItems = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        showElement(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.25 });

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach(showElement);
}

// ===== 2. Header: tema düyməsi (🌙/☀️) =====
const themeToggle = document.querySelector(".theme-toggle");

function setTheme(theme) {
  const isDark = theme === "dark";
  document.documentElement.toggleAttribute("data-theme", isDark);
  if (isDark) document.documentElement.setAttribute("data-theme", "dark");
  themeToggle.textContent = isDark ? "☀️" : "🌙";
  themeToggle.setAttribute("aria-label", isDark ? "İşıqlı rejimə keç" : "Qaranlıq rejimə keç");
}

// Seçim yoxdursa, kompüterin öz rejiminə (işıqlı/qaranlıq) uyğunlaş
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
const savedTheme = readStorage("tema");
setTheme(savedTheme || (systemDark.matches ? "dark" : "light"));

systemDark.addEventListener("change", (event) => {
  if (!readStorage("tema")) setTheme(event.matches ? "dark" : "light");
});

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  setTheme(next);
  writeStorage("tema", next);
});

// ===== Toast bildirişləri =====
const toastArea = document.querySelector("#toast-area");

const TOAST_TIME = 3500;
const TOAST_MAX = 3;

function removeToast(toast) {
  if (!toast.isConnected || toast.classList.contains("is-leaving")) return;
  if (reduceMotion) {
    toast.remove();
    return;
  }
  toast.classList.add("is-leaving");
  setTimeout(() => toast.remove(), 250);
}

// Yaşıl = uğur, qırmızı = xəta; sağ yuxarıda 3.5 saniyə
function showToast(message, type = "success") {
  // Eyni anda ən çox 3 bildiriş
  const current = toastArea.querySelectorAll(".toast:not(.is-leaving)");
  if (current.length >= TOAST_MAX) removeToast(current[0]);

  const toast = document.createElement("div");
  toast.className = `toast is-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = type === "error" ? "!" : "✓";

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "toast-close";
  close.setAttribute("aria-label", "Bildirişi bağla");
  close.textContent = "×";
  close.addEventListener("click", () => removeToast(toast));

  toast.append(icon, text, close);
  toastArea.appendChild(toast);

  // Siçan üstündə olanda bağlanmasın
  let timer = setTimeout(() => removeToast(toast), TOAST_TIME);
  toast.addEventListener("mouseenter", () => clearTimeout(timer));
  toast.addEventListener("mouseleave", () => {
    timer = setTimeout(() => removeToast(toast), 1500);
  });
}

// ===== API rejimi (backend ilə əlaqə) =====
// Sayt backend tərəfindən açılanda (http://…/dizayn/) real API istifadə olunur:
// qeydiyyat/giriş, CV analizi, tarixçə və 7/14/21 günlük plan.
// Fayl kimi açılanda (file://) və ya backend cavab vermədikdə demo rejim qalır.
let apiMode = false;
let apiChecked = false;
let apiUser = null; // {id, email, name, surname, major, premium}
let apiFields = []; // /api/match/fields
let apiHistory = []; // /api/history (yalnız qiymətləndirmələr)
const apiRoadmaps = new Map(); // evaluation_id → /api/roadmap cavabı

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(path, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { credentials: "same-origin", ...options, signal: controller.signal });
    if (!res.ok) {
      let message = "Xəta baş verdi. Yenidən cəhd et.";
      try {
        const data = await res.json();
        if (typeof data.detail === "string") message = data.detail;
      } catch (error) {
        // Cavab JSON deyil — ümumi mesaj qalır
      }
      throw new ApiError(message, res.status);
    }
    return await res.json();
  } catch (error) {
    if (error.name === "AbortError") throw new ApiError("Cavab çox gec gəldi. Bir az sonra yenidən cəhd et.", 0);
    if (error instanceof ApiError) throw error;
    throw new ApiError("Serverə qoşulmaq alınmadı. Bağlantını yoxla.", 0);
  } finally {
    clearTimeout(timer);
  }
}

function postJson(path, body) {
  return api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Backend varmı? (/health)
const apiReady = (async () => {
  if (location.protocol === "file:") return false;
  try {
    const health = await api("/health", {}, 5000);
    apiMode = health.status === "ok";
  } catch (error) {
    apiMode = false;
  }
  return apiMode;
})().finally(() => {
  apiChecked = true;
});

// Backend-də istifadəçinin yalnız e-poçtu var — ad, soyad, ixtisas və Premium bu brauzerdə saxlanır
function readProfile(email) {
  try {
    return JSON.parse(readStorage(`profil:${email}`)) || {};
  } catch (error) {
    return {};
  }
}

function writeProfile(email, changes) {
  writeStorage(`profil:${email}`, JSON.stringify({ ...readProfile(email), ...changes }));
}

function makeApiUser(me) {
  const profile = readProfile(me.email);
  return {
    id: me.id,
    email: me.email,
    name: profile.name || me.email.split("@")[0],
    surname: profile.surname || "",
    major: profile.major || "",
    premium: Boolean(profile.premium),
  };
}

function fieldName(id) {
  return (apiFields.find((f) => f.id === id) || {}).name || id || "";
}

// /api/evaluate cavabını saytın analiz formatına çevir
const CATEGORY_ORDER = ["structure", "ats", "impact", "field_fit"];

function fromEvaluation(data, id, createdAt) {
  const cats = CATEGORY_ORDER.map((key) => data.categories.find((c) => c.key === key) || { score: 0, label: key });
  const match = data.match || {};
  const skills = [...(match.required_skills || []), ...(match.preferred_skills || [])];
  return {
    api: true,
    id: String(id ?? data.evaluation_id),
    date: createdAt || new Date().toISOString(),
    file: data.filename,
    major: data.field_id,
    majorName: data.field_name,
    total: data.overall_score,
    scores: cats.map((c) => c.score),
    labels: cats.map((c) => c.label),
    readiness: data.readiness,
    summary: data.summary || "",
    matchScore: match.match_score,
    strengths: data.strengths || [],
    weaknesses: data.weaknesses || [],
    have: skills.filter((s) => s.status === "has").map((s) => s.skill),
    missing: skills
      .filter((s) => s.status !== "has")
      .map((s) => (s.status === "partial" ? `${s.skill} (qismən)` : s.skill)),
  };
}

async function loadApiHistory() {
  const list = await api("/api/history");
  apiHistory = list
    .filter((item) => item.kind === "evaluation")
    .map((item) => ({
      api: true,
      partial: true, // tam nəticə /api/history/{id} ilə yüklənir
      id: String(item.id),
      date: item.created_at,
      file: item.filename,
      major: item.field_id,
      majorName: fieldName(item.field_id),
      total: item.score ?? 0,
    }));
  return apiHistory;
}

// ===== 5. CV Yoxla: fayl seçimi =====
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const cvForm = document.querySelector("#cv-form");
const dropzone = document.querySelector("#dropzone");
const fileInput = document.querySelector("#cv-file");
const fileChip = document.querySelector("#file-chip");
const fileNameEl = document.querySelector("#file-name");
const fileSizeEl = document.querySelector("#file-size");
const fileRemove = document.querySelector("#file-remove");
const fileError = document.querySelector("#cv-file-error");
const majorSelect = document.querySelector("#cv-major");
const majorError = document.querySelector("#cv-major-error");
const analyzeBtn = document.querySelector("#analyze-btn");

let selectedFile = null;

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Faylı yoxla: xəta varsa mətnini qaytarır
function validateFile(file) {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Yalnız PDF faylı yükləmək olar.";
  if (file.size > MAX_FILE_SIZE) return `Fayl çox böyükdür (${formatSize(file.size)}). Maksimum 5 MB.`;
  return "";
}

function setFileError(message) {
  fileError.textContent = message;
  dropzone.classList.toggle("is-invalid", Boolean(message));
}

function setFile(file) {
  const error = validateFile(file);
  if (error) {
    setFileError(error);
    showToast(error, "error");
    return;
  }
  selectedFile = file;
  setFileError("");
  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatSize(file.size);
  fileChip.hidden = false;
  dropzone.hidden = true;
}

function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  fileChip.hidden = true;
  dropzone.hidden = false;
}

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
  fileInput.value = "";
});

fileRemove.addEventListener("click", () => {
  clearFile();
  fileInput.focus();
});

// Sürüklə-burax
["dragenter", "dragover"].forEach((type) => {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((type) => {
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.remove("is-dragover");
  });
});

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (file) setFile(file);
});

// Fayl zonadan kənara atılanda brauzer onu açmasın
["dragover", "drop"].forEach((type) => {
  window.addEventListener(type, (event) => event.preventDefault());
});

majorSelect.addEventListener("change", () => {
  majorError.textContent = "";
  majorSelect.classList.remove("is-invalid");
});

// ===== 5. CV Yoxla: demo analiz =====
const CATEGORIES = [
  {
    name: "Struktur",
    good: "Bölmələr məntiqli ardıcıllıqla düzülüb, CV asan oxunur.",
    weak: "Bölmələrin ardıcıllığı qarışıqdır — Təhsil, Təcrübə və Bacarıqlar aydın ayrılmalıdır.",
  },
  {
    name: "ATS uyğunluğu",
    good: "Açar sözlər vakansiya tələblərinə uyğundur, ATS sistemləri CV-ni rahat oxuyur.",
    weak: "Vakansiyalardakı açar sözlər azdır — ATS sistemi CV-ni süzgəcdən keçirməyə bilər.",
  },
  {
    name: "Nəticə və göstəricilər",
    good: "Nailiyyətlər rəqəmlərlə göstərilib (faiz, say, müddət).",
    weak: "Təcrübədə nəticələr rəqəmlərlə göstərilməyib — məsələn, “satışları 15% artırdım”.",
  },
  {
    name: "Sahəyə uyğunluq",
    good: "Bacarıqların seçdiyin sahəyə yaxşı uyğun gəlir.",
    weak: "Seçdiyin sahə üçün əsas bacarıqların bir hissəsi CV-də görünmür.",
  },
];

// ===== İxtisaslar (məlumat) =====
// Bacarıq profilləri: hər ixtisas bu profillərdən birinə bağlanır (demo məlumat)
const PROFILES = {
  frontend: { role: "Frontend developer", skills: ["HTML/CSS", "JavaScript", "React", "TypeScript", "Git", "Responsiv dizayn", "REST API", "Testləşdirmə"] },
  backend: { role: "Backend developer", skills: ["Python", "SQL", "REST API", "Docker", "Git", "Linux", "Security", "Node.js"] },
  software: { role: "Proqram təminatı mütəxəssisi", skills: ["Python", "Java və ya C#", "SQL", "Git", "Alqoritmlər", "OOP", "REST API", "Linux"] },
  data: { role: "Data analitik", skills: ["Excel", "SQL", "Python", "Power BI", "Statistika", "Pandas", "Data vizuallaşdırma", "A/B testləri"] },
  itInfra: { role: "İT mütəxəssisi", skills: ["Şəbəkə əsasları", "Linux", "Windows Server", "SQL", "Bulud texnologiyaları", "Git", "Skriptləşdirmə", "ITIL əsasları"] },
  security: { role: "İnformasiya təhlükəsizliyi mütəxəssisi", skills: ["Şəbəkə əsasları", "Linux", "Python", "SIEM", "Penetrasiya testi", "Kriptoqrafiya", "Firewall", "ISO 27001"] },
  uiux: { role: "UI/UX dizayner", skills: ["Figma", "İstifadəçi araşdırması", "Wireframe", "Prototip", "Dizayn sistemi", "Usability testi", "Tipoqrafiya", "HTML/CSS əsasları"] },
  economics: { role: "İqtisadçı", skills: ["Excel", "Ekonometrika", "Power BI", "Maliyyə təhlili", "Makroiqtisadiyyat", "Python və ya R", "Hesabat yazma", "İngilis dili"] },
  finance: { role: "Maliyyə analitiki", skills: ["Excel", "1C", "MHBS (IFRS)", "Maliyyə təhlili", "Vergi qanunvericiliyi", "Büdcələmə", "Power BI", "ACCA əsasları"] },
  accounting: { role: "Mühasib", skills: ["Excel", "1C", "MHBS (IFRS)", "Audit əsasları", "Vergi qanunvericiliyi", "Maliyyə hesabatları", "Power BI", "ACCA əsasları"] },
  management: { role: "Menecer", skills: ["Strateji planlaşdırma", "Komanda idarəçiliyi", "Excel", "Büdcələmə", "Agile/Scrum", "Kommunikasiya", "Biznes təhlili", "CRM"] },
  project: { role: "Layihə koordinatoru", skills: ["Agile/Scrum", "Jira", "Risk idarəetməsi", "MS Project", "Büdcələmə", "Kommunikasiya", "Trello", "PMP əsasları"] },
  marketing: { role: "Marketinq mütəxəssisi", skills: ["SMM", "Google Analytics", "SEO", "Kontent yazılışı", "Meta Ads", "E-poçt marketinqi", "Brendinq", "Canva"] },
  sales: { role: "Satış meneceri", skills: ["Danışıqlar", "CRM", "Müştəri xidməti", "Satış hunisi", "Prezentasiya", "Excel", "B2B satış", "Soyuq zənglər"] },
  hr: { role: "HR mütəxəssisi", skills: ["İşə qəbul", "Əmək Məcəlləsi", "HRIS", "Müsahibə texnikaları", "Onboarding", "Excel", "Performans idarəetməsi", "Korporativ mədəniyyət"] },
  publicAdmin: { role: "Dövlət idarəçiliyi mütəxəssisi", skills: ["Normativ aktlar", "Sənədləşmə", "Dövlət qulluğu qanunvericiliyi", "Layihə idarəçiliyi", "Excel", "Analitik yazı", "Kommunikasiya", "Elektron hökumət xidmətləri"] },
  realEstate: { role: "Daşınmaz əmlak mütəxəssisi", skills: ["Qiymətləndirmə", "Daşınmaz əmlak hüququ", "Danışıqlar", "Excel", "Bazar təhlili", "CRM", "Layihə oxuma", "Müştəri xidməti"] },
  oilGas: { role: "Neft-qaz mühəndisi", skills: ["AutoCAD", "HSE", "Qazma texnologiyası", "MATLAB", "Petrel", "Hasilat mühəndisliyi", "Texniki ingilis dili", "Excel"] },
  chemical: { role: "Kimya mühəndisi", skills: ["Texnoloji proseslər", "Aspen HYSYS", "AutoCAD", "HSE", "Laborator analiz", "MATLAB", "Keyfiyyətə nəzarət", "Texniki ingilis dili"] },
  civil: { role: "İnşaat mühəndisi", skills: ["AutoCAD", "Revit", "ETABS", "Smeta", "Tikinti normaları", "Layihə oxuma", "HSE", "MS Project"] },
  architecture: { role: "Memar", skills: ["AutoCAD", "Revit", "ArchiCAD", "SketchUp", "Layihələndirmə", "Tikinti normaları", "3D vizuallaşdırma", "Portfolio"] },
  geomatics: { role: "Geodeziya mühəndisi", skills: ["GIS", "AutoCAD Civil 3D", "Total Station", "GPS/GNSS", "Kartoqrafiya", "Uzaqdan zondlama", "Excel", "Çöl işləri"] },
  electrical: { role: "Elektrik mühəndisi", skills: ["AutoCAD Electrical", "PLC", "Elektrik sxemləri", "MATLAB", "SCADA", "Enerji sistemləri", "Təhlükəsizlik qaydaları", "Excel"] },
  automation: { role: "Avtomatika mühəndisi", skills: ["PLC", "Elektronika sxemləri", "MATLAB", "SCADA", "Mikrokontrollerlər", "C/C++", "Şəbəkə əsasları", "Texniki ingilis dili"] },
  mechanical: { role: "Mexanika mühəndisi", skills: ["AutoCAD", "SolidWorks", "Texniki rəsm", "Materialşünaslıq", "CNC əsasları", "HSE", "Keyfiyyətə nəzarət", "Texniki ingilis dili"] },
  food: { role: "Qida texnoloqu", skills: ["Qida təhlükəsizliyi (HACCP)", "Laborator analiz", "Texnoloji proseslər", "ISO 22000", "Keyfiyyətə nəzarət", "Excel", "Sanitariya normaları", "Komanda işi"] },
  logistics: { role: "Logistika mütəxəssisi", skills: ["Təchizat zənciri", "Excel", "SAP", "Gömrük prosedurları", "İnventar idarəetməsi", "İnkoterms", "Danışıqlar", "Power BI"] },
  law: { role: "Hüquqşünas", skills: ["Mülki hüquq", "Hüquqi yazı", "Müqavilə hazırlığı", "Məhkəmə təcrübəsi", "Hüquqi ingilis dili", "Normativ aktlar bazası", "Danışıqlar", "Korporativ hüquq"] },
  intRelations: { role: "Beynəlxalq əlaqələr mütəxəssisi", skills: ["Diplomatik yazışma", "Xarici dillər", "Analitik yazı", "Danışıqlar", "Geosiyasət", "Beynəlxalq hüquq", "İctimai çıxış", "Tədqiqat"] },
  research: { role: "Tədqiqatçı-analitik", skills: ["Tədqiqat metodları", "Analitik yazı", "SPSS", "Arxiv işi", "Xarici dillər", "İctimai çıxış", "Hesabat hazırlama", "Excel"] },
  psychology: { role: "Psixoloq", skills: ["Konsultasiya", "Psixoloji testlər", "SPSS", "Tədqiqat metodları", "Empatik ünsiyyət", "Etik qaydalar", "Hesabat yazma", "Qrup işi"] },
  socialWork: { role: "Sosial işçi", skills: ["Sosial təminat qanunvericiliyi", "Müsahibə aparma", "Fərdi iş (case management)", "Empatik ünsiyyət", "Sənədləşmə", "Komanda işi", "Böhran müdaxiləsi", "Excel"] },
  philology: { role: "Filoloq", skills: ["Mətn redaktəsi", "Ədəbi təhlil", "Xarici dil (B2+)", "CAT alətləri", "Akademik yazı", "İctimai çıxış", "Korrektura", "Tədqiqat"] },
  translation: { role: "Tərcüməçi", skills: ["Yazılı tərcümə", "Şifahi tərcümə", "CAT alətləri (Trados, MemoQ)", "Terminologiya", "Redaktə", "İkinci xarici dil", "Lokalizasiya", "Vaxtın idarə edilməsi"] },
  media: { role: "Media mütəxəssisi", skills: ["Xəbər yazısı", "Redaktə", "Müsahibə", "Fotojurnalistika", "SMM", "Video montaj", "Fakt yoxlama", "Media etikası"] },
  archive: { role: "Arxiv və muzey mütəxəssisi", skills: ["Kataloqlaşdırma", "Rəqəmsal arxiv", "Kitabxana proqramları", "Sənədlərin mühafizəsi", "Tədqiqat", "Ekspozisiya", "Xarici dil", "Excel"] },
  medicine: { role: "Həkim-rezident", skills: ["Klinik bacarıqlar", "Tibbi ingilis dili", "Diaqnostika", "İlk yardım", "Tibbi etika", "Elektron tibbi qeydlər", "Pasiyentlə ünsiyyət", "Laborator analizlər"] },
  dentistry: { role: "Stomatoloq", skills: ["Klinik bacarıqlar", "Stomatoloji diaqnostika", "Rentgen təhlili", "Sterilizasiya", "Pasiyentlə ünsiyyət", "Tibbi etika", "Tibbi ingilis dili", "Elektron tibbi qeydlər"] },
  pharmacy: { role: "Əczaçı", skills: ["Farmakologiya", "Dərman qarşılıqlı təsiri", "Aptek proqramları", "GMP standartları", "Müştəri məsləhəti", "İnventar idarəetməsi", "Tibbi ingilis dili", "Keyfiyyətə nəzarət"] },
  nursing: { role: "Tibb bacısı", skills: ["Pasiyentə qulluq", "İlk yardım", "İnyeksiya texnikası", "Tibbi sənədləşmə", "İnfeksiya nəzarəti", "Pasiyentlə ünsiyyət", "Tibbi etika", "Komanda işi"] },
  publicHealth: { role: "İctimai səhiyyə mütəxəssisi", skills: ["Epidemiologiya", "Biostatistika", "SPSS", "Sağlamlığın təşviqi", "Tədqiqat metodları", "Hesabat yazma", "Excel", "Kommunikasiya"] },
  agriculture: { role: "Aqronom", skills: ["Torpaqşünaslıq", "Bitki mühafizəsi", "Suvarma sistemləri", "GIS", "Aqrotexnika", "Excel", "Aqrar iqtisadiyyat", "Dronla monitorinq"] },
  veterinary: { role: "Baytar", skills: ["Heyvan anatomiyası", "Diaqnostika", "Cərrahiyyə əsasları", "Farmakologiya", "Epizootologiya", "Sanitariya-gigiyena", "Laborator analiz", "Müştəri ilə ünsiyyət"] },
  math: { role: "Riyaziyyatçı-analitik", skills: ["Python", "Statistika", "Xətti cəbr", "Optimallaşdırma", "MATLAB", "SQL", "LaTeX", "Modelləşdirmə"] },
  science: { role: "Laboratoriya mütəxəssisi", skills: ["Laborator təcrübə", "Tədqiqat metodları", "Statistik təhlil", "Elmi yazı", "Təhlükəsizlik qaydaları", "Python və ya R", "Cihazlarla iş", "İngilis dili"] },
  earth: { role: "Ekoloq-geoloq", skills: ["GIS", "Çöl tədqiqatları", "Uzaqdan zondlama", "Ekoloji monitorinq", "Excel", "AutoCAD", "Hesabat yazma", "Xəritəçəkmə"] },
  teacher: { role: "Müəllim", skills: ["Dərs planlaması", "Sinif idarəetməsi", "Qiymətləndirmə", "Rəqəmsal təhsil alətləri", "İnklüziv təhsil", "Kurikulum", "Valideynlə ünsiyyət", "Təqdimat"] },
  design: { role: "Qrafik dizayner", skills: ["Photoshop", "Illustrator", "Figma", "Tipoqrafiya", "Brendinq", "Portfolio", "Motion dizayn", "Rəng nəzəriyyəsi"] },
  fineArt: { role: "Rəssam", skills: ["Rəsm texnikaları", "Kompozisiya", "Rəng nəzəriyyəsi", "Portfolio", "Photoshop", "Sərgi təşkili", "Sənət tarixi", "Rəqəmsal illüstrasiya"] },
  music: { role: "Musiqiçi", skills: ["İfaçılıq texnikası", "Musiqi nəzəriyyəsi", "Not oxuma", "Ansambl işi", "Səs yazısı (DAW)", "Səhnə təcrübəsi", "Musiqi tarixi", "Pedaqoji təcrübə"] },
  stage: { role: "Səhnə sənəti mütəxəssisi", skills: ["Səhnə danışığı", "İmprovizasiya", "Ssenari təhlili", "Kamera qarşısında iş", "Plastika", "Rejissor təfəkkürü", "Video montaj", "Komanda işi"] },
  tourism: { role: "Turizm meneceri", skills: ["Müştəri xidməti", "Xarici dillər", "Rezervasiya sistemləri", "Tur planlama", "Satış", "Tədbir təşkili", "Mədəniyyətlərarası ünsiyyət", "Problemin həlli"] },
  sport: { role: "İdman mütəxəssisi", skills: ["Məşq planlaması", "İdman fiziologiyası", "İlk yardım", "Qidalanma əsasları", "Pedaqoji bacarıqlar", "Motivasiya", "Fitnes testləri", "Komanda idarəçiliyi"] },
  general: { role: "Ofis koordinatoru", skills: ["Kommunikasiya", "Excel", "Komanda işi", "İngilis dili", "Vaxtın idarə edilməsi", "Problemin həlli", "Prezentasiya", "Kritik düşünmə"] },
};

// İxtisaslar CLAUDE.md-dəki 7 qrup üzrə: [ad, profil]
// Əsas mənbə: Nazirlər Kabinetinin bakalavriat ixtisasları təsnifatı (qısaldılmış adlarla)
const SPECIALTY_GROUPS = [
  {
    group: "İnformasiya texnologiyaları",
    items: [
      ["Kompüter elmləri", "software"],
      ["Kompüter mühəndisliyi", "software"],
      ["İnformasiya texnologiyaları", "itInfra"],
      ["İnformasiya təhlükəsizliyi", "security"],
      ["Sistem mühəndisliyi", "itInfra"],
      ["Frontend proqramlaşdırma", "frontend"],
      ["Backend proqramlaşdırma", "backend"],
      ["Data analitika", "data"],
      ["UI/UX dizayn", "uiux"],
    ],
  },
  {
    group: "Biznes və maliyyə",
    items: [
      ["İqtisadiyyat", "economics"],
      ["Dünya iqtisadiyyatı", "economics"],
      ["Statistika", "data"],
      ["Maliyyə", "finance"],
      ["Mühasibat uçotu və audit", "accounting"],
      ["Menecment", "management"],
      ["Biznesin idarə edilməsi", "management"],
      ["Marketinq", "marketing"],
      ["İnsan resurslarının idarə edilməsi", "hr"],
      ["Dövlət və bələdiyyə idarəetməsi", "publicAdmin"],
      ["Daşınmaz əmlakın idarə olunması", "realEstate"],
      ["Satış", "sales"],
      ["Layihə idarəçiliyi", "project"],
    ],
  },
  {
    group: "Mühəndislik və sənaye",
    items: [
      ["Neft-qaz mühəndisliyi", "oilGas"],
      ["Kimya mühəndisliyi", "chemical"],
      ["Geologiya mühəndisliyi", "earth"],
      ["Mədən mühəndisliyi", "mechanical"],
      ["İnşaat mühəndisliyi", "civil"],
      ["Memarlıq", "architecture"],
      ["Geomatika və geodeziya mühəndisliyi", "geomatics"],
      ["Elektrik mühəndisliyi", "electrical"],
      ["Energetika mühəndisliyi", "electrical"],
      ["Elektronika, telekommunikasiya və radiotexnika mühəndisliyi", "automation"],
      ["Proseslərin avtomatlaşdırılması mühəndisliyi", "automation"],
      ["Mexatronika və robototexnika mühəndisliyi", "automation"],
      ["Biotibbi mühəndislik", "automation"],
      ["Mexanika mühəndisliyi", "mechanical"],
      ["Maşın mühəndisliyi", "mechanical"],
      ["Materiallar mühəndisliyi", "mechanical"],
      ["Metallurgiya mühəndisliyi", "mechanical"],
      ["Cihazqayırma mühəndisliyi", "mechanical"],
      ["Metrologiya, standartlaşdırma və sertifikatlaşdırma mühəndisliyi", "mechanical"],
      ["Yüngül sənaye mühəndisliyi", "mechanical"],
      ["Qida mühəndisliyi", "food"],
      ["Ətraf mühit mühəndisliyi", "earth"],
      ["Logistika və nəqliyyat texnologiyaları mühəndisliyi", "logistics"],
    ],
  },
  {
    group: "Hüquq, media və sosial",
    items: [
      ["Hüquqşünaslıq", "law"],
      ["Beynəlxalq münasibətlər", "intRelations"],
      ["Politologiya", "research"],
      ["Regionşünaslıq", "intRelations"],
      ["Şərqşünaslıq", "research"],
      ["Sosiologiya", "research"],
      ["Psixologiya", "psychology"],
      ["Sosial iş", "socialWork"],
      ["Tarix", "research"],
      ["Fəlsəfə", "research"],
      ["İlahiyyat", "research"],
      ["Filologiya", "philology"],
      ["Dilçilik", "philology"],
      ["Tərcümə", "translation"],
      ["Jurnalistika", "media"],
      ["Kommunikasiya və rəqəmsal media", "media"],
      ["Kitabxanaçılıq və informasiya", "archive"],
      ["Muzeyşünaslıq, arxivşünaslıq və abidələrin mühafizəsi", "archive"],
    ],
  },
  {
    group: "Səhiyyə və kənd təsərrüfatı",
    items: [
      ["Müalicə işi", "medicine"],
      ["Pediatriya", "medicine"],
      ["Stomatologiya", "dentistry"],
      ["Əczaçılıq", "pharmacy"],
      ["Tibb bacısı işi", "nursing"],
      ["İctimai səhiyyə", "publicHealth"],
      ["Tibbi-profilaktika işi", "publicHealth"],
      ["Aqronomluq", "agriculture"],
      ["Aqromühəndislik", "agriculture"],
      ["Bitki mühafizəsi", "agriculture"],
      ["Torpaqşünaslıq və aqrokimya", "agriculture"],
      ["Meşəçilik", "agriculture"],
      ["Zoomühəndislik", "veterinary"],
      ["Baytarlıq", "veterinary"],
    ],
  },
  {
    group: "Xidmət və yaradıcı sahələr",
    items: [
      ["Azərbaycan dili və ədəbiyyatı müəllimliyi", "teacher"],
      ["Xarici dil müəllimliyi", "teacher"],
      ["Riyaziyyat müəllimliyi", "teacher"],
      ["Riyaziyyat və informatika müəllimliyi", "teacher"],
      ["İnformatika müəllimliyi", "teacher"],
      ["Fizika müəllimliyi", "teacher"],
      ["Kimya müəllimliyi", "teacher"],
      ["Biologiya müəllimliyi", "teacher"],
      ["Kimya və biologiya müəllimliyi", "teacher"],
      ["Tarix müəllimliyi", "teacher"],
      ["Tarix və coğrafiya müəllimliyi", "teacher"],
      ["Coğrafiya müəllimliyi", "teacher"],
      ["İbtidai sinif müəllimliyi", "teacher"],
      ["Məktəbəqədər təhsil", "teacher"],
      ["Musiqi müəllimliyi", "teacher"],
      ["Təsviri incəsənət müəllimliyi", "teacher"],
      ["Texnologiya müəllimliyi", "teacher"],
      ["Fiziki tərbiyə və çağırışaqədər hazırlıq müəllimliyi", "teacher"],
      ["Turizm və otelçilik", "tourism"],
      ["Fiziki tərbiyə və idman", "sport"],
      ["Ümumi fiziki hazırlıq", "sport"],
      ["Dizayn", "design"],
      ["Rəssamlıq", "fineArt"],
      ["Heykəltəraşlıq", "fineArt"],
      ["Dekorativ-tətbiqi sənət", "fineArt"],
      ["Sənətşünaslıq", "research"],
      ["Mədəniyyətşünaslıq", "research"],
      ["Musiqişünaslıq", "music"],
      ["Bəstəkarlıq", "music"],
      ["İnstrumental ifaçılıq", "music"],
      ["Vokal sənəti", "music"],
      ["Dirijorluq", "music"],
      ["Aktyor sənəti", "stage"],
      ["Rejissorluq", "stage"],
      ["Xoreoqrafiya sənəti", "stage"],
    ],
  },
  {
    group: "Təbiət elmləri və digər",
    items: [
      ["Riyaziyyat", "math"],
      ["Mexanika", "math"],
      ["Fizika", "science"],
      ["Kimya", "science"],
      ["Biologiya", "science"],
      ["Coğrafiya", "earth"],
      ["Geologiya", "earth"],
      ["Ekologiya", "earth"],
      ["Hidrometeorologiya", "earth"],
      ["Digər", "general"],
    ],
  },
];

// İxtisas adı → profil (sürətli axtarış üçün)
const SPECIALTY_PROFILE = new Map(
  SPECIALTY_GROUPS.flatMap(({ items }) => items.map(([name, profile]) => [name, profile]))
);

function getProfile(major) {
  return PROFILES[SPECIALTY_PROFILE.get(major)] || PROFILES.general;
}

function getSkills(major) {
  return getProfile(major).skills;
}

// Vakansiya adı: "Fizika müəllimliyi" → "Fizika müəllimi"
function getRole(major) {
  if (/müəllimliyi$/.test(major)) return major.replace(/müəllimliyi$/, "müəllimi");
  return getProfile(major).role;
}

// Seçim siyahısını qruplarla doldur (əlifba sırası ilə, "Digər" sonda)
function fillSpecialtySelect(select) {
  SPECIALTY_GROUPS.forEach(({ group, items }) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group;
    [...items]
      .sort(([a], [b]) => (a === "Digər") - (b === "Digər") || a.localeCompare(b, "az"))
      .forEach(([name]) => optgroup.appendChild(new Option(name, name)));
    select.appendChild(optgroup);
  });
}

fillSpecialtySelect(majorSelect);

// API rejimində siyahı backend-in real analiz edə bildiyi sahələrdən qurulur
function fillApiFieldSelect(select) {
  const selected = select.value;
  select.innerHTML = "";
  select.appendChild(new Option("Hədəf sahəni seç", ""));
  apiFields.forEach((field) => select.appendChild(new Option(field.name, field.id)));
  if (apiFields.some((f) => f.id === selected)) select.value = selected;
}

// Zəif kateqoriyalar üçün plan tapşırıqları
const CATEGORY_TASKS = [
  "CV-ni Təhsil → Təcrübə → Bacarıqlar ardıcıllığı ilə yenidən düz",
  "Bəyəndiyin 3 vakansiyadan açar sözləri çıxar və CV-yə əlavə et",
  "Hər təcrübə bəndinə ən azı bir rəqəmli nəticə yaz (%, say, müddət)",
  "Sahənə aid olmayan bəndləri qısalt, əsas bacarıqları önə çıxar",
];

// Eyni fayl və ixtisas üçün həmişə eyni demo nəticə
function makeSeed(text) {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function demoScores(file, major) {
  let seed = makeSeed(`${file.name}|${file.size}|${major}`);
  const scores = CATEGORIES.map(() => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return 45 + ((seed >>> 16) % 48); // 45–92 arası
  });

  // Həmişə ən azı bir güclü və bir zəif tərəf olsun
  if (scores.every((s) => s >= 70)) scores[scores.indexOf(Math.min(...scores))] = 58;
  if (scores.every((s) => s < 70)) scores[scores.indexOf(Math.max(...scores))] = 78;
  return scores;
}

// Sadə təsadüfi ədəd generatoru (eyni toxum → eyni ardıcıllıq)
function seededRandom(seed) {
  let state = seed || 1;
  return () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return (state >>> 16) / 65536;
  };
}

function shuffled(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Bacarıqları "var" və "çatışmır" deyə böl: sahə balı aşağıdırsa, çatışmayan çox olur
function demoSkills(file, major, fieldScore) {
  const all = getSkills(major);
  const random = seededRandom(makeSeed(`${file.name}|${major}|bacarıq`));
  const missingCount = Math.min(5, Math.max(2, Math.round((100 - fieldScore) / 12)));
  const missingSet = new Set(shuffled(all, random).slice(0, missingCount));
  return {
    have: all.filter((s) => !missingSet.has(s)),
    missing: all.filter((s) => missingSet.has(s)),
  };
}

function verdictText(total) {
  if (total >= 80) return "Əla! CV-n müraciətə hazırdır.";
  if (total >= 65) return "Yaxşı, amma bir neçə düzəliş lazımdır.";
  if (total >= 50) return "Orta — əsas bölmələri gücləndirmək lazımdır.";
  return "Zəif — CV-ni ciddi şəkildə yeniləmək lazımdır.";
}

// ===== 5. CV Yoxla: yüklənmə animasiyası =====
const loader = document.querySelector("#loader");
const loaderText = document.querySelector("#loader-text");
const LOADER_STEPS = ["CV oxunur…", "Bacarıqlar müqayisə edilir…", "Bal hesablanır…"];
const ANALYSIS_TIME = 2500;

function runLoader() {
  return new Promise((resolve) => {
    let step = 0;
    loaderText.textContent = LOADER_STEPS[0];
    // Animasiyanı yenidən başlatmaq üçün zolağı yenilə
    const bar = loader.querySelector(".loader-bar-fill");
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "";
    loader.hidden = false;

    const timer = setInterval(() => {
      step = Math.min(step + 1, LOADER_STEPS.length - 1);
      loaderText.textContent = LOADER_STEPS[step];
    }, ANALYSIS_TIME / LOADER_STEPS.length);

    setTimeout(() => {
      clearInterval(timer);
      loader.hidden = true;
      resolve();
    }, ANALYSIS_TIME);
  });
}

// Real AI analizi: nə qədər çəkəcəyi bilinmir, keçən saniyələr göstərilir
function startApiLoader(steps = LOADER_STEPS) {
  const started = Date.now();
  let step = 0;
  loaderText.textContent = steps[0];
  loader.classList.add("is-indeterminate");
  loader.hidden = false;

  const timer = setInterval(() => {
    step = Math.min(step + 1, steps.length - 1);
    const seconds = Math.round((Date.now() - started) / 1000);
    loaderText.textContent = `${steps[step]} (${seconds} san)`;
  }, 3000);

  return () => {
    clearInterval(timer);
    loader.hidden = true;
    loader.classList.remove("is-indeterminate");
  };
}

// ===== 5. CV Yoxla: nəticəni göstər =====
const result = document.querySelector("#result");
const resultMeta = document.querySelector("#result-meta");
const resultRing = document.querySelector("#result-ring");
const resultNumber = document.querySelector("#result-number");
const resultVerdict = document.querySelector("#result-verdict");
const resultBars = document.querySelector("#result-bars");
const resultStrengths = document.querySelector("#result-strengths");
const resultWeaknesses = document.querySelector("#result-weaknesses");
const resultReset = document.querySelector("#result-reset");
const resultSummary = document.querySelector("#result-summary");
const resultWarning = document.querySelector("#result-warning");

const READINESS_TEXT = {
  ready: "Hazırdır — müraciət etməyə başlaya bilərsən.",
  almost_ready: "Az qalıb — bir neçə düzəliş lazımdır.",
  needs_work: "İnkişaf lazımdır — əvvəlcə əsas boşluqları bağla.",
};

// Real API nəticəsi: backend-in öz kateqoriya adları, rəyi və güclü/zəif tərəfləri
function applyApiResult(entry) {
  resultVerdict.textContent = READINESS_TEXT[entry.readiness] || verdictText(entry.total);
  resultBars.querySelectorAll(".bar-label span").forEach((span, i) => {
    if (entry.labels[i]) span.textContent = entry.labels[i];
  });
  fillList(resultStrengths, entry.strengths.length ? entry.strengths : ["Hələ güclü tərəf qeyd olunmayıb."]);
  fillList(resultWeaknesses, entry.weaknesses.length ? entry.weaknesses : ["Ciddi zəif tərəf tapılmadı."]);
  resultSummary.textContent = entry.summary;
  resultSummary.hidden = !entry.summary;
  resultWarning.hidden = !(typeof entry.matchScore === "number" && entry.matchScore < 35);
}

function fillList(list, items) {
  list.innerHTML = "";
  items.forEach((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  });
}

// total verilməyibsə, 4 kateqoriyanın ortalaması götürülür (demo rejim)
function renderResult(file, major, scores, isoDate = new Date().toISOString(), totalOverride = null) {
  const total = totalOverride ?? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  resultMeta.textContent = `${file.name} · ${major} · ${formatDate(isoDate)}`;
  resultRing.style.setProperty("--score", total);
  resultNumber.dataset.count = total;
  resultVerdict.textContent = verdictText(total);

  // Kateqoriya zolaqları
  resultBars.innerHTML = "";
  CATEGORIES.forEach((cat, i) => {
    const li = document.createElement("li");
    li.style.setProperty("--value", scores[i]);
    li.innerHTML = `
      <div class="bar-label"><span></span><strong>${scores[i]}</strong></div>
      <div class="bar" aria-hidden="true"><span class="bar-fill ${scores[i] >= 70 ? "is-good" : "is-weak"}"></span></div>`;
    li.querySelector(".bar-label span").textContent = cat.name;
    resultBars.appendChild(li);
  });

  // Güclü və zəif tərəflər
  fillList(resultStrengths, CATEGORIES.filter((_, i) => scores[i] >= 70).map((c) => c.good));
  fillList(resultWeaknesses, CATEGORIES.filter((_, i) => scores[i] < 70).map((c) => c.weak));

  // Animasiyanı sıfırdan başlat
  result.classList.remove("is-visible");
  result.hidden = false;
  void result.offsetWidth;
  showElement(result);

  return total;
}

// Analiz tarixçəsi (kabinet üçün də istifadə olunur)
function readHistory() {
  try {
    const history = JSON.parse(readStorage("analizTarixcesi"));
    return Array.isArray(history) ? history : [];
  } catch (error) {
    return [];
  }
}

function saveHistory(entry) {
  const history = readHistory();
  history.unshift(entry);
  writeStorage("analizTarixcesi", JSON.stringify(history.slice(0, 20)));
}

function formatDate(iso) {
  const d = new Date(iso);
  return [d.getDate(), d.getMonth() + 1]
    .map((n) => String(n).padStart(2, "0"))
    .concat(d.getFullYear())
    .join(".");
}

function makePill(text, type) {
  const li = document.createElement("li");
  li.className = `pill pill-${type}`;
  li.textContent = text;
  return li;
}

let currentAnalysis = null;

// ===== 5. CV Yoxla — Tab 2: Bacarıq boşluğu =====
function renderSkills(analysis) {
  const { have, missing } = analysis;
  const total = have.length + missing.length;
  const percent = Math.round((have.length / total) * 100);

  document.querySelector("#gap-summary").textContent =
    `Sahənin ${total} əsas bacarığından ${have.length}-i CV-ində var (${percent}%).`;
  document.querySelector("#gap-bar").style.setProperty("--value", percent);

  const haveList = document.querySelector("#skills-have");
  const missingList = document.querySelector("#skills-missing");
  haveList.innerHTML = "";
  missingList.innerHTML = "";
  have.forEach((s) => haveList.appendChild(makePill(s, "have")));
  missing.forEach((s) => missingList.appendChild(makePill(s, "missing")));
}

// ===== 5. CV Yoxla — Tab 3: 7/14/21 günlük plan =====
const planDaysEl = document.querySelector("#plan-days");
const planProgressText = document.querySelector("#plan-progress-text");
const planProgressBar = document.querySelector("#plan-progress-bar");
const segments = document.querySelectorAll(".segment");

// Plan nə qədər uzundursa, hər bacarığa o qədər çox tapşırıq düşür
function buildPlanTasks(analysis, days) {
  const steps = {
    7: [0, 3],
    14: [0, 1, 3],
    21: [0, 1, 2, 3],
  }[days];
  const templates = [
    (s) => `${s}: əsasları öyrən — pulsuz video kurs və ya məqalə (1–2 saat)`,
    (s) => `${s}: kiçik praktik tapşırıq et və nəticəni yadda saxla`,
    (s) => `${s}: mini layihə hazırla və portfolioya əlavə et`,
    (s) => `“${s}” bacarığını CV-yə və LinkedIn profilinə əlavə et`,
  ];

  const tasks = [];
  // Əvvəlcə zəif kateqoriyaların düzəlişi
  analysis.scores.forEach((score, i) => {
    if (score < 70) tasks.push(CATEGORY_TASKS[i]);
  });
  // Sonra çatışmayan bacarıqlar
  analysis.missing.forEach((skill) => {
    steps.forEach((step) => tasks.push(templates[step](skill)));
  });
  // Sonda yekun addımlar
  tasks.push("Yenilənmiş CV-ni Karyera Mentoru ilə yenidən yoxla");
  tasks.push("Ən uyğun 3 vakansiyaya müraciət et");
  return tasks;
}

// Tapşırıqları günlərə böl: "Gün 1", "Gün 3–4" və s.
function groupByDays(tasks, days) {
  const groups = [];
  tasks.forEach((text, index) => {
    const start = Math.floor((index * days) / tasks.length) + 1;
    const end = Math.max(start, Math.floor(((index + 1) * days) / tasks.length));
    const label = start === end ? `Gün ${start}` : `Gün ${start}–${end}`;
    const last = groups[groups.length - 1];
    if (last && last.start === start) {
      last.tasks.push({ text, index });
    } else {
      groups.push({ start, label, tasks: [{ text, index }] });
    }
  });
  return groups;
}

function planKey(analysis, days) {
  return `plan_${analysis.id}_${days}`;
}

function readPlanState(analysis, days) {
  try {
    const saved = JSON.parse(readStorage(planKey(analysis, days)));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function updatePlanProgress(total, done) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  planProgressText.textContent = `${done} / ${total} tapşırıq · ${percent}%`;
  planProgressBar.style.setProperty("--value", percent);
  return percent;
}

// ----- API rejimi: backend-in 21 günlük planı (1–7, 8–14, 15–21 gün) -----
// 7 gün → 1-ci mərhələ, 14 gün → ilk 2 mərhələ, 21 gün → bütün plan
const PHASES_BY_DAYS = {
  7: ["foundation"],
  14: ["foundation", "practice"],
  21: ["foundation", "practice", "interview"],
};

function apiPlanKey(analysis) {
  return `plan_api_${analysis.id}`;
}

function readApiPlanState(analysis) {
  try {
    const saved = JSON.parse(readStorage(apiPlanKey(analysis)));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function planMessage(text) {
  planDaysEl.innerHTML = "";
  const p = document.createElement("p");
  p.className = "plan-summary";
  p.textContent = text;
  planDaysEl.appendChild(p);
  updatePlanProgress(0, 0);
}

async function generateApiPlan(analysis, button) {
  button.disabled = true;
  button.textContent = "AI plan hazırlayır… (1 dəqiqəyə qədər)";
  try {
    const roadmap = await api(`/api/roadmap/${analysis.id}`, { method: "POST" }, 180000);
    apiRoadmaps.set(analysis.id, roadmap);
    showToast("21 günlük plan hazırdır!", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
  if (currentAnalysis === analysis) renderApiPlan(analysis);
}

async function renderApiPlan(analysis) {
  const days = analysis.planDays;
  segments.forEach((btn) => {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.days) === days));
  });

  const roadmap = apiRoadmaps.get(analysis.id);
  if (!roadmap) {
    planMessage("Plan yüklənir…");
    try {
      apiRoadmaps.set(analysis.id, await api(`/api/roadmap/${analysis.id}`));
    } catch (error) {
      planMessage(error.message);
      return;
    }
    if (currentAnalysis === analysis) renderApiPlan(analysis);
    return;
  }

  // Plan hələ yaradılmayıb — AI ilə yaratmaq düyməsi
  if (!roadmap.generated) {
    planDaysEl.innerHTML = "";
    const box = document.createElement("div");
    box.className = "plan-cta";
    const text = document.createElement("p");
    text.textContent = "AI çatışmayan bacarıqlarına görə 21 günlük fərdi plan hazırlayacaq: 1–7, 8–14 və 15–21-ci günlər.";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary";
    button.textContent = "AI ilə plan yarat";
    button.addEventListener("click", () => generateApiPlan(analysis, button));
    box.append(text, button);
    planDaysEl.appendChild(box);
    updatePlanProgress(0, 0);
    return;
  }

  const phases = roadmap.roadmap.filter((phase) => PHASES_BY_DAYS[days].includes(phase.key));
  const checked = new Set(readApiPlanState(analysis));
  let total = 0;
  let done = 0;

  planDaysEl.innerHTML = "";
  if (roadmap.summary) {
    const summary = document.createElement("p");
    summary.className = "plan-summary";
    summary.textContent = roadmap.summary;
    planDaysEl.appendChild(summary);
  }

  phases.forEach((phase) => {
    // Tapşırıqları günlərə qruplaşdır
    const byDay = new Map();
    phase.tasks.forEach((task, index) => {
      if (!byDay.has(task.day)) byDay.set(task.day, []);
      byDay.get(task.day).push({ task, id: `${phase.key}-${index}` });
    });

    [...byDay.keys()].sort((a, b) => a - b).forEach((dayNumber) => {
      const day = document.createElement("div");
      day.className = "plan-day";
      const title = document.createElement("p");
      title.className = "plan-day-title";
      title.textContent = `Gün ${dayNumber} · ${phase.label}`;
      day.appendChild(title);

      const list = document.createElement("ul");
      list.className = "plan-tasks";
      byDay.get(dayNumber).forEach(({ task, id }) => {
        total += 1;
        if (checked.has(id)) done += 1;
        const li = document.createElement("li");
        const label = document.createElement("label");
        label.className = "plan-task";
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = checked.has(id);
        box.dataset.task = id;
        const span = document.createElement("span");
        span.textContent = `${task.title} — ${task.details}`;
        const meta = document.createElement("small");
        meta.className = "plan-task-meta";
        meta.textContent = `Nəticə: ${task.deliverable}`;
        span.appendChild(meta);
        label.append(box, span);
        li.appendChild(label);
        list.appendChild(li);
      });
      day.appendChild(list);
      planDaysEl.appendChild(day);
    });
  });

  updatePlanProgress(total, done);
}

function renderPlan(analysis) {
  if (analysis.api) {
    renderApiPlan(analysis);
    return;
  }
  const days = analysis.planDays;
  const tasks = buildPlanTasks(analysis, days);
  const checked = new Set(readPlanState(analysis, days));

  segments.forEach((btn) => {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.days) === days));
  });

  planDaysEl.innerHTML = "";
  groupByDays(tasks, days).forEach((group) => {
    const day = document.createElement("div");
    day.className = "plan-day";

    const title = document.createElement("p");
    title.className = "plan-day-title";
    title.textContent = group.label;
    day.appendChild(title);

    const list = document.createElement("ul");
    list.className = "plan-tasks";
    group.tasks.forEach(({ text, index }) => {
      const li = document.createElement("li");
      const label = document.createElement("label");
      label.className = "plan-task";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = checked.has(index);
      box.dataset.index = index;
      const span = document.createElement("span");
      span.textContent = text;
      label.append(box, span);
      li.appendChild(label);
      list.appendChild(li);
    });
    day.appendChild(list);
    planDaysEl.appendChild(day);
  });

  updatePlanProgress(tasks.length, checked.size);
}

// Çekboks işarələnəndə yadda saxla və irəliləyişi yenilə
planDaysEl.addEventListener("change", (event) => {
  if (!event.target.matches('input[type="checkbox"]') || !currentAnalysis) return;
  const boxes = [...planDaysEl.querySelectorAll('input[type="checkbox"]')];
  const doneCount = boxes.filter((b) => b.checked).length;

  if (currentAnalysis.api) {
    // Bütün 21 günlük planın vəziyyəti bir yerdə saxlanır (7/14/21 görünüşü dəyişsə də itmir)
    const state = new Set(readApiPlanState(currentAnalysis));
    boxes.forEach((b) => (b.checked ? state.add(b.dataset.task) : state.delete(b.dataset.task)));
    writeStorage(apiPlanKey(currentAnalysis), JSON.stringify([...state]));
  } else {
    const done = boxes.filter((b) => b.checked).map((b) => Number(b.dataset.index));
    writeStorage(planKey(currentAnalysis, currentAnalysis.planDays), JSON.stringify(done));
  }

  const percent = updatePlanProgress(boxes.length, doneCount);
  if (percent === 100 && event.target.checked) {
    showToast("Təbriklər! Plan tam yerinə yetirildi 🎉", "success");
  }
});

segments.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!currentAnalysis) return;
    currentAnalysis.planDays = Number(btn.dataset.days);
    renderPlan(currentAnalysis);
  });
});

// ===== 5. CV Yoxla — Tab 4: Vakansiya və tarixçə =====
const JOB_TEMPLATES = [
  { title: (r) => `${r} — təcrübə proqramı`, org: "Böyük yerli şirkət", type: "Staj · Bakı" },
  { title: (r) => `Junior ${r}`, org: "Yerli startap", type: "Tam ştat · Bakı" },
  { title: (r) => `${r} köməkçisi`, org: "Beynəlxalq şirkətin Bakı ofisi", type: "Hibrid" },
  { title: (r) => `${r} (uzaqdan)`, org: "Xarici şirkət", type: "Uzaqdan · Part-time" },
];

function renderJobs(analysis) {
  // Backend-də hələ vakansiya mənbəyi yoxdur — vakansiyalar demo olaraq qalır,
  // amma API rejimində real sahə adı və real bacarıqlar istifadə olunur
  const role = analysis.api ? analysis.majorName : getRole(analysis.major);
  const all = analysis.api
    ? [...analysis.have, ...analysis.missing.map((s) => s.replace(/ \(qismən\)$/, ""))]
    : getSkills(analysis.major);
  if (analysis.api && !all.length) all.push("Kommunikasiya", "Komanda işi", "İngilis dili", "Excel");
  const random = seededRandom(makeSeed(`${analysis.file}|${analysis.major}|vakansiya`));
  const haveSet = new Set(analysis.have);

  const jobs = JOB_TEMPLATES.map((tpl) => {
    const required = shuffled(all, random).slice(0, 4);
    const matched = required.filter((s) => haveSet.has(s)).length;
    const match = Math.min(97, Math.max(30, Math.round((matched / 4) * 50 + analysis.total * 0.5)));
    return { title: tpl.title(role), org: tpl.org, type: tpl.type, required, match };
  }).sort((a, b) => b.match - a.match);

  const list = document.querySelector("#jobs-list");
  list.innerHTML = "";
  jobs.forEach((job) => {
    const level = job.match >= 70 ? "is-good" : "is-weak";
    const li = document.createElement("li");
    li.className = "job";
    li.innerHTML = `
      <div class="job-head">
        <div>
          <h5 class="job-title"></h5>
          <p class="job-meta"></p>
        </div>
        <span class="job-match ${level}" aria-label="Uyğunluq ${job.match} faiz">${job.match}%</span>
      </div>
      <div class="bar" aria-hidden="true"><span class="bar-fill ${level}" style="--value: ${job.match}"></span></div>
      <ul class="pill-list"></ul>`;
    li.querySelector(".job-title").textContent = job.title;
    li.querySelector(".job-meta").textContent = `${job.org} · ${job.type}`;
    const pills = li.querySelector(".pill-list");
    job.required.forEach((s) => pills.appendChild(makePill(s, haveSet.has(s) ? "have" : "missing")));
    list.appendChild(li);
  });
}

// Daxil olmuş istifadəçi yalnız öz analizlərini, qonaq isə qonaq analizlərini görür
function historyForCurrentUser() {
  if (apiMode) return apiUser ? apiHistory : [];
  const user = getCurrentUser();
  const owner = user ? user.email : null;
  return readHistory().filter((entry) => (entry.user || null) === owner);
}

// Köhnə analizlərdə bacarıqlar saxlanmayıb — onları yenidən hesabla
function withSkills(entry) {
  if (entry.have && entry.missing) return entry;
  return { ...entry, ...demoSkills({ name: entry.file }, entry.major, entry.scores[3]) };
}

// Analizin hansı planı ən çox irəliləyib (7/14/21)
function planStats(entry) {
  // API rejimi: plan backend-dən gəlir; yüklənməyibsə və ya yaradılmayıbsa, faiz yoxdur
  if (entry.api) {
    const roadmap = apiRoadmaps.get(entry.id);
    if (!roadmap || !roadmap.generated) return { days: 21, done: 0, total: 0, percent: null };
    const ids = roadmap.roadmap.flatMap((phase) => phase.tasks.map((_, i) => `${phase.key}-${i}`));
    const done = readApiPlanState(entry).filter((id) => ids.includes(id)).length;
    return { days: 21, done, total: ids.length, percent: ids.length ? Math.round((done / ids.length) * 100) : 0 };
  }
  const analysis = withSkills(entry);
  let best = { days: 7, done: 0, total: buildPlanTasks(analysis, 7).length, percent: 0 };
  [7, 14, 21].forEach((days) => {
    const total = buildPlanTasks(analysis, days).length;
    const done = readPlanState(analysis, days).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    if (percent > best.percent) best = { days, done, total, percent };
  });
  return best;
}

// Analizi CV Yoxla bölməsində (4 tabı ilə) göstər
function presentAnalysis(entry) {
  const full = withSkills(entry);
  renderResult({ name: entry.file }, entry.majorName || entry.major, entry.scores, entry.date, entry.api ? entry.total : null);
  if (entry.api) {
    applyApiResult(entry);
  } else {
    resultSummary.hidden = true;
    resultWarning.hidden = true;
  }
  currentAnalysis = { ...full, planDays: entry.api ? 7 : planStats(entry).days };
  renderSkills(currentAnalysis);
  renderPlan(currentAnalysis);
  renderJobs(currentAnalysis);
  renderHistory(entry.id);
  activateTab(document.querySelector("#tab-score"), false);
}

function renderHistory(currentId) {
  const body = document.querySelector("#history-body");
  body.innerHTML = "";
  historyForCurrentUser().forEach((entry) => {
    const tr = document.createElement("tr");
    if (entry.id === currentId) tr.className = "is-current";
    [formatDate(entry.date), entry.file, entry.majorName || entry.major, `${entry.total}/100`].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

// ===== 5. CV Yoxla: real AI analizi (API rejimi) =====
async function runApiAnalysis(file, fieldId) {
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analiz edilir…";
  result.hidden = true;
  const stopLoader = startApiLoader(["CV serverə göndərilir…", "AI CV-ni oxuyur…", "Sahə tələbləri ilə müqayisə edilir…", "Bal hesablanır…"]);

  try {
    const form = new FormData();
    form.append("file", file);
    form.append("field_id", fieldId);
    const data = await api("/api/evaluate", { method: "POST", body: form }, 180000);

    const entry = fromEvaluation(data, data.evaluation_id);
    apiRoadmaps.delete(entry.id);
    stopLoader();
    presentAnalysis(entry);
    showToast("Analiz hazırdır!", "success");
    result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    result.focus({ preventScroll: true });

    // Tarixçəni yenilə (4-cü tab və kabinet üçün)
    loadApiHistory()
      .then(() => renderHistory(entry.id))
      .catch(() => {});
  } catch (error) {
    stopLoader();
    showToast(error.message, "error");
    if (error.status === 401) {
      apiUser = null;
      renderUser();
      openAuth("tab-login");
    }
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analiz Et";
  }
}

// ===== 5. CV Yoxla: "Analiz Et" =====
cvForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  let firstInvalid = null;

  if (!selectedFile) {
    setFileError("Əvvəlcə PDF formatında CV-ni yüklə.");
    firstInvalid = fileInput;
  }

  if (!majorSelect.value) {
    majorError.textContent = "İxtisasını seç.";
    majorSelect.classList.add("is-invalid");
    firstInvalid = firstInvalid || majorSelect;
  }

  if (firstInvalid) {
    showToast("Zəhmət olmasa CV faylını və ixtisası seç.", "error");
    firstInvalid.focus();
    return;
  }

  const file = selectedFile;
  const major = majorSelect.value;

  // API rejimi: analiz yalnız hesaba daxil olmuş istifadəçi üçündür (nəticə tarixçədə saxlanır)
  if (apiMode) {
    if (!apiUser) {
      openAuth("tab-login");
      googleNote.textContent = "CV analizi üçün əvvəlcə daxil ol və ya qeydiyyatdan keç.";
      return;
    }
    await runApiAnalysis(file, major);
    return;
  }

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analiz edilir…";
  result.hidden = true;

  await runLoader();

  const scores = demoScores(file, major);
  const skills = demoSkills(file, major, scores[3]);
  const user = getCurrentUser();

  const entry = {
    id: String(Date.now()),
    date: new Date().toISOString(),
    user: user ? user.email : null,
    file: file.name,
    major,
    total: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    scores,
    ...skills,
  };
  saveHistory(entry);
  presentAnalysis(entry);

  analyzeBtn.disabled = false;
  analyzeBtn.textContent = "Analiz Et";
  showToast("Analiz hazırdır!", "success");

  result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  result.focus({ preventScroll: true });
});

resultReset.addEventListener("click", () => {
  result.hidden = true;
  clearFile();
  cvForm.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  fileInput.focus({ preventScroll: true });
});

// ===== Tablar (ümumi) =====
function activateTab(tab, focus = true) {
  const tabs = [...tab.closest('[role="tablist"]').querySelectorAll('[role="tab"]')];
  tabs.forEach((t) => {
    const selected = t === tab;
    t.setAttribute("aria-selected", String(selected));
    t.tabIndex = selected ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !selected;
  });
  if (focus) tab.focus();
}

document.querySelectorAll('[role="tablist"]').forEach((tablist) => {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];

  tabs.forEach((tab, i) => {
    tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
    tab.addEventListener("click", () => {
      activateTab(tab);
      // Tab görünən kimi mobil ekranda tam görünsün
      tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") activateTab(tabs[(i + 1) % tabs.length]);
      if (event.key === "ArrowLeft") activateTab(tabs[(i - 1 + tabs.length) % tabs.length]);
    });
  });
});

// ===== 7. Rəylər karuseli =====
const carousel = document.querySelector("#reviews");
const track = document.querySelector("#carousel-track");
const slides = [...track.children];
const dotsBox = document.querySelector("#carousel-dots");
const AUTO_DELAY = 6000;

let current = 0;
let autoTimer = null;
let paused = false;

// Nöqtələri yarat
const dots = slides.map((_, i) => {
  const dot = document.createElement("button");
  dot.type = "button";
  dot.className = "carousel-dot";
  dot.setAttribute("aria-label", `${i + 1}-ci rəyə keç`);
  dot.addEventListener("click", () => goTo(i, true));
  dotsBox.appendChild(dot);
  return dot;
});

function goTo(index, byUser = false) {
  current = (index + slides.length) % slides.length;
  track.style.transform = `translateX(-${current * 100}%)`;
  slides.forEach((slide, i) => slide.setAttribute("aria-hidden", String(i !== current)));
  dots.forEach((dot, i) => dot.setAttribute("aria-current", String(i === current)));
  // İstifadəçi özü keçəndə ekran oxuyucu yeni rəyi oxusun
  track.setAttribute("aria-live", byUser ? "polite" : "off");
  if (byUser) restartAuto();
}

function startAuto() {
  if (reduceMotion || paused) return;
  stopAuto();
  autoTimer = setInterval(() => goTo(current + 1), AUTO_DELAY);
}

function stopAuto() {
  clearInterval(autoTimer);
  autoTimer = null;
}

function restartAuto() {
  stopAuto();
  startAuto();
}

document.querySelector("#carousel-prev").addEventListener("click", () => goTo(current - 1, true));
document.querySelector("#carousel-next").addEventListener("click", () => goTo(current + 1, true));

// Siçan üstündə və ya fokus içəridə olanda dayan
carousel.addEventListener("mouseenter", () => { paused = true; stopAuto(); });
carousel.addEventListener("mouseleave", () => { paused = false; startAuto(); });
carousel.addEventListener("focusin", () => { paused = true; stopAuto(); });
carousel.addEventListener("focusout", (event) => {
  if (!carousel.contains(event.relatedTarget)) {
    paused = false;
    startAuto();
  }
});

// Klaviatura: ← → oxları
carousel.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") goTo(current - 1, true);
  if (event.key === "ArrowRight") goTo(current + 1, true);
});

// Telefonda barmaqla sürüşdürmə
let touchStartX = null;
track.addEventListener("touchstart", (event) => {
  touchStartX = event.touches[0].clientX;
}, { passive: true });
track.addEventListener("touchend", (event) => {
  if (touchStartX === null) return;
  const diff = event.changedTouches[0].clientX - touchStartX;
  if (Math.abs(diff) > 40) goTo(current + (diff < 0 ? 1 : -1), true);
  touchStartX = null;
});

// Səhifə arxa planda olanda avtomatik keçidi dayandır
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopAuto();
  else startAuto();
});

goTo(0);
startAuto();

// ===== 9. FAQ akkordeonu =====
document.querySelectorAll(".faq-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".faq-item");
    const open = btn.getAttribute("aria-expanded") !== "true";
    btn.setAttribute("aria-expanded", String(open));
    item.classList.toggle("is-open", open);
  });
});

// ===== Ümumi: e-poçt yoxlaması =====
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function setFieldError(input, errorEl, message) {
  input.classList.toggle("is-invalid", Boolean(message));
  if (errorEl) errorEl.textContent = message;
}

// ===== 10. Tərəfdaşlıq forması =====
const partnerForm = document.querySelector("#partner-form");
const partnerName = document.querySelector("#partner-name");
const partnerEmail = document.querySelector("#partner-email");
const partnerNameError = document.querySelector("#partner-name-error");
const partnerEmailError = document.querySelector("#partner-email-error");

partnerForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const nameOk = partnerName.value.trim().length >= 2;
  const emailOk = isValidEmail(partnerEmail.value);

  setFieldError(partnerName, partnerNameError, nameOk ? "" : "Ad və ya təşkilat adını yaz.");
  setFieldError(partnerEmail, partnerEmailError, emailOk ? "" : "Düzgün e-poçt ünvanı yaz, məsələn ad@mail.az.");

  if (!nameOk || !emailOk) {
    showToast("Zəhmət olmasa formu düzgün doldurun.", "error");
    (nameOk ? partnerEmail : partnerName).focus();
    return;
  }

  showToast("Müraciətiniz qəbul edildi! Tezliklə əlaqə saxlayacağıq.", "success");
  partnerForm.reset();
});

[partnerName, partnerEmail].forEach((input) => {
  input.addEventListener("input", () => {
    const errorEl = input === partnerName ? partnerNameError : partnerEmailError;
    setFieldError(input, errorEl, "");
  });
});

// ===== 11. Footer: bülleten =====
const newsletterForm = document.querySelector("#newsletter-form");
const newsletterEmail = document.querySelector("#newsletter-email");

newsletterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isValidEmail(newsletterEmail.value)) {
    setFieldError(newsletterEmail, null, "error");
    showToast("Düzgün e-poçt ünvanı yaz.", "error");
    newsletterEmail.focus();
    return;
  }
  setFieldError(newsletterEmail, null, "");
  showToast("Bülletenə abunə oldun! 🎉", "success");
  newsletterForm.reset();
});

newsletterEmail.addEventListener("input", () => setFieldError(newsletterEmail, null, ""));

// ===== 11. Footer: hələ hazır olmayan linklər =====
document.querySelectorAll("[data-soon]").forEach((btn) => {
  btn.addEventListener("click", () => {
    showToast("Bu bölmə hazırlanır — tezliklə əlavə olunacaq.", "success");
  });
});

// ===== Giriş / Qeydiyyat =====
const authModal = document.querySelector("#auth-modal");
const loginBtn = document.querySelector("#login-btn");
const userMenu = document.querySelector("#user-menu");
const userBtn = document.querySelector("#user-btn");
const userDropdown = document.querySelector("#user-dropdown");
const loginForm = document.querySelector("#login-form");
const registerForm = document.querySelector("#register-form");
const regMajor = document.querySelector("#reg-major");
const googleNote = document.querySelector("#google-note");

// İxtisas siyahısını CV Yoxla bölməsindən köçür
regMajor.innerHTML = majorSelect.innerHTML;

// İstifadəçilər və aktiv sessiya (localStorage)
function readUsers() {
  try {
    const users = JSON.parse(readStorage("istifadeciler"));
    return Array.isArray(users) ? users : [];
  } catch (error) {
    return [];
  }
}

function saveUsers(users) {
  writeStorage("istifadeciler", JSON.stringify(users));
}

function getCurrentUser() {
  if (apiMode) return apiUser;
  const email = readStorage("aktivIstifadeci");
  return readUsers().find((u) => u.email === email) || null;
}

// Ad, soyad, ixtisas, Premium kimi dəyişiklikləri cari istifadəçiyə yaz
function updateCurrentUser(changes) {
  if (apiMode) {
    if (!apiUser) return null;
    writeProfile(apiUser.email, changes);
    apiUser = { ...apiUser, ...changes };
    return apiUser;
  }
  const users = readUsers();
  const user = users.find((u) => u.email === readStorage("aktivIstifadeci"));
  if (!user) return null;
  Object.assign(user, changes);
  saveUsers(users);
  return user;
}

// Backend parolun ən azı 12 simvol olmasını tələb edir
function minPasswordLength() {
  return apiMode ? 12 : 6;
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    // Yaddaş əlçatan deyil
  }
}

// Şifrə açıq mətn kimi saxlanmasın: SHA-256 ilə "hash" edilir
async function hashPassword(email, password) {
  const text = `${email}:${password}`;
  if (window.crypto && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const buffer = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Ehtiyat variant (köhnə brauzerlər üçün)
  return `x${makeSeed(text).toString(16)}`;
}

// Pəncərəni aç / bağla
function openAuth(tabId = "tab-login") {
  setMenu(false);
  googleNote.textContent = "";
  activateTab(document.getElementById(tabId), false);
  authModal.showModal();
  const firstInput = document.querySelector(`#${document.getElementById(tabId).getAttribute("aria-controls")} input`);
  firstInput.focus();
}

function closeAuth() {
  authModal.close();
}

loginBtn.addEventListener("click", () => openAuth("tab-login"));
document.querySelector("#auth-close").addEventListener("click", closeAuth);

// Arxa fona klikləyəndə bağla
authModal.addEventListener("click", (event) => {
  if (event.target === authModal) closeAuth();
});

// "Qeydiyyatdan keç" / "Daxil ol" keçidləri
document.querySelectorAll(".auth-switch-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = document.getElementById(btn.dataset.tab);
    activateTab(tab);
    document.querySelector(`#${tab.getAttribute("aria-controls")} input`).focus();
  });
});

// Şifrəni göstər / gizlət
document.querySelectorAll(".pass-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Şifrəni gizlət" : "Şifrəni göstər");
  });
});

document.querySelector("#google-btn").addEventListener("click", () => {
  googleNote.textContent = "Google ilə giriş demo versiyada işləmir — e-poçt ilə qeydiyyatdan keç.";
});

// Xətaları göstər / təmizlə
function fieldError(id, message) {
  const input = document.getElementById(id);
  const errorEl = document.getElementById(`${id}-error`);
  if (input.type === "checkbox") {
    input.closest(".check").classList.toggle("is-invalid", Boolean(message));
  } else {
    input.classList.toggle("is-invalid", Boolean(message));
  }
  errorEl.textContent = message;
  return !message;
}

[loginForm, registerForm].forEach((form) => {
  form.addEventListener("input", (event) => {
    if (document.getElementById(`${event.target.id}-error`)) fieldError(event.target.id, "");
    document.querySelector("#login-error").textContent = "";
    document.querySelector("#register-error").textContent = "";
  });
});

// Header-i istifadəçiyə görə yenilə
function renderUser() {
  const user = getCurrentUser();

  // Qiymət kartındakı düymə premium istifadəçidə dəyişsin
  document.querySelectorAll('[data-plan="premium"]').forEach((btn) => {
    btn.textContent = user && user.premium ? "✓ Premium aktivdir" : "Premium-a keç";
  });

  loginBtn.hidden = Boolean(user);
  userMenu.hidden = !user;
  userDropdown.hidden = true;
  userBtn.setAttribute("aria-expanded", "false");
  if (!user) return;

  document.querySelector("#user-avatar").textContent = user.name.charAt(0).toUpperCase();
  document.querySelector("#user-name").textContent = user.name;
  document.querySelector("#user-full-name").textContent = `${user.name} ${user.surname}`;
  document.querySelector("#user-email").textContent = user.email;
  document.querySelector("#user-plan").textContent = user.premium ? "✨ Premium Tələbə" : "Pulsuz plan";

  // CV Yoxla-da ixtisas boşdursa, istifadəçinin ixtisasını seç
  if (!majorSelect.value) majorSelect.value = user.major;
}

function signIn(user, message) {
  if (!apiMode) writeStorage("aktivIstifadeci", user.email);

  // Daxil olmadan əvvəl bu brauzerdə edilən demo analizləri hesaba bağla
  const history = apiMode ? [] : readHistory();
  const claimed = history.filter((entry) => !entry.user).length;
  if (claimed) {
    history.forEach((entry) => {
      if (!entry.user) entry.user = user.email;
    });
    writeStorage("analizTarixcesi", JSON.stringify(history));
    if (currentAnalysis && !currentAnalysis.user) currentAnalysis.user = user.email;
  }

  closeAuth();
  loginForm.reset();
  registerForm.reset();
  renderUser();
  if (currentAnalysis) renderHistory(currentAnalysis.id);
  showToast(message, "success");

  // API rejimi: istifadəçinin tarixçəsini serverdən yüklə
  if (apiMode) {
    loadApiHistory()
      .then(() => {
        if (currentAnalysis) renderHistory(currentAnalysis.id);
        if (!cabinet.hidden && apiUser) renderCabinet(apiUser);
      })
      .catch(() => {});
  }

  // Premium almaq istəyirdisə, ödəniş pəncərəsini aç
  if (pendingPayment) {
    pendingPayment = false;
    updateView();
    openPayment();
    return;
  }

  // Kabinetə girmək istəyirdisə, ora apar
  if (pendingCabinet) {
    pendingCabinet = false;
    goToCabinet();
  } else {
    updateView();
  }
}

// Qeydiyyat
registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.querySelector("#reg-name").value.trim();
  const surname = document.querySelector("#reg-surname").value.trim();
  const email = document.querySelector("#reg-email").value.trim().toLowerCase();
  const pass = document.querySelector("#reg-pass").value;
  const pass2 = document.querySelector("#reg-pass2").value;
  const major = regMajor.value;
  const consent = document.querySelector("#reg-consent").checked;
  const exists = !apiMode && readUsers().some((u) => u.email === email);
  const minPass = minPasswordLength();

  const checks = [
    fieldError("reg-name", name.length >= 2 ? "" : "Adını yaz."),
    fieldError("reg-surname", surname.length >= 2 ? "" : "Soyadını yaz."),
    fieldError("reg-email", !isValidEmail(email) ? "Düzgün e-poçt ünvanı yaz."
      : exists ? "Bu e-poçt ilə hesab artıq var — Giriş tabından daxil ol." : ""),
    fieldError("reg-pass", pass.length >= minPass ? "" : `Şifrə ən azı ${minPass} simvol olmalıdır.`),
    fieldError("reg-pass2", pass2 && pass2 === pass ? "" : "Şifrələr eyni deyil."),
    fieldError("reg-major", major ? "" : "İxtisasını seç."),
    fieldError("reg-consent", consent ? "" : "Davam etmək üçün razılığını təsdiqlə."),
  ];

  if (checks.includes(false)) {
    registerForm.querySelector(".is-invalid input, input.is-invalid, select.is-invalid")?.focus();
    return;
  }

  // API rejimi: hesab serverdə yaradılır (backend dərhal daxil edir)
  if (apiMode) {
    const submit = registerForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const me = await postJson("/api/auth/signup", { email, password: pass });
      writeProfile(me.email, { name, surname, major });
      apiUser = makeApiUser(me);
      signIn(apiUser, `Xoş gəldin, ${name}! Hesabın yaradıldı.`);
    } catch (error) {
      if (error.status === 409) {
        fieldError("reg-email", error.message);
        document.querySelector("#reg-email").focus();
      } else {
        document.querySelector("#register-error").textContent = error.message;
      }
    } finally {
      submit.disabled = false;
    }
    return;
  }

  const user = {
    name,
    surname,
    email,
    major,
    passHash: await hashPassword(email, pass),
    created: new Date().toISOString(),
  };
  const users = readUsers();
  users.push(user);
  saveUsers(users);

  signIn(user, `Xoş gəldin, ${name}! Hesabın yaradıldı.`);
});

// Giriş
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.querySelector("#login-email").value.trim().toLowerCase();
  const pass = document.querySelector("#login-pass").value;

  const ok = [
    fieldError("login-email", isValidEmail(email) ? "" : "Düzgün e-poçt ünvanı yaz."),
    fieldError("login-pass", pass ? "" : "Şifrəni yaz."),
  ];
  if (ok.includes(false)) return;

  // API rejimi: giriş serverdə yoxlanılır (sessiya cookie-si ilə)
  if (apiMode) {
    const submit = loginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const me = await postJson("/api/auth/login", { email, password: pass });
      apiUser = makeApiUser(me);
      signIn(apiUser, `Xoş gəldin, ${apiUser.name}!`);
    } catch (error) {
      document.querySelector("#login-error").textContent = error.message;
      document.querySelector("#login-pass").select();
    } finally {
      submit.disabled = false;
    }
    return;
  }

  const user = readUsers().find((u) => u.email === email);
  if (!user || user.passHash !== (await hashPassword(email, pass))) {
    document.querySelector("#login-error").textContent = "E-poçt və ya şifrə yanlışdır.";
    document.querySelector("#login-pass").select();
    return;
  }

  signIn(user, `Xoş gəldin, ${user.name}!`);
});

// İstifadəçi menyusu və çıxış
userBtn.addEventListener("click", () => {
  const open = userDropdown.hidden;
  userDropdown.hidden = !open;
  userBtn.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (event) => {
  if (!userMenu.hidden && !userMenu.contains(event.target)) {
    userDropdown.hidden = true;
    userBtn.setAttribute("aria-expanded", "false");
  }
});

function logout() {
  if (apiMode) {
    // Serverdəki sessiyanı bağla; cavabı gözləmədən interfeysi yenilə
    api("/api/auth/logout", { method: "POST" }).catch(() => {});
    apiUser = null;
    apiHistory = [];
    apiRoadmaps.clear();
  }
  removeStorage("aktivIstifadeci");
  setMenu(false);
  renderUser();

  // Başqası görməsin deyə açıq nəticəni gizlət
  result.hidden = true;
  currentAnalysis = null;

  if (location.hash === "#kabinet") {
    location.hash = "";
  } else {
    updateView();
  }
  showToast("Hesabdan çıxdın. Yenidən görüşənədək!", "success");
  loginBtn.focus({ preventScroll: true });
}

document.querySelector("#logout-btn").addEventListener("click", logout);

renderUser();

// ===== Şəxsi kabinet =====
const cabinet = document.querySelector("#kabinet");
const landingSections = [...document.querySelectorAll("main > section:not(#kabinet)")];
const profileForm = document.querySelector("#profile-form");
const profileMajor = document.querySelector("#profile-major");
let pendingCabinet = false;

profileMajor.innerHTML = majorSelect.innerHTML;

function goToCabinet() {
  if (location.hash === "#kabinet") updateView();
  else location.hash = "kabinet";
}

// Ünvana görə ya kabineti, ya da əsas səhifəni göstər
function updateView() {
  // Backend yoxlanana qədər gözlə (yoxsa daxil olmuş istifadəçiyə giriş pəncərəsi açıla bilər)
  if (!apiChecked && location.protocol !== "file:") return;

  const wantsCabinet = location.hash === "#kabinet";
  const user = getCurrentUser();

  userDropdown.hidden = true;
  userBtn.setAttribute("aria-expanded", "false");

  // Daxil olmayıbsa, əvvəlcə giriş pəncərəsi
  if (wantsCabinet && !user) {
    pendingCabinet = true;
    location.hash = "";
    openAuth("tab-login");
    return;
  }

  const showCabinet = wantsCabinet && Boolean(user);
  cabinet.hidden = !showCabinet;
  landingSections.forEach((section) => {
    section.hidden = showCabinet;
  });

  if (showCabinet) {
    renderCabinet(user);
    window.scrollTo(0, 0);
    document.querySelector("#cabinet-title").focus({ preventScroll: true });
    if (apiMode) refreshApiCabinet();
    return;
  }

  // Kabinetdən bölmə linkinə keçəndə həmin bölməyə sürüş
  const target = location.hash.length > 1 && document.getElementById(location.hash.slice(1));
  if (target) target.scrollIntoView();
}

// API rejimi: kabinet açılanda tarixçəni və son analizin planını serverdən yenilə
async function refreshApiCabinet() {
  try {
    await loadApiHistory();
    const latest = apiHistory[0];
    if (latest && !apiRoadmaps.has(latest.id)) {
      apiRoadmaps.set(latest.id, await api(`/api/roadmap/${latest.id}`));
    }
  } catch (error) {
    showToast(error.message, "error");
  }
  if (!cabinet.hidden && apiUser) renderCabinet(apiUser);
}

function renderCabinet(user) {
  const entries = historyForCurrentUser();
  const latest = entries[0];
  const previous = entries[1];

  const hello = document.querySelector("#cabinet-hello");
  hello.textContent = `Salam, ${user.name}! Burada bütün CV analizlərin və irəliləyişin var. `;
  const badge = document.createElement("span");
  badge.className = user.premium ? "premium-badge" : "pill pill-accent";
  badge.textContent = user.premium ? "✨ Premium" : "Pulsuz plan";
  hello.appendChild(badge);

  // Son CV skoru
  const scoreNote = document.querySelector("#stat-score-note");
  document.querySelector("#stat-score").textContent = latest ? latest.total : "—";
  scoreNote.textContent = "";
  if (!latest) {
    scoreNote.textContent = "Hələ analiz yoxdur";
  } else if (previous) {
    const diff = latest.total - previous.total;
    const span = document.createElement("span");
    span.className = diff >= 0 ? "up" : "down";
    span.textContent = `${diff >= 0 ? "▲ +" : "▼ "}${diff}`;
    scoreNote.append(span, ` əvvəlki analizə görə · ${formatDate(latest.date)}`);
  } else {
    scoreNote.textContent = `İlk analiz · ${formatDate(latest.date)}`;
  }

  // Analiz sayı
  document.querySelector("#stat-count").textContent = entries.length;
  const majors = new Set(entries.map((e) => e.major)).size;
  document.querySelector("#stat-count-note").textContent =
    entries.length ? `${majors} fərqli ixtisas üzrə` : "Bütün vaxt üzrə";

  // Plan tamamlanması (son analiz)
  const plan = latest ? planStats(latest) : null;
  const planPercent = plan && plan.percent !== null ? plan.percent : 0;
  document.querySelector("#stat-plan").textContent = planPercent;
  document.querySelector("#stat-plan-bar").style.setProperty("--value", planPercent);
  document.querySelector("#stat-plan-note").textContent = !plan
    ? "Analizdən sonra plan yaranacaq"
    : plan.percent === null
      ? "Plan hələ yaradılmayıb — nəticənin 3-cü tabında yarat"
      : `${plan.days} günlük plan · ${plan.done} / ${plan.total} tapşırıq`;

  // Tarixçə cədvəli
  const body = document.querySelector("#cabinet-history");
  body.innerHTML = "";
  document.querySelector("#cabinet-table-wrap").hidden = !entries.length;
  document.querySelector("#cabinet-empty").hidden = Boolean(entries.length);

  entries.forEach((entry) => {
    const tr = document.createElement("tr");
    const stats = planStats(entry);
    const planText = stats.percent === null ? "—" : `${stats.percent}%`;
    [formatDate(entry.date), entry.file, entry.majorName || entry.major, `${entry.total}/100`, planText].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    });
    const actionTd = document.createElement("td");
    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "btn btn-ghost";
    viewBtn.textContent = "Nəticəyə bax";
    viewBtn.setAttribute("aria-label", `${formatDate(entry.date)} tarixli analizin nəticəsinə bax`);
    viewBtn.addEventListener("click", () => openAnalysisFromCabinet(entry));
    actionTd.appendChild(viewBtn);
    tr.appendChild(actionTd);
    body.appendChild(tr);
  });

  // Profil forması
  document.querySelector("#profile-name").value = user.name;
  document.querySelector("#profile-surname").value = user.surname;
  document.querySelector("#profile-email").value = user.email;
  profileMajor.value = user.major;
  ["profile-name", "profile-surname", "profile-major"].forEach((id) => fieldError(id, ""));
}

// Tarixçədən köhnə analizi aç
async function openAnalysisFromCabinet(entry) {
  // API rejimi: tarixçə siyahısında yalnız qısa məlumat var — tam nəticəni yüklə
  if (entry.api && entry.partial) {
    try {
      const detail = await api(`/api/history/${entry.id}`);
      entry = fromEvaluation(detail.result, detail.id, detail.created_at);
    } catch (error) {
      showToast(error.message, "error");
      return;
    }
  }
  try {
    history.pushState(null, "", "#cv-yoxla");
  } catch (error) {
    // Bəzi brauzerlərdə fayl ünvanında işləməyə bilər
  }
  cabinet.hidden = true;
  landingSections.forEach((section) => {
    section.hidden = false;
  });
  presentAnalysis(entry);
  result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  result.focus({ preventScroll: true });
}

// Profili yadda saxla
profileForm.addEventListener("input", (event) => {
  if (document.getElementById(`${event.target.id}-error`)) fieldError(event.target.id, "");
});

profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#profile-name").value.trim();
  const surname = document.querySelector("#profile-surname").value.trim();
  const major = profileMajor.value;

  const ok = [
    fieldError("profile-name", name.length >= 2 ? "" : "Adını yaz."),
    fieldError("profile-surname", surname.length >= 2 ? "" : "Soyadını yaz."),
    fieldError("profile-major", major ? "" : "İxtisasını seç."),
  ];
  if (ok.includes(false)) return;

  const user = updateCurrentUser({ name, surname, major });
  if (!user) return;

  renderUser();
  majorSelect.value = major;
  renderCabinet(user);
  showToast("Profil yadda saxlanıldı.", "success");
});

document.querySelector("#cabinet-logout").addEventListener("click", logout);

// Giriş pəncərəsi kabinetə keçmədən bağlanarsa, gözləməni ləğv et
authModal.addEventListener("close", () => {
  if (!getCurrentUser()) pendingCabinet = false;
});

window.addEventListener("hashchange", updateView);
updateView();

// ===== Ödəniş pəncərəsi (DEMO) =====
// Kart məlumatı heç yerdə saxlanmır və heç yerə göndərilmir
const payModal = document.querySelector("#pay-modal");
const payForm = document.querySelector("#pay-form");
const payStepForm = document.querySelector("#pay-step-form");
const payStepProcessing = document.querySelector("#pay-step-processing");
const payStepSuccess = document.querySelector("#pay-step-success");
const payNumber = document.querySelector("#pay-number");
const payExp = document.querySelector("#pay-exp");
const payCvv = document.querySelector("#pay-cvv");
const premiumButtons = document.querySelectorAll('[data-plan="premium"]');
let pendingPayment = false;

function showPayStep(step) {
  payStepForm.hidden = step !== "form";
  payStepProcessing.hidden = step !== "processing";
  payStepSuccess.hidden = step !== "success";
}

function openPayment() {
  const user = getCurrentUser();
  if (!user) {
    pendingPayment = true;
    openAuth("tab-register");
    googleNote.textContent = "Premium almaq üçün əvvəlcə hesab yarat və ya daxil ol.";
    return;
  }
  if (user.premium) {
    showToast("Premium artıq aktivdir ✨", "success");
    return;
  }
  payForm.reset();
  ["pay-name", "pay-number", "pay-exp", "pay-cvv"].forEach((id) => fieldError(id, ""));
  showPayStep("form");
  payModal.showModal();
  document.querySelector("#pay-name").focus();
}

function closePayment() {
  payModal.close();
}

// Bağlananda formu təmizlə — kart məlumatı yaddaşda qalmasın
payModal.addEventListener("close", () => {
  payForm.reset();
  showPayStep("form");
});

premiumButtons.forEach((btn) => btn.addEventListener("click", openPayment));
document.querySelector("#pay-close").addEventListener("click", closePayment);
document.querySelector("#pay-done").addEventListener("click", closePayment);
payModal.addEventListener("click", (event) => {
  if (event.target === payModal && payStepProcessing.hidden) closePayment();
});

// Giriş pəncərəsi ödənişə keçmədən bağlanarsa, gözləməni ləğv et
authModal.addEventListener("close", () => {
  if (!getCurrentUser()) pendingPayment = false;
});

// Yazarkən formatla: "4242 4242 4242 4242", "12/28", yalnız rəqəm
payNumber.addEventListener("input", () => {
  const digits = payNumber.value.replace(/\D/g, "").slice(0, 16);
  payNumber.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
});

payExp.addEventListener("input", (event) => {
  let digits = payExp.value.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3 || (digits.length === 2 && event.inputType !== "deleteContentBackward")) {
    digits = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  payExp.value = digits;
});

payCvv.addEventListener("input", () => {
  payCvv.value = payCvv.value.replace(/\D/g, "").slice(0, 3);
});

payForm.addEventListener("input", (event) => {
  if (document.getElementById(`${event.target.id}-error`)) fieldError(event.target.id, "");
});

// Rəsmi test kartı nömrəsi (real kart deyil)
document.querySelector("#pay-test").addEventListener("click", () => {
  const user = getCurrentUser();
  const next = new Date();
  document.querySelector("#pay-name").value = user ? `${user.name} ${user.surname}`.toLocaleUpperCase("az") : "TEST İSTİFADƏÇİ";
  payNumber.value = "4242 4242 4242 4242";
  payExp.value = `12/${String(next.getFullYear() + 2).slice(2)}`;
  payCvv.value = "123";
  ["pay-name", "pay-number", "pay-exp", "pay-cvv"].forEach((id) => fieldError(id, ""));
});

// Kart nömrəsinin düzgünlüyü (Luhn alqoritmi)
function luhnValid(digits) {
  let sum = 0;
  [...digits].reverse().forEach((char, i) => {
    let n = Number(char);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  });
  return digits.length === 16 && sum % 10 === 0;
}

function expiryValid(value) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

payForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#pay-name").value.trim();
  const digits = payNumber.value.replace(/\s/g, "");

  const ok = [
    fieldError("pay-name", name.length >= 3 ? "" : "Kart sahibinin adını yaz."),
    fieldError("pay-number", luhnValid(digits) ? "" : "Kart nömrəsi düzgün deyil (16 rəqəm)."),
    fieldError("pay-exp", expiryValid(payExp.value) ? "" : "Tarixi AA/İİ formatında yaz, məsələn 12/28."),
    fieldError("pay-cvv", /^\d{3}$/.test(payCvv.value) ? "" : "CVV 3 rəqəmdir."),
  ];
  if (ok.includes(false)) {
    payForm.querySelector(".is-invalid")?.focus();
    return;
  }

  // Kart məlumatını dərhal sil — yalnız "ödəniş oldu" qeydi saxlanır
  payForm.reset();
  showPayStep("processing");

  setTimeout(() => {
    // Backend-də ödəniş yoxdur — Premium qeydi bu brauzerdə saxlanır (DEMO)
    const user = updateCurrentUser({ premium: true, premiumSince: new Date().toISOString() });
    showPayStep("success");
    document.querySelector("#pay-done").focus();
    renderUser();
    if (!cabinet.hidden && user) renderCabinet(user);
    showToast("Premium aktivləşdi! (DEMO ödəniş)", "success");
  }, 1500);
});

// ===== AI Mentor çatı =====
const chatFab = document.querySelector("#chat-fab");
const chatPanel = document.querySelector("#chat-panel");
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
let chatStarted = false;

// Açar sözlər və hazır cavablar
const CHAT_TOPICS = [
  {
    keys: ["cv", "rezüme", "rezume", "özgeçmiş"],
    text: "Güclü CV üçün əsas qaydalar:",
    tips: [
      "1 səhifə: Əlaqə → Təhsil → Təcrübə → Bacarıqlar → Layihələr.",
      "Hər təcrübə bəndini fel ilə başla və rəqəmlə bitir: “Satışları 3 ayda 15% artırdım”.",
      "Vakansiyadakı açar sözləri CV-yə əlavə et — ATS sistemləri onları axtarır.",
      "Şəkil, cədvəl və rəngli fon istifadə etmə — ATS onları oxumaya bilər.",
    ],
    link: { href: "#cv-yoxla", label: "CV-ni yoxlat →" },
  },
  {
    keys: ["müsahibə", "musahibe", "interview", "müsahibəyə"],
    text: "Müsahibəyə hazırlıq üçün:",
    tips: [
      "Şirkəti araşdır: nə edir, son xəbərləri, dəyərləri.",
      "“Özün haqqında danış” sualına 1 dəqiqəlik hazır cavab yaz.",
      "Çətin suallara STAR metodu ilə cavab ver: Situasiya, Tapşırıq, Addım, Nəticə.",
      "Sonda ən azı 2 sual ver — məsələn, “Bu vəzifədə ilk 3 ayda uğur nə deməkdir?”",
    ],
  },
  {
    keys: ["linkedin", "linkdin", "profil"],
    text: "LinkedIn profilini gücləndir:",
    tips: [
      "Peşəkar şəkil və aydın başlıq: “Data analitika tələbəsi | SQL, Power BI”.",
      "“Haqqında” bölməsində 3–4 cümlə: kimsən, nə bacarırsan, nə axtarırsan.",
      "Layihələrini və sertifikatlarını “Featured” bölməsinə əlavə et.",
      "Sahəndəki insanlarla şəxsi mesajla əlaqə qur — boş dəvət göndərmə.",
    ],
  },
  {
    keys: ["staj", "təcrübə proqram", "tecrube", "internship", "praktika", "təcrübəçi"],
    text: "Staj tapmaq üçün:",
    tips: [
      "Universitetinin karyera mərkəzinə yazıl — çox staj elanı ilk ora gəlir.",
      "Böyük şirkətlərin “təcrübə proqramı” səhifələrini izlə, adətən yaz və payızda açılır.",
      "Kiçik şirkətlərə və startaplara birbaşa e-poçt yaz — rəqabət azdır.",
      "Bitirdiyin hər layihəni portfolioya əlavə et — təcrübən yoxdursa, nümunələrin danışsın.",
    ],
    link: { href: "#qiymetler", label: "Premium-da vakansiya uyğunluğu →" },
  },
  {
    keys: ["maaş", "maas", "əmək haqqı", "emek haqqi", "salary", "danışıq"],
    text: "Maaş danışığında:",
    tips: [
      "Əvvəlcə araşdır: eyni vəzifə üçün elanlardakı maaş aralıqlarına bax.",
      "Rəqəmi ilk sən demə — “Bu vəzifə üçün büdcəniz nədir?” deyə soruş.",
      "Dəqiq rəqəm əvəzinə aralıq de, aşağı həddi gözləntindən bir az yuxarı qoy.",
      "Yalnız maaşı yox, bonus, təlim, uzaqdan iş və məzuniyyəti də nəzərə al.",
    ],
  },
  {
    keys: ["salam", "hello", "sabahın xeyir", "günaydın"],
    text: "Salam! 👋 Sənə necə kömək edə bilərəm? CV, müsahibə, LinkedIn, staj və ya maaş haqqında soruş.",
  },
  {
    keys: ["təşəkkür", "tesekkur", "sağ ol", "sag ol", "çox sağ", "thanks"],
    text: "Dəyməz! 😊 Başqa sualın olsa, yaz — uğurlar!",
  },
];

const CHAT_FALLBACK = {
  text: "Bu suala hələ cavab verə bilmirəm (demo versiya). Bu mövzulardan birini seç:",
  tips: ["CV yazmaq", "Müsahibəyə hazırlıq", "LinkedIn profili", "Staj tapmaq", "Maaş danışığı"],
};

function findAnswer(question) {
  const q = question.toLocaleLowerCase("az");
  return CHAT_TOPICS.find((topic) => topic.keys.some((key) => q.includes(key))) || CHAT_FALLBACK;
}

function addMessage(from, content) {
  const msg = document.createElement("div");
  msg.className = `msg msg-${from}`;

  const p = document.createElement("p");
  p.textContent = typeof content === "string" ? content : content.text;
  msg.appendChild(p);

  if (content.tips) {
    const ul = document.createElement("ul");
    content.tips.forEach((tip) => {
      const li = document.createElement("li");
      li.textContent = tip;
      ul.appendChild(li);
    });
    msg.appendChild(ul);
  }

  if (content.link) {
    const a = document.createElement("a");
    a.className = "msg-link";
    a.href = content.link.href;
    a.textContent = content.link.label;
    a.addEventListener("click", () => toggleChat(false));
    msg.appendChild(a);
  }

  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
  return msg;
}

function botReply(question) {
  const typing = document.createElement("div");
  typing.className = "msg msg-bot msg-typing";
  typing.setAttribute("aria-label", "AI Mentor yazır");
  typing.innerHTML = "<span></span><span></span><span></span>";
  chatLog.appendChild(typing);
  chatLog.scrollTop = chatLog.scrollHeight;

  setTimeout(() => {
    typing.remove();
    addMessage("bot", findAnswer(question));
  }, reduceMotion ? 200 : 700);
}

function sendQuestion(text) {
  const question = text.trim();
  if (!question) return;
  addMessage("user", question);
  botReply(question);
}

function toggleChat(open) {
  chatPanel.hidden = !open;
  chatFab.setAttribute("aria-expanded", String(open));
  chatFab.setAttribute("aria-label", open ? "AI Mentor çatını bağla" : "AI Mentor çatını aç");
  chatFab.querySelector(".chat-fab-icon").textContent = open ? "✕" : "💬";

  if (open) {
    if (!chatStarted) {
      chatStarted = true;
      const user = getCurrentUser();
      addMessage("bot", {
        text: `Salam${user ? `, ${user.name}` : ""}! Mən AI Mentoram (demo). CV, müsahibə, LinkedIn, staj və ya maaş haqqında soruş — və ya aşağıdakı düymələrdən birini seç.`,
      });
    }
    chatInput.focus();
  }
}

chatFab.addEventListener("click", () => toggleChat(chatPanel.hidden));
document.querySelector("#chat-close").addEventListener("click", () => {
  toggleChat(false);
  chatFab.focus();
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuestion(chatInput.value);
  chatInput.value = "";
});

document.querySelectorAll(".chat-chip").forEach((chip) => {
  chip.addEventListener("click", () => sendQuestion(chip.textContent));
});

// Esc ilə bağla
chatPanel.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    toggleChat(false);
    chatFab.focus();
  }
});

// ===== 11. Footer: yuxarı qalx =====
document.querySelector("#to-top").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  document.querySelector(".logo").focus({ preventScroll: true });
});

// ===== API rejimini işə sal =====
// Backend tapılsa: real sahələr, real hesab və tarixçə; tapılmasa demo rejim olduğu kimi qalır
apiReady.then(async (enabled) => {
  if (!enabled) {
    updateView();
    return;
  }
  document.documentElement.classList.add("api-mode");

  // Hədəf sahələr (backend-in real analiz edə bildiyi)
  try {
    apiFields = await api("/api/match/fields");
    [majorSelect, regMajor, profileMajor].forEach(fillApiFieldSelect);
    document.querySelector('label[for="cv-major"]').textContent = "Hədəf sahə";
    document.querySelector('label[for="reg-major"]').textContent = "Hədəf sahə";
    document.querySelector('label[for="profile-major"]').textContent = "Hədəf sahə";
  } catch (error) {
    showToast(error.message, "error");
  }

  // Mətnlər real rejimə uyğun
  document.querySelector("#cv-privacy-note").textContent =
    "🔒 CV mətni AI analizi üçün serverə göndərilir; PDF faylın özü saxlanmır. Analiz üçün hesaba daxil ol.";
  document.querySelector("#reg-pass-hint").textContent = `(min. ${minPasswordLength()} simvol)`;

  // Artıq daxil olubsa (sessiya cookie-si), istifadəçini və tarixçəni yüklə
  try {
    apiUser = makeApiUser(await api("/api/auth/me"));
    await loadApiHistory();
  } catch (error) {
    apiUser = null;
  }

  renderUser();
  updateView();
});
