# Karyera Mentoru — layihə təlimatı

## Layihə
"Karyera Mentoru" tələbə və gənc məzunlar üçün Azərbaycan dilində AI karyera mentoru saytıdır.
Əsas axın: CV yüklə → AI analizi → bacarıq boşluğu → 7/14/21 günlük plan → vakansiya uyğunluğu.
Hədəf auditoriya: 18–25 yaşlı tələbələr, gənc məzunlar, universitet karyera mərkəzləri.
Bu, təqdimat üçün **frontend prototipidir**. Real AI, server və ödəniş yoxdur; nəticələr demo məlumatlarla göstərilir.

## Texniki qaydalar
- Yalnız **HTML, CSS, JavaScript** (vanilla). Framework, kitabxana, build aləti YOXDUR.
- Fayllar:
  - `index.html` — bütün səhifə quruluşu
  - `css/style.css` — bütün stillər
  - `js/script.js` — bütün interaktivlik
  - `assets/` — loqo, favicon, şəkillər
- Bütün mətnlər **Azərbaycan dilində**, `<html lang="az">`.
- **Mobile-first**: əvvəl telefon (360px), sonra planşet (768px), sonra kompüter (1200px).
- Semantik HTML: `header`, `nav`, `main`, `section`, `footer`, `button`, `label`.
- Əlçatanlıq: hər şəklə `alt`, ikon düymələrə `aria-label`, görünən `:focus-visible`, kontrast ən azı 4.5:1.
- Kodda şərhlər (comment) Azərbaycan dilində və qısa olsun, hər bölmənin başlanğıcını göstərsin.
- Formalar heç yerə göndərilmir: uğur mesajı (toast) göstərilir.
- Ödəniş pəncərəsində "DEMO — real kart məlumatı daxil etməyin" yazısı mütləq olsun.
- Hər dəyişiklikdən sonra nəyi dəyişdiyini 2–3 cümlə ilə izah et. Mən proqramçı deyiləm, sadə dildə yaz.

## Dizayn sistemi
CSS dəyişənləri (`:root`) ilə tətbiq et, rəngləri birbaşa yazma.

**Rənglər**
- `--primary: #4F46E5` (əsas bənövşəyi-göy, düymələr)
- `--primary-light: #6366F1` (vurğu, linklər)
- `--success: #0D9488` (yaxşı nəticə, mövcud bacarıq)
- `--warning: #D97706` (zəif nəticə, çatışmayan bacarıq)
- `--bg: #F8F8FC` (fon), `--card: #FFFFFF` (kart fonu)
- `--text: #16162A` (əsas mətn), `--muted: #6B6B85` (ikinci dərəcəli mətn)
- `--border: #E4E4F0`, `--soft: #EEF0FF` (yumşaq fon, etiketlər)
- Qaranlıq rejim: `--bg: #0F0F1C`, `--card: #18182B`, `--text: #EDEDF7`, `--muted: #9A9AB8`, `--border: #2A2A44`, `--soft: #222246`

**Tipoqrafiya**
- Şrift: Google Fonts-dan **Manrope** (başlıqlar 700–800, mətn 400–500)
- H1: 2rem (mobil) → 3.3rem (kompüter); H2: 1.5rem → 2.2rem; mətn: 16px, sətir hündürlüyü 1.6

**Komponentlər**
- Düymə: radius 12px, padding 11px 20px, hover-də 2px yuxarı qalxır və kölgə alır
- Əsas düymə: `--primary` fon, ağ mətn
- Kart: ağ fon, 1px border, radius 18px, padding 22px, hover-də yumşaq kölgə
- Etiket (pill): radius 99px, kiçik şrift; yaşıl = mövcud bacarıq, narıncı = çatışmayan
- Bölmələr arası boşluq: 64px; konteyner maksimum eni 1120px
- Animasiya: kartlar ekrana girəndə aşağıdan yuxarı yumşaq görünür; `prefers-reduced-motion` olanda animasiya söndürülür

## Səhifə quruluşu (yuxarıdan aşağı)
1. **Elan zolağı:** "Qapalı beta qeydiyyatı başladı! İlk 30 tələbə üçün tam pulsuz sınaq", bağlama (×) düyməsi ilə
2. **Header (sabit):** loqo "Karyera Mentoru"; menyu: Necə işləyir?, CV Yoxla, Üstünlüklər, Qiymətlər, FAQ, Tərəfdaşlıq; tema düyməsi (🌙/☀️); "Daxil ol"; əsas düymə "CV-ni Yoxla (Pulsuz)". Mobil versiyada ☰ menyusu.
3. **Hero:** etiket "Azərbaycan dilində ilk AI Karyera Mentoru"; başlıq "CV-dən konkret karyera planına bir platforma"; alt mətn "Tələbə və gənc məzunlar üçün AI karyera mentoru: CV analizi, bacarıq boşluğu, 7/14/21 günlük plan və vakansiya uyğunluğu."; düymələr "İndi CV-ni Yüklə" və "Necə işləyir?". Sağda nümunə kart: "CV Skoru" 72/100 (dairəvi qrafik), 4 zolaq (Struktur 80, ATS uyğunluğu 65, Nəticə və göstəricilər 58, Sahəyə uyğunluq 85), çatışmayan bacarıqlar: TypeScript, Security, Git.
4. **Necə işləyir? (5 nömrəli addım):** CV-ni əlavə et → AI analizi → Şəffaf qiymətləndirmə (4 kateqoriya, 100 bal) → Yol xəritəsi (7/14/21 gün) → Vakansiya uyğunluğu (%).
5. **CV Yoxla:** sürüklə-burax PDF zonası (yalnız PDF, maks. 5 MB); ixtisas seçimi (qruplar: İnformasiya texnologiyaları, Biznes və maliyyə, Mühəndislik və sənaye, Hüquq, media və sosial, Səhiyyə və kənd təsərrüfatı, Xidmət və yaradıcı sahələr, Digər); "Analiz Et" düyməsi; 2.5 saniyəlik yüklənmə animasiyası; nəticə 4 tabda: **Qiymətləndirmə** (ümumi bal, 4 kateqoriya zolağı, güclü/zəif tərəflər), **Bacarıq boşluğu** (yaşıl və narıncı etiketlər), **7/14/21 günlük plan** (çekbokslu tapşırıqlar), **Vakansiya və tarixçə** (uyğunluq % və cədvəl).
6. **Niyə Karyera Mentoru?:** 3 kart (Yerli bazar konteksti, Bağlı dövrə, Alıcılıq gücünə uyğun qiymət — aylıq 15 AZN) və müqayisə cədvəli: Rezi, Teal, Kickresume, Jobscan, Karyera Mentoru (sütunlar: Qiymət, AZ dili, CV skoru, Günlük plan, Vakansiya uyğ.). Karyera Mentoru sətri vurğulanır.
7. **Persona və rəylər:** Tahir, 21 yaş, Bakıda 4-cü kurs (Məqsəd / Problem / Gözlənti); rəylər karuseli (‹ › düymələri, 6 saniyədə avtomatik keçid). Rəylərin altında "Beta test iştirakçılarının rəyləri" qeydi.
8. **Qiymətlər (3 kart):** Pulsuz 0 AZN; **Premium Tələbə 15 AZN/ay** ("Ən Populyar"); Universitet Lisenziyası (illik, B2B, ilk pilot pulsuz).
9. **FAQ (akkordeon, 7 sual):** CV necə qiymətləndirilir; hansı format; 7/14/21 günlük plan nədir; Pulsuz və Premium fərqi; universitetlər necə qoşulur; hansı ixtisaslar var; şəxsi məlumatlar necə qorunur.
10. **Tərəfdaşlıq:** bənövşəyi fonlu kart, "Universitet, akademiya və ya kampus səfiri olun", forma (Ad/Təşkilat, E-poçt, "Müraciət göndər").
11. **Footer (4 sütun):** loqo və bülleten abunəsi; Sürətli keçidlər; Hüquqi (Məxfilik Siyasəti, İstifadə Şərtləri); Sosial şəbəkələr və "↑ Yuxarı qalx"; © 2026 Karyera Mentoru.

## Əlavə ekranlar (pəncərələr və kabinet)
- **Giriş / Qeydiyyat pəncərəsi:** iki tab. Giriş: e-poçt, şifrə. Qeydiyyat: ad, soyad, e-poçt, şifrə (min. 6 simvol), şifrə təkrarı, ixtisas, razılıq çekboksu. "Google ilə davam et" düyməsi (demo).
- **Şəxsi kabinet** (`#kabinet`): son CV skoru, analiz sayı, plan tamamlanma %, analiz tarixçəsi cədvəli, profil forması, "Çıxış".
- **Ödəniş pəncərəsi (DEMO):** Premium 15 AZN/ay, kart sahəsi, aydın DEMO xəbərdarlığı.
- **AI Mentor çatı:** sağ aşağıda üzən 💬 düyməsi; açar sözlərə görə hazır cavablar (CV, müsahibə, LinkedIn, staj, maaş).
- **Toast bildirişləri:** sağ yuxarıda, 3.5 saniyə; yaşıl = uğur, qırmızı = xəta.
- Məlumatlar `localStorage`-də saxlanır, hər oxuma/yazma `try/catch` içində.

## İş qaydası
- Hər dəfə **yalnız istənilən bölməni** et, digərlərinə toxunma.
- Mövcud kodu silmə və yenidən yazma; yalnız lazım olan yeri dəyiş.
- Dəyişiklikdən sonra telefon və kompüter görünüşünün pozulmadığını yoxla.
