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
  // İkon (menyu / bağla) CSS ilə aria-expanded-ə görə dəyişir
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
  // İkon (ay / günəş) CSS ilə data-theme-ə görə dəyişir
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
// Yalnız fayl kimi açılanda (file://) prototip məlumatı işləyir.
const apiMode = location.protocol !== "file:";
document.documentElement.classList.toggle("api-mode", apiMode);
let apiChecked = false;
let apiUser = null; // server hesabı və profili
let apiFields = []; // /api/match/fields
let apiHistory = []; // /api/history (yalnız qiymətləndirmələr)
const apiRoadmaps = new Map(); // evaluation_id → /api/roadmap cavabı
let accountEpoch = 0;
let historyRead = null;
let stopApiEvaluation = null;
const roadmapReads = new Map();
const roadmapWrites = new Set();

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail; // 422-də sahə xətalarının siyahısı
  }
}

async function api(path, options = {}, timeoutMs = 60000) {
  const owner = apiUser;
  const epoch = accountEpoch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(path, { credentials: "same-origin", ...options, signal: controller.signal });
    if (!res.ok) {
      let message = "Xəta baş verdi. Yenidən cəhd et.";
      let detail;
      try {
        const data = await res.json();
        detail = data.detail;
        if (typeof detail === "string") message = detail;
        else if (res.status === 422 && Array.isArray(detail) && detail.length) message = validationMessage(detail[0]);
        else if (res.status === 422) message = "Daxil etdiyin məlumatın formatını və uzunluğunu yoxla.";
      } catch (error) {
        // Cavab JSON deyil — ümumi mesaj qalır
      }
      if (res.status === 401 && owner && epoch === accountEpoch && !path.startsWith("/api/auth/")) {
        clearAccountState();
        renderUser();
        updateView();
      }
      const error = new ApiError(message, res.status, detail);
      error.retryAfter = Number(res.headers?.get("Retry-After"));
      throw error;
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

// FastAPI 422: sahə xətaları Azərbaycan dilində
const SIGNUP_FIELD_IDS = {
  first_name: "reg-name",
  last_name: "reg-surname",
  email: "reg-email",
  password: "reg-pass",
  specialty_id: "reg-major",
  consent: "reg-consent",
};
const VALIDATION_FIELD_NAMES = {
  first_name: "Ad", last_name: "Soyad", email: "E-poçt", password: "Şifrə", specialty_id: "İxtisas",
  name: "Ad", surname: "Soyad", field_id: "İxtisas", education: "Təhsil", interests: "Maraqlar", skills: "Bacarıqlar",
};

function validationMessage(err) {
  const field = Array.isArray(err.loc) ? err.loc[1] : "";
  const name = VALIDATION_FIELD_NAMES[field] || "Sahə";
  if (err.type === "string_too_short") return `${name} çox qısadır (minimum ${err.ctx?.min_length ?? ""} simvol).`;
  if (field === "skills" && err.type === "too_long") return "Ən çox 24 bacarıq əlavə et.";
  if (err.type === "string_too_long") return `${name} çox uzundur (maksimum ${err.ctx?.max_length ?? ""} simvol).`;
  if (field === "email") return "Düzgün e-poçt ünvanı yaz.";
  if (field === "consent") return "Davam etmək üçün razılığını təsdiqlə.";
  if (field === "specialty_id" || field === "field_id") return "İxtisasını siyahıdan seç.";
  if (err.type === "missing") return `${name} boş ola bilməz.`;
  return `${name} düzgün doldurulmayıb.`;
}

function sendJson(path, body, method = "POST", timeoutMs) {
  return api(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeoutMs);
}

function makeApiUser(me, profile = {}) {
  return {
    id: me.id, email: me.email,
    name: profile.name ?? me.first_name ?? "",
    surname: profile.surname ?? me.last_name ?? "",
    major: profile.field_id ?? me.specialty_id ?? "",
    education: profile.education || "",
    interests: profile.interests || "",
    skills: profile.skills || [],
  };
}

async function signedInUser(me) {
  try {
    return makeApiUser(me, await api("/api/profile"));
  } catch (error) {
    if (error.status === 401) throw error;
    showToast(error.message, "error");
    return makeApiUser(me);
  }
}

// Server rejimində CV məxfilik mətnləri (backend davranışına uyğun; kök səhifədəki mətnlə eyni)
// Demo rejim mətnləri index.html-də qalır.
const CV_PRIVACY_NOTE =
  "Analiz üçün PDF serverə göndərilir. PDF-in özü daimi saxlanmır, lakin ondan çıxarılan mətnin ilk 15 000 simvolu analiz üçün Gemini-yə ötürülə bilər. Analiz nəticəsi, fayl adı və CV-dən götürülən sitatlar tarixçədə (ən son 50 nəticə), fayl adı olmadan isə analiz keşində qala bilər. Saytda silmə düyməsi yoxdur; ətraflı məlumat FAQ-dadır.";
const CV_FILE_HINT = "Yalnız PDF, maksimum 5 MB. Analiz üçün serverə göndərilir — aşağıdakı məxfilik qeydinə bax.";
const CV_PRIVACY_FAQ =
  "Server rejimində CV-nin PDF faylı analiz üçün serverə göndərilir. PDF-in özü daimi saxlanmır və çıxarılan mətnin tam surəti bazaya yazılmır. Çıxarılan mətnin ilk 15 000 simvolu analiz üçün Gemini-yə ötürülə bilər. Analiz nəticəsi, fayl adı və CV-dən götürülən sitatlar hesabının tarixçəsində (ən son 50 nəticə) saxlanır. Eyni nəticə fayl adı olmadan analiz keşində də qala bilər. Saytda tarixçəni və ya hesabı silmə düyməsi yoxdur: tarixçə qeydi yalnız serverə göndərilən silmə sorğusu ilə silinir və onunla birlikdə yol xəritəsi də silinir, analiz keşindəki nüsxə isə silinmir. Beta sınağında uydurma məlumatla hazırlanmış CV istifadə et.";

// Başlıqda göstərmək üçün: ad boşdursa e-poçtun ilk hissəsi (yalnız göstərmək üçün, yadda saxlanmır)
function userLabel(user) {
  return user.name || user.email.split("@")[0];
}

function userFullLabel(user) {
  return [user.name, user.surname].filter(Boolean).join(" ") || userLabel(user);
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
    majorRole: apiFields.find((field) => field.id === data.field_id)?.role,
    total: data.overall_score,
    scores: cats.map((c) => c.score),
    labels: cats.map((c) => c.label),
    categories: cats,
    recommendations: data.recommendations || [],
    detectedSkills: data.detected_skills || [],
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

function loadApiHistory() {
  if (!apiUser) return Promise.resolve([]);
  if (historyRead) return historyRead;
  const read = api("/api/history?kind=evaluation").then((list) => {
    if (historyRead !== read) return [];
    apiHistory = list.map((item) => ({
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
  }).finally(() => {
    if (historyRead === read) historyRead = null;
  });
  historyRead = read;
  return read;
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

// İxtisaslar 7 qrup üzrə: [ad, profil]
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
  const search = document.createElement("input");
  search.className = "input specialty-search";
  search.type = "search";
  search.placeholder = "İxtisas axtar";
  search.setAttribute("aria-label", search.placeholder);
  search.setAttribute("aria-controls", select.id);
  select.before(search);
  bindSpecialtySearch(search, select, apiFields, select.value);
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
  const explanations = document.querySelector("#result-explanations");
  explanations.replaceChildren();
  entry.categories.forEach((category) => {
    const details = document.createElement("details");
    const title = document.createElement("summary");
    title.textContent = category.label;
    const reasoning = document.createElement("p");
    reasoning.textContent = category.reasoning;
    const fixes = document.createElement("ul");
    fillList(fixes, category.fixes || []);
    details.append(title, reasoning, fixes);
    explanations.append(details);
  });
  fillList(document.querySelector("#result-recommendations"),
    entry.recommendations.map((item) => item.title + " — " + item.details));
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

  const match = analysis.matchScore;
  document.querySelector("#gap-summary").textContent = typeof match === "number"
    ? `Sahəyə uyğunluq: ${match}%. ${have.length} bacarıq tam təsdiqləndi.`
    : `Sahənin ${total} əsas bacarığından ${have.length}-i CV-ində var (${percent}%).`;
  document.querySelector("#gap-bar").style.setProperty("--value", match ?? percent);

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

function readApiPlanState(analysis) {
  return apiRoadmaps.get(analysis.id)?.completed_task_ids || [];
}

function planMessage(text) {
  planDaysEl.innerHTML = "";
  const p = document.createElement("p");
  p.className = "plan-summary";
  p.textContent = text;
  planDaysEl.appendChild(p);
  updatePlanProgress(0, 0);
}

function loadApiRoadmap(id) {
  if (roadmapReads.has(id)) return roadmapReads.get(id);
  const read = api("/api/roadmap/" + id).then((roadmap) => {
    if (roadmapReads.get(id) === read && !roadmapWrites.has(id)) apiRoadmaps.set(id, roadmap);
  }).finally(() => {
    if (roadmapReads.get(id) === read) roadmapReads.delete(id);
  });
  roadmapReads.set(id, read);
  return read;
}

async function generateApiPlan(analysis) {
  const epoch = accountEpoch;
  if (!apiUser || roadmapWrites.has(analysis.id)) return;
  roadmapWrites.add(analysis.id);
  renderApiPlan(analysis);
  try {
    const roadmap = await api(`/api/roadmap/${analysis.id}`, { method: "POST" }, 180000);
    if (epoch !== accountEpoch) return;
    roadmapReads.delete(analysis.id);
    apiRoadmaps.set(analysis.id, roadmap);
    showToast("21 günlük plan hazırdır!", "success");
  } catch (error) {
    if (epoch === accountEpoch) showToast(error.message, "error");
  } finally {
    if (epoch === accountEpoch) {
      roadmapWrites.delete(analysis.id);
      if (currentAnalysis === analysis) renderApiPlan(analysis);
    }
  }
}

async function renderApiPlan(analysis) {
  const days = analysis.planDays;
  segments.forEach((btn) => {
    btn.setAttribute("aria-pressed", String(Number(btn.dataset.days) === days));
  });

  const roadmap = apiRoadmaps.get(analysis.id);
  if (!roadmap) {
    const epoch = accountEpoch;
    planMessage("Plan yüklənir…");
    try {
      await loadApiRoadmap(analysis.id);
    } catch (error) {
      if (currentAnalysis === analysis && analysis.planDays === days && epoch === accountEpoch) {
        planMessage(error.message);
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "btn btn-ghost";
        retry.textContent = "Yenidən cəhd et";
        retry.addEventListener("click", () => renderApiPlan(analysis));
        planDaysEl.append(retry);
      }
      return;
    }
    if (currentAnalysis === analysis && analysis.planDays === days && epoch === accountEpoch) renderApiPlan(analysis);
    return;
  }

  const legacy = roadmap.format === "legacy_weekly";
  document.querySelector(".segmented").hidden = legacy;

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
    button.disabled = roadmapWrites.has(analysis.id);
    button.textContent = button.disabled ? "AI plan hazırlayır…" : "AI ilə plan yarat";
    button.addEventListener("click", () => generateApiPlan(analysis));
    box.append(text, button);
    planDaysEl.appendChild(box);
    updatePlanProgress(0, 0);
    return;
  }

  const phases = legacy ? roadmap.roadmap : roadmap.roadmap.filter((phase) => PHASES_BY_DAYS[days].includes(phase.key));
  const checked = new Set(readApiPlanState(analysis));
  let total = 0;
  let done = 0;

  planDaysEl.innerHTML = "";
  if (legacy) {
    const caption = document.createElement("p");
    caption.className = "plan-summary";
    caption.textContent = "Saxlanılmış 30/60/90 günlük plan";
    planDaysEl.append(caption);
  }
  if (roadmap.summary) {
    const summary = document.createElement("p");
    summary.className = "plan-summary";
    summary.textContent = roadmap.summary;
    planDaysEl.appendChild(summary);
  }

  phases.forEach((phase) => {
    const heading = document.createElement("h5");
    heading.className = "panel-subtitle";
    heading.textContent = `${phase.label} · ${phase.days} gün`;
    const goal = document.createElement("p");
    goal.className = "plan-summary";
    goal.textContent = `${phase.goal} Nəticə: ${phase.milestone}`;
    planDaysEl.append(heading, goal);
    // Tapşırıqları günlərə qruplaşdır
    const byDay = new Map();
    phase.tasks.forEach((task, index) => {
      const period = legacy ? task.week : task.day;
      if (!byDay.has(period)) byDay.set(period, []);
      byDay.get(period).push({ task, id: `${phase.key}-${index}` });
    });

    [...byDay.keys()].sort((a, b) => a - b).forEach((dayNumber) => {
      const day = document.createElement("div");
      day.className = "plan-day";
      const title = document.createElement("p");
      title.className = "plan-day-title";
      title.textContent = (legacy ? "Həftə " : "Gün ") + dayNumber + " · " + phase.label;
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
planDaysEl.addEventListener("change", async (event) => {
  if (!event.target.matches('input[type="checkbox"]') || !currentAnalysis) return;
  const boxes = [...planDaysEl.querySelectorAll('input[type="checkbox"]')];
  const doneCount = boxes.filter((b) => b.checked).length;

  if (currentAnalysis.api) {
    const analysis = currentAnalysis;
    const epoch = accountEpoch;
    const box = event.target;
    boxes.forEach((input) => { input.disabled = true; });
    try {
      const updated = await sendJson("/api/roadmap/" + analysis.id + "/tasks/" + box.dataset.task,
        { completed: box.checked }, "PUT");
      if (epoch !== accountEpoch) return;
      roadmapReads.delete(analysis.id);
      apiRoadmaps.set(analysis.id, updated);
    } catch (error) {
      if (epoch === accountEpoch) showToast(error.message, "error");
    } finally {
      if (currentAnalysis === analysis) renderApiPlan(analysis);
    }
    return;
  } else {
    const done = boxes.filter((b) => b.checked).map((b) => Number(b.dataset.index));
    writeStorage(planKey(currentAnalysis, currentAnalysis.planDays), JSON.stringify(done));
  }

  const percent = updatePlanProgress(boxes.length, doneCount);
  if (percent === 100 && event.target.checked) {
    showToast("Plan tam yerinə yetirildi. Təbriklər!", "success");
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
  const role = analysis.api ? analysis.majorRole || analysis.majorName : getRole(analysis.major);
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
        <span class="job-match ${level}" aria-label="Nümunə uyğunluq ${job.match} faiz">${job.match}%</span>
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
    return { days: roadmap.format === "legacy_weekly" ? 90 : 21, done, total: ids.length, percent: ids.length ? Math.round((done / ids.length) * 100) : 0 };
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
  document.querySelector("#result-title").textContent = entry.api ? "Analiz nəticəsi" : "Nümunə analiz nəticəsi";
  renderResult({ name: entry.file }, entry.majorName || entry.major, entry.scores, entry.date, entry.api ? entry.total : null);
  if (entry.api) {
    applyApiResult(entry);
  } else {
    resultSummary.hidden = true;
    resultWarning.hidden = true;
  }
  currentAnalysis = { ...full, planDays: entry.api ? 7 : planStats(entry).days };
  renderSkills(currentAnalysis);
  if (!entry.api) renderPlan(currentAnalysis);
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
  if (analyzeBtn.disabled) return;
  const epoch = accountEpoch;
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analiz edilir…";
  result.hidden = true;
  const stopLoader = startApiLoader(["CV serverə göndərilir…", "AI CV-ni oxuyur…", "Sahə tələbləri ilə müqayisə edilir…", "Bal hesablanır…"]);
  stopApiEvaluation = stopLoader;

  try {
    const form = new FormData();
    form.append("file", file);
    form.append("field_id", fieldId);
    const data = await api("/api/evaluate", { method: "POST", body: form }, 180000);

    if (epoch !== accountEpoch) return;
    const entry = fromEvaluation(data, data.evaluation_id);
    apiHistory = [entry, ...apiHistory.filter((item) => item.id !== entry.id)];
    apiRoadmaps.delete(entry.id);
    presentAnalysis(entry);
    showToast("Analiz hazırdır!", "success");
    result.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    result.focus({ preventScroll: true });

    // Tarixçəni yenilə (4-cü tab və kabinet üçün)
    historyRead = null; // A read started before this write can contain an earlier snapshot.
    loadApiHistory()
      .then(() => { if (epoch === accountEpoch) renderHistory(entry.id); })
      .catch(() => {});
  } catch (error) {
    if (epoch === accountEpoch) showToast(error.message, "error");
    if (error.status === 401 && !apiUser) openAuth("tab-login");
  } finally {
    if (stopApiEvaluation === stopLoader) {
      stopLoader();
      stopApiEvaluation = null;
      analyzeBtn.disabled = false;
      analyzeBtn.textContent = "Analiz et";
    }
  }
}

// ===== 5. CV Yoxla: "Analiz et" =====
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
    if (!document.querySelector("#cv-consent").checked) {
      showToast("Davam etmək üçün CV məlumatlarının emalına razılıq ver.", "error");
      document.querySelector("#cv-consent").focus();
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
  analyzeBtn.textContent = "Analiz et";
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
  if (tab.id === "tab-plan" && currentAnalysis?.api) renderApiPlan(currentAnalysis);
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

// ===== 8. FAQ akkordeonu =====
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

// ===== 9. Tərəfdaşlıq forması =====
// Forma heç yerə göndərilmir (backend və əlaqə kanalı yoxdur): sahələr və düymə index.html-də
// söndürülüb, qəbul/abunə mesajı göstərilmir. Enter ilə göndərmə cəhdi də yalnız bunu bildirir.
const partnerForm = document.querySelector("#partner-form");
partnerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showToast("Tərəfdaşlıq forması hələ işləmir — heç nə göndərilmədi.", "error");
});

// ===== 10. Footer: bülleten (hələ işləmir) =====
const newsletterForm = document.querySelector("#newsletter-form");
newsletterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  showToast("Bülleten hələ işləmir — abunə yaranmadı.", "error");
});

// ===== 10. Footer: hələ hazır olmayan linklər =====
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
const otpForm = document.querySelector("#otp-form");
const authTabs = document.querySelector(".auth-tabs");
let endOtp = null;
let passwordPending = false;
const registerForm = document.querySelector("#register-form");
const regMajor = document.querySelector("#reg-major");
const googleNote = document.querySelector("#google-note");

// İxtisas siyahısını CV Yoxla bölməsindən köçür
regMajor.innerHTML = majorSelect.innerHTML;

function getCurrentUser() {
  return apiUser;
}

function minPasswordLength() {
  return 8;
}

// Pəncərəni aç / bağla
function openAuth(tabId = "tab-login") {
  setMenu(false);
  googleNote.textContent = "";
  document.querySelector("#login-notice").textContent = "";
  activateTab(document.getElementById(tabId), false);
  authModal.showModal();
  const firstInput = document.querySelector(`#${document.getElementById(tabId).getAttribute("aria-controls")} input`);
  firstInput.focus();
}

function closeAuth() {
  if (!passwordPending && otpForm.getAttribute("aria-busy") !== "true") authModal.close();
}

function resetOtpScreen() {
  endOtp?.();
  endOtp = null;
  otpForm.hidden = true;
  authTabs.hidden = loginForm.hidden = false;
}

function showOtpScreen(challenge) {
  authTabs.hidden = loginForm.hidden = true;
  otpForm.hidden = false;
  endOtp = startEmailOtp(otpForm, {
    challenge,
    request: sendJson,
    onVerified: finishSignIn,
    onCancel: () => {
      resetOtpScreen();
      document.querySelector("#login-pass").focus();
    },
  });
}

async function finishSignIn(me) {
  apiUser = await signedInUser(me);
  resetOtpScreen();
  signIn(`Xoş gəldin, ${userLabel(apiUser)}!`);
}

loginBtn.addEventListener("click", () => openAuth("tab-login"));
document.querySelector("#auth-close").addEventListener("click", closeAuth);
authModal.addEventListener("cancel", (event) => {
  if (passwordPending || otpForm.getAttribute("aria-busy") === "true") event.preventDefault();
});

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
  googleNote.textContent = "Google ilə giriş planlaşdırılır. Hazırda e-poçt ilə daxil ola bilərsən.";
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

  loginBtn.hidden = Boolean(user);
  userMenu.hidden = !user;
  userDropdown.hidden = true;
  userBtn.setAttribute("aria-expanded", "false");
  if (!user) return;

  document.querySelector("#user-avatar").textContent = userLabel(user).charAt(0).toUpperCase();
  document.querySelector("#user-name").textContent = userLabel(user);
  document.querySelector("#user-full-name").textContent = userFullLabel(user);
  document.querySelector("#user-email").textContent = user.email;
  document.querySelector("#user-plan").textContent = apiMode ? "Pulsuz beta" : "Demo hesabı";

  // CV Yoxla-da ixtisas boşdursa, istifadəçinin ixtisasını seç
  if (!majorSelect.value) majorSelect.value = user.major;
}

function signIn(message) {
  resetChat();
  authModal.close();
  loginForm.reset();
  registerForm.reset();
  renderUser();
  if (currentAnalysis) renderHistory(currentAnalysis.id);
  showToast(message, "success");

  loadApiHistory()
    .then(() => {
      if (currentAnalysis) renderHistory(currentAnalysis.id);
      if (!cabinet.hidden && apiUser) renderCabinet(apiUser);
    })
    .catch(() => {});

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
  if (!apiMode) {
    document.querySelector("#register-error").textContent = "Hesab yaratmaq üçün saytı serverdən aç.";
    return;
  }

  const name = document.querySelector("#reg-name").value.trim();
  const surname = document.querySelector("#reg-surname").value.trim();
  const email = document.querySelector("#reg-email").value.trim().toLowerCase();
  const pass = document.querySelector("#reg-pass").value;
  const pass2 = document.querySelector("#reg-pass2").value;
  const major = regMajor.value;
  const consent = document.querySelector("#reg-consent").checked;
  const minPass = minPasswordLength();

  const checks = [
    fieldError("reg-name", name.length >= 2 ? "" : "Adını yaz."),
    fieldError("reg-surname", surname.length >= 2 ? "" : "Soyadını yaz."),
    fieldError("reg-email", isValidEmail(email) ? "" : "Düzgün e-poçt ünvanı yaz."),
    fieldError("reg-pass", pass.length >= minPass ? "" : `Şifrə ən azı ${minPass} simvol olmalıdır.`),
    fieldError("reg-pass2", pass2 && pass2 === pass ? "" : "Şifrələr eyni deyil."),
    fieldError("reg-major", major ? "" : "İxtisasını seç."),
    fieldError("reg-consent", consent ? "" : "Davam etmək üçün razılığını təsdiqlə."),
  ];

  if (checks.includes(false)) {
    registerForm.querySelector(".is-invalid input, input.is-invalid, select.is-invalid")?.focus();
    return;
  }

  // API rejimi: hesab serverdə yaradılır; sessiya yalnız sonrakı /api/auth/login ilə açılır
  const submit = registerForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const me = await sendJson("/api/auth/signup", {
      email, password: pass, first_name: name, last_name: surname, specialty_id: major, consent,
    });
    registerForm.reset();
    activateTab(document.getElementById("tab-login"), false);
    document.querySelector("#login-email").value = me.email;
    document.querySelector("#login-notice").textContent = "Hesab yaradıldı. İndi daxil ol.";
    document.querySelector("#login-pass").focus();
  } catch (error) {
    if (error.status === 409) {
      fieldError("reg-email", error.message);
      document.querySelector("#reg-email").focus();
    } else if (error.status === 422 && Array.isArray(error.detail)) {
      const shown = new Set();
      error.detail.forEach((item) => {
        const key = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : "";
        const id = SIGNUP_FIELD_IDS[key];
        if (id && !shown.has(id)) {
          shown.add(id);
          fieldError(id, validationMessage(item));
        }
      });
      if (shown.size) {
        registerForm.querySelector(".is-invalid input, input.is-invalid, select.is-invalid")?.focus();
      } else {
        document.querySelector("#register-error").textContent = error.message;
      }
    } else {
      document.querySelector("#register-error").textContent = error.message;
    }
  } finally {
    submit.disabled = false;
  }
});

// Giriş
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.querySelector("#login-error");
  if (!apiMode) {
    errorEl.textContent = "Hesabına daxil olmaq üçün saytı serverdən aç.";
    return;
  }

  const email = document.querySelector("#login-email").value.trim().toLowerCase();
  const pass = document.querySelector("#login-pass");
  const ok = [
    fieldError("login-email", isValidEmail(email) ? "" : "Düzgün e-poçt ünvanı yaz."),
    fieldError("login-pass", pass.value ? "" : "Şifrəni yaz."),
  ];
  if (ok.includes(false)) return;
  const submit = loginForm.querySelector('button[type="submit"]');
  if (submit.disabled) return;
  submit.disabled = true;
  passwordPending = true;
  errorEl.textContent = "";
  try {
    const challenge = await sendJson("/api/auth/login", { email, password: pass.value });
    pass.value = "";
    if (Number.isInteger(challenge.expires_in)) {
      activateTab(document.querySelector("#tab-login"), false);
      showOtpScreen(challenge);
    } else {
      await finishSignIn(challenge);
    }
  } catch (error) {
    errorEl.textContent = error.message;
    pass.select();
  } finally {
    submit.disabled = false;
    passwordPending = false;
  }
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

function clearAccountState() {
  const applications = document.querySelector("#applications-modal");
  if (applications.open) applications.close();
  apiUser = null;
  accountEpoch++;
  apiHistory = [];
  historyRead = null;
  apiRoadmaps.clear();
  roadmapReads.clear();
  roadmapWrites.clear();
  resetChat();
  profileOwner = null;
  profileForm.reset();
  profileForm.querySelector('button[type="submit"]').disabled = false;
  clearFile();
  stopApiEvaluation?.();
  stopApiEvaluation = null;
  analyzeBtn.disabled = false;
  analyzeBtn.textContent = "Analiz et";
  document.querySelector("#cv-consent").checked = false;
  result.hidden = true;
  currentAnalysis = null;
}

async function logout() {
  if (apiMode) {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch (error) {
      showToast(error.message, "error");
      return;
    }
    clearAccountState();
  }
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
let profileOwner = null;
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
  const epoch = accountEpoch;
  try {
    await loadApiHistory();
    if (epoch !== accountEpoch) return;
    const latest = apiHistory[0];
    if (latest && !roadmapWrites.has(latest.id)) await loadApiRoadmap(latest.id);
  } catch (error) {
    if (epoch === accountEpoch) showToast(error.message, "error");
  }
  if (epoch === accountEpoch && !cabinet.hidden && apiUser) renderCabinet(apiUser);
}

function renderCabinet(user) {
  const entries = historyForCurrentUser();
  const latest = entries[0];
  const previous = entries[1];

  const hello = document.querySelector("#cabinet-hello");
  hello.textContent = `Salam, ${userLabel(user)}! Burada bütün CV analizlərin və irəliləyişin var. `;
  const badge = document.createElement("span");
  badge.className = "pill pill-accent";
  badge.textContent = apiMode ? "Pulsuz beta" : "Demo";
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
    apiMode ? (entries.length ? `Son analizlər · ${majors} fərqli ixtisas` : "Son analizlər") :
      (entries.length ? `${majors} fərqli ixtisas üzrə` : "Bütün vaxt üzrə");

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

  if (profileOwner === user.id && apiMode) return;
  profileOwner = user.id;
  document.querySelector("#profile-education").value = user.education || "";
  document.querySelector("#profile-interests").value = user.interests || "";
  document.querySelector("#profile-skills").value = (user.skills || []).join(", ");
  document.querySelector("#profile-name").value = user.name;
  document.querySelector("#profile-surname").value = user.surname;
  document.querySelector("#profile-email").value = user.email;
  profileMajor.value = user.major;
  ["profile-name", "profile-surname", "profile-major"].forEach((id) => fieldError(id, ""));
}

// Tarixçədən köhnə analizi aç
async function openAnalysisFromCabinet(entry) {
  const epoch = accountEpoch;
  // API rejimi: tarixçə siyahısında yalnız qısa məlumat var — tam nəticəni yüklə
  if (entry.api && entry.partial) {
    try {
      const detail = await api(`/api/history/${entry.id}`);
      if (epoch !== accountEpoch) return;
      entry = fromEvaluation(detail.result, detail.id, detail.created_at);
    } catch (error) {
      if (epoch === accountEpoch) showToast(error.message, "error");
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

profileForm.addEventListener("submit", async (event) => {
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
  ["profile-education", "profile-interests", "profile-skills"].forEach((id) => fieldError(id, ""));

  if (!apiUser) return;
  let user;
  const owner = apiUser;
  const epoch = accountEpoch;
  const button = profileForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const profile = await sendJson("/api/profile", {
      name, surname, field_id: major,
      education: document.querySelector("#profile-education").value.trim(),
      interests: document.querySelector("#profile-interests").value.trim(),
      skills: [...new Set(document.querySelector("#profile-skills").value.split(",").map((v) => v.trim()).filter(Boolean))],
    }, "PUT");
    if (epoch !== accountEpoch) return;
    user = apiUser = makeApiUser(owner, profile);
  } catch (error) {
    if (epoch !== accountEpoch) return;
    const fields = {
      name: "profile-name", surname: "profile-surname", field_id: "profile-major",
      education: "profile-education", interests: "profile-interests", skills: "profile-skills",
    };
    if (error.status === 422 && Array.isArray(error.detail)) {
      const fieldErrors = error.detail.filter((item) => Object.hasOwn(fields, item.loc?.[1]));
      for (const item of fieldErrors) fieldError(fields[item.loc[1]], validationMessage(item));
      if (fieldErrors.length) {
        document.getElementById(fields[fieldErrors[0].loc[1]]).focus();
        return;
      }
    }
    showToast(error.message, "error");
    return;
  } finally {
    if (epoch === accountEpoch) button.disabled = false;
  }
  if (!user) return;

  renderUser();
  majorSelect.value = major;
  renderCabinet(user);
  showToast("Profil yadda saxlanıldı.", "success");
});

document.querySelector("#profile-suggest").addEventListener("click", async () => {
  const epoch = accountEpoch;
  const latest = apiHistory[0];
  if (!latest || !apiUser) {
    showToast("Təkliflər üçün əvvəlcə CV-ni analiz et.", "error");
    return;
  }
  try {
    const evaluation = latest.partial
      ? (await api("/api/history/" + latest.id)).result
      : { detected_skills: latest.detectedSkills, field_id: latest.major };
    if (epoch !== accountEpoch) return;
    const input = document.querySelector("#profile-skills");
    const existing = input.value.split(",").map((v) => v.trim()).filter(Boolean);
    input.value = [...new Set([...existing, ...(evaluation.detected_skills || []).filter((v) => v.length <= 60)])]
      .slice(0, 24).join(", ");
    if (!profileMajor.value) profileMajor.value = evaluation.field_id;
    showToast("Təklifləri yoxla və yadda saxla.", "success");
    input.focus();
  } catch (error) {
    if (epoch === accountEpoch) showToast(error.message, "error");
  }
});

document.querySelector("#cabinet-logout").addEventListener("click", logout);

// Giriş pəncərəsi kabinetə keçmədən bağlanarsa, gözləməni ləğv et
authModal.addEventListener("close", () => {
  if (endOtp) {
    resetOtpScreen();
    sendJson("/api/auth/otp/cancel").catch(() => {});
  }
  if (!getCurrentUser()) pendingCabinet = false;
});

window.addEventListener("hashchange", updateView);
updateView();

// ===== Premium önizləməsi =====
const paymentPreview = document.querySelector("#pay-modal");
document.querySelector('[data-plan="premium"]').addEventListener("click", () => paymentPreview.showModal());
["#pay-close", "#pay-done"].forEach((selector) => {
  document.querySelector(selector).addEventListener("click", () => paymentPreview.close());
});
paymentPreview.addEventListener("click", (event) => {
  if (event.target === paymentPreview) paymentPreview.close();
});

// ===== AI Mentor çatı =====
const chatFab = document.querySelector("#chat-fab");
const chatPanel = document.querySelector("#chat-panel");
const chatLog = document.querySelector("#chat-log");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
let chatStarted = false;

// Mövzular və hazır cavablar js/chat-data.js faylındadır
const CHAT_DATA = window.CHAT_DATA || {};
const CHAT_TOPICS = Array.isArray(CHAT_DATA.topics) ? CHAT_DATA.topics : [];
const CHAT_GREETING = CHAT_DATA.greeting || "Salam{ad}! Sualını yaz.";
const CHAT_FALLBACK = CHAT_DATA.fallback || { text: "Bu suala hələ hazır cavabım yoxdur." };
const CHAT_TEXT_MAX = 1000;

const chatSub = document.querySelector("#chat-sub");
const chatChips = document.querySelector("#chat-chips");
const chatSend = chatForm.querySelector(".chat-send");
let chatHistoryLoaded = false;
let chatHistoryRequest = null;
let chatBusy = false;
let chatVersion = 0;

function resetChat() {
  chatVersion += 1;
  chatHistoryLoaded = false;
  chatHistoryRequest = null;
  chatBusy = false;
  chatStarted = false;
  chatForm.reset();
  chatSend.disabled = false;
  chatLog.replaceChildren();
  toggleChat(false);
}


function chipTopics() {
  return CHAT_TOPICS.filter((topic) => topic.chip);
}

function findAnswer(question) {
  const q = question.toLocaleLowerCase("az");
  const topic = CHAT_TOPICS.find((t) =>
    (t.keys || []).some((key) => q.includes(String(key).toLocaleLowerCase("az")))
  );
  return topic || { ...CHAT_FALLBACK, options: chipTopics().map((t) => t.chip) };
}

// AI cavabı: "- " və "1." ilə başlayan sətirlər siyahı olur (HTML kimi oxunmur)
function appendRichText(container, text) {
  let list = null;
  text.split(/\n+/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const clean = line.replace(/\*\*/g, "");
    const item = clean.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (item) {
      const tag = /^\d/.test(clean) ? "OL" : "UL";
      if (!list || list.tagName !== tag) {
        list = document.createElement(tag);
        container.appendChild(list);
      }
      const li = document.createElement("li");
      li.textContent = item[1];
      list.appendChild(li);
    } else {
      list = null;
      const p = document.createElement("p");
      p.textContent = clean;
      container.appendChild(p);
    }
  });
}

function addMessage(from, content) {
  const msg = document.createElement("div");
  msg.className = `msg msg-${from}`;

  if (typeof content === "string") {
    if (from === "bot") {
      appendRichText(msg, content);
    } else {
      const p = document.createElement("p");
      p.textContent = content;
      msg.appendChild(p);
    }
  } else {
    const p = document.createElement("p");
    p.textContent = content.text;
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

    if (content.options && content.options.length) {
      const box = document.createElement("div");
      box.className = "msg-options";
      content.options.forEach((label) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chat-chip";
        btn.textContent = label;
        btn.addEventListener("click", () => sendQuestion(label));
        box.appendChild(btn);
      });
      msg.appendChild(box);
    }

    if (content.link) {
      const a = document.createElement("a");
      a.className = "msg-link";
      a.href = content.link.href;
      a.textContent = content.link.label;
      a.addEventListener("click", () => toggleChat(false));
      msg.appendChild(a);
    }

    if (content.note) {
      const note = document.createElement("p");
      note.className = "msg-note";
      note.textContent = content.note;
      msg.appendChild(note);
    }
  }

  chatLog.appendChild(msg);
  chatLog.scrollTop = chatLog.scrollHeight;
  return msg;
}

function showTyping() {
  const typing = document.createElement("div");
  typing.className = "msg msg-bot msg-typing";
  typing.setAttribute("aria-label", "AI Mentor yazır");
  typing.innerHTML = "<span></span><span></span><span></span>";
  chatLog.appendChild(typing);
  chatLog.scrollTop = chatLog.scrollHeight;
  return typing;
}

// Real AI yalnız backend işləyəndə və istifadəçi daxil olanda
function chatUsesAI() {
  return apiMode && Boolean(apiUser);
}

function updateChatMode() {
  if (chatUsesAI()) chatSub.textContent = "Gemini · Söhbət tarixçəsi hesabında saxlanır";
  else if (apiMode) chatSub.textContent = "Hazır cavablar · AI üçün hesaba daxil ol";
  else chatSub.textContent = "Demo · AI deyil, hazır cavablar";
}

async function restoreMentorHistory() {
  if (!apiUser || chatHistoryLoaded) return;
  if (chatHistoryRequest) return chatHistoryRequest;

  const version = chatVersion;
  chatHistoryRequest = (async () => {
    try {
      const history = await api("/api/mentor/history");
      if (version !== chatVersion) return;
      history.forEach((turn) => {
        addMessage("user", turn.question);
        addMessage("bot", turn.answer);
      });
      chatHistoryLoaded = true;
    } catch (err) {
      if (version === chatVersion) showToast(err.message, "error");
    } finally {
      if (version === chatVersion) chatHistoryRequest = null;
    }
  })();
  return chatHistoryRequest;
}

async function sendQuestion(text) {
  const question = text.trim().slice(0, CHAT_TEXT_MAX);
  if (!question || chatBusy) return;
  updateChatMode();
  if (!chatUsesAI()) {
    chatInput.value = "";
    addMessage("user", question);
    addMessage("bot", { ...findAnswer(question), note: "Nümunə cavab · hazır məsləhət" });
    return;
  }
  const version = chatVersion;
  chatBusy = true;
  chatSend.disabled = true;
  await restoreMentorHistory();
  if (version !== chatVersion) return;
  chatInput.value = "";
  addMessage("user", question);
  const status = showTyping();
  try {
    const reply = await sendJson("/api/mentor", {
      question,
      evaluation_id: currentAnalysis ? Number(currentAnalysis.id) : null,
    }, "POST", 180000);
    if (version !== chatVersion) return;
    status.remove();
    addMessage("bot", reply.answer);
  } catch (error) {
    if (version !== chatVersion) return;
    status.remove();
    addMessage("bot", error.message);
    if (!chatInput.value) chatInput.value = question;
  } finally {
    if (version === chatVersion) {
      chatBusy = false;
      chatSend.disabled = false;
    }
  }
}

function toggleChat(open) {
  chatPanel.hidden = !open;
  chatFab.setAttribute("aria-expanded", String(open));
  chatFab.setAttribute("aria-label", open ? "AI Mentor çatını bağla" : "AI Mentor çatını aç");
  // İkon (çat / bağla) CSS ilə aria-expanded-ə görə dəyişir

  if (open) {
    updateChatMode();
    if (!chatStarted) {
      chatStarted = true;
      const user = getCurrentUser();
      const greeting = CHAT_GREETING.replace("{ad}", user ? `, ${userLabel(user)}` : "");
      // Demo rejimdə istifadəçi AI ilə danışmadığını bilsin
      const note = chatUsesAI() ? "" : "Hazırda demo rejimdəyəm: AI ilə yox, açar sözlərə görə hazır məsləhətlərlə cavab verirəm. Yazdıqların heç yerə göndərilmir.";
      addMessage("bot", { text: greeting, note });
    }
    restoreMentorHistory();
    chatInput.focus();
  }
}

// Tez sual düymələri chat-data.js-dəki "chip" sahəsindən
chipTopics().forEach((topic) => {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chat-chip";
  chip.textContent = topic.chip;
  chip.addEventListener("click", () => sendQuestion(topic.chip));
  chatChips.appendChild(chip);
});
chatChips.hidden = chatChips.children.length === 0;

chatFab.addEventListener("click", () => toggleChat(chatPanel.hidden));
document.querySelector("#chat-close").addEventListener("click", () => {
  toggleChat(false);
  chatFab.focus();
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  sendQuestion(chatInput.value);
});

// Esc ilə: əvvəlcə tam ekrandan çıx, sonra bağla
chatPanel.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (chatPanel.dataset.mode === "full") {
    setChatMode("normal");
    return;
  }
  toggleChat(false);
  chatFab.focus();
});

// ----- Çat pəncərəsinin ölçüsü: normal, böyük, tam ekran, əl ilə -----
const chatExpand = document.querySelector("#chat-expand");
const chatFull = document.querySelector("#chat-full");
const chatResize = document.querySelector("#chat-resize");
const CHAT_SIZE_KEY = "catOlcusu";

function setChatMode(mode) {
  chatPanel.dataset.mode = mode;
  chatPanel.classList.toggle("is-large", mode === "large");
  chatPanel.classList.toggle("is-full", mode === "full");
  if (mode !== "normal") {
    chatPanel.style.width = "";
    chatPanel.style.height = "";
  } else {
    applySavedChatSize();
  }
  chatExpand.setAttribute("aria-pressed", String(mode === "large"));
  chatExpand.setAttribute("aria-label", mode === "large" ? "Çatı kiçilt" : "Çatı böyüt");
  chatFull.setAttribute("aria-pressed", String(mode === "full"));
  chatFull.setAttribute("aria-label", mode === "full" ? "Tam ekrandan çıx" : "Tam ekran");
  chatLog.scrollTop = chatLog.scrollHeight;
}

function applySavedChatSize() {
  try {
    const size = JSON.parse(readStorage(CHAT_SIZE_KEY));
    if (size && window.matchMedia("(min-width: 768px)").matches) {
      chatPanel.style.width = `${Math.min(size.w, window.innerWidth - 32)}px`;
      chatPanel.style.height = `${Math.min(size.h, window.innerHeight - 120)}px`;
    }
  } catch (error) {
    // Saxlanmış ölçü yoxdur və ya pozulub
  }
}

chatExpand.addEventListener("click", () => {
  setChatMode(chatPanel.dataset.mode === "large" ? "normal" : "large");
});

chatFull.addEventListener("click", () => {
  setChatMode(chatPanel.dataset.mode === "full" ? "normal" : "full");
});

// Sol yuxarı küncdən dartıb ölçünü dəyiş (yalnız planşet və kompüterdə)
chatResize.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  const rect = chatPanel.getBoundingClientRect();
  const start = { x: event.clientX, y: event.clientY, w: rect.width, h: rect.height };
  setChatMode("normal");
  chatPanel.classList.add("is-resizing");
  chatResize.setPointerCapture(event.pointerId);

  function onMove(moveEvent) {
    const w = Math.min(Math.max(start.w + start.x - moveEvent.clientX, 320), window.innerWidth - 32);
    const h = Math.min(Math.max(start.h + start.y - moveEvent.clientY, 380), window.innerHeight - 120);
    chatPanel.style.width = `${Math.round(w)}px`;
    chatPanel.style.height = `${Math.round(h)}px`;
  }

  function onUp() {
    chatResize.removeEventListener("pointermove", onMove);
    chatResize.removeEventListener("pointerup", onUp);
    chatResize.removeEventListener("pointercancel", onUp);
    chatPanel.classList.remove("is-resizing");
    const rectNow = chatPanel.getBoundingClientRect();
    writeStorage(CHAT_SIZE_KEY, JSON.stringify({ w: Math.round(rectNow.width), h: Math.round(rectNow.height) }));
  }

  chatResize.addEventListener("pointermove", onMove);
  chatResize.addEventListener("pointerup", onUp);
  chatResize.addEventListener("pointercancel", onUp);
});

// İki dəfə klik: əl ilə verilən ölçünü sıfırla
chatResize.addEventListener("dblclick", () => {
  try { localStorage.removeItem(CHAT_SIZE_KEY); } catch (error) { /* Yaddaş əlçatan deyil */ }
  chatPanel.style.width = "";
  chatPanel.style.height = "";
});

setChatMode("normal");

// ===== 10. Footer: yuxarı qalx =====
document.querySelector("#to-top").addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  document.querySelector(".logo").focus({ preventScroll: true });
});

// ===== API rejimini işə sal =====
(async () => {
  if (!apiMode) {
    apiChecked = true;
    updateView();
    return;
  }
  document.querySelector("#cv-privacy-note").textContent = CV_PRIVACY_NOTE;
  document.querySelector("#cv-file-hint").textContent = CV_FILE_HINT;
  document.querySelector("#faq-privacy-answer").textContent = CV_PRIVACY_FAQ;
  document.querySelector("#reg-pass-hint").textContent = `(min. ${minPasswordLength()} simvol)`;

  // Hədəf sahələr (backend-in real analiz edə bildiyi)
  try {
    apiFields = await api("/api/match/fields");
    [majorSelect, regMajor, profileMajor].forEach(fillApiFieldSelect);
    document.querySelector('label[for="cv-major"]').textContent = "İxtisas";
    document.querySelector('label[for="reg-major"]').textContent = "İxtisas";
    document.querySelector('label[for="profile-major"]').textContent = "İxtisas";
  } catch (error) {
    showToast(error.message, "error");
  }

  // Artıq daxil olubsa (sessiya cookie-si), istifadəçini və tarixçəni yüklə
  try {
    apiUser = await signedInUser(await api("/api/auth/me"));
    loadApiHistory().catch((error) => showToast(error.message, "error"));
  } catch (error) {
    apiUser = null;
  }

  apiChecked = true;
  renderUser();
  updateView();
  if (location.hash === "#ai-mentor") toggleChat(true);
})();

// ===== Tech qatı: animasiyalar və hover effektləri =====
(function () {
  const root = document.documentElement;
  const motionOK = !reduceMotion;
  if (motionOK) root.classList.add("motion");

  // Səhifənin oxunma zolağı və header kölgəsi
  const progressBar = document.querySelector(".scroll-progress");
  const header = document.querySelector(".site-header");
  let ticking = false;

  function onScroll() {
    const max = root.scrollHeight - window.innerHeight;
    progressBar.style.setProperty("--progress", max > 0 ? (window.scrollY / max).toFixed(4) : 0);
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(onScroll);
    }
  }, { passive: true });
  onScroll();

  // Bölmə başlıqları və addım xətti ekrana girəndə
  const animated = document.querySelectorAll(".section-head, [data-animate]");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    animated.forEach((el) => io.observe(el));
  } else {
    animated.forEach((el) => el.classList.add("in-view"));
  }

  // Kartlarda kursoru izləyən işıq
  document.querySelectorAll(".why-card, .price-card, .rewrite-col").forEach((el) => {
    el.classList.add("spot");
    el.addEventListener("pointermove", (event) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--x", `${event.clientX - rect.left}px`);
      el.style.setProperty("--y", `${event.clientY - rect.top}px`);
    });
  });

  if (!motionOK) return;

  // Hero: işıq kursorun ardınca gedir, vizual yüngülcə əyilir
  const hero = document.querySelector(".hero");
  const visual = document.querySelector(".hero-visual");
  const wide = window.matchMedia("(min-width: 1200px)");

  hero.addEventListener("pointermove", (event) => {
    const rect = hero.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    hero.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    hero.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    if (wide.matches) {
      visual.style.setProperty("--ry", `${((x - 0.5) * 10).toFixed(2)}deg`);
      visual.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
    }
  });

  hero.addEventListener("pointerleave", () => {
    visual.style.setProperty("--rx", "0deg");
    visual.style.setProperty("--ry", "0deg");
  });

  // Etiketdə yazı makinası effekti
  const kicker = document.querySelector("#kicker-text");
  const phrases = [
    "Tələbələr və yeni məzunlar üçün",
    "PDF yüklə, CV nəticəni gör",
    "120-dən çox ixtisas üzrə bacarıq xəritəsi",
    "7, 14 və ya 21 günlük fərdi plan",
  ];
  // Bir taymer: hər 40 ms-də bir hərf silinir və ya yazılır, aralarda fasilə
  const TICK = 40;
  const PAUSE_TICKS = 70; // ~2.8 saniyə
  let index = 0;
  let length = phrases[0].length;
  let deleting = true;
  let pause = 75; // ilk dəfə ~3 saniyə gözlə

  setInterval(() => {
    if (pause > 0) {
      pause--;
      return;
    }
    if (deleting) {
      length = Math.max(0, length - 2);
      if (length === 0) {
        deleting = false;
        index = (index + 1) % phrases.length;
      }
    } else {
      length++;
      if (length >= phrases[index].length) {
        deleting = true;
        pause = PAUSE_TICKS;
      }
    }
    kicker.textContent = phrases[index].slice(0, length);
  }, TICK);
})();
