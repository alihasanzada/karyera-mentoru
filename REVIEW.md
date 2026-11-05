# Karyera Mentoru — 30 oktyabr 2026

Yoxlanılan baza: `main`, `f3dde1cc6f8cfa2970bdff7fd235985aee52b630`.

## Hazırkı vəziyyət

Layihə erkən MVP-dir. FastAPI backend, sadə JavaScript frontend, SQLite və Gemini inteqrasiyasından ibarətdir. Qiymətləndirmədə balın meyarlarla hesablanması, AI sübutlarının yoxlanması, istifadəçi mətnlərinin HTML üçün escape edilməsi və tarixçədə client-ID filtrinin olması müsbət tərəflərdir.

| Bölmə | Kodda vəziyyət |
| --- | --- |
| CV Mərkəzi | PDF emalı və dörd kateqoriya üzrə qiymətləndirmə |
| Sahə uyğunluğu | Frontend, Cybersecurity, Data Science üçün statik JSON profilləri |
| Dashboard və tarixçə | SQLite nəticələri, brauzer identifikatoru ilə filtr |
| Yol xəritəsi | Bacarıq boşluqları və AI ilə 30/60/90 günlük plan |
| İrəliləyiş | Yalnız brauzerin localStorage yaddaşında |
| Vakansiyalar | Hazırlıq ekranı, canlı vakansiya mənbəyi yoxdur |
| Müraciətlər | Hazırlıq ekranı |
| AI Mentor | Hazırlıq ekranı, söhbət API-si yoxdur |

## Bu paketdə düzəldilənlər

1. Qiymətləndirmə API-si saxlanmış qeydin ID-sini qaytarır. Frontend uğurlu analizi əlavə tarixçə sorğusundan asılı etmir və başqa sorğunun ID-sini götürmür.
2. Təkrar klik və bölməyə qayıdış eyni brauzer səhifəsində paralel qiymətləndirmə başlatmır.
3. Keş açarı tam mətni qoruyur: `C`, `C++`, fərqli sətir quruluşu və digər qiymətləndirməyə təsir edən fərqlər birləşdirilmir. Yeni açarlar əvvəlki keş qeydlərindən istifadə etmir.
4. API açarı yoxdursa, aydın konfiqurasiya xətası dərhal qaytarılır. Şəbəkə xətalarında ehtiyat model yoxlanılır; bütün modellər etibarsız olduqda əlavə gözləmə aradan qaldırılır. Xəta loglarına provayderin tam mesajı yazılmır.
5. PDF oxunuşu limit + 1 bayt ilə məhdudlaşdırılır; sinxron PDF parser ayrıca thread-də işləyir. Bu, tam HTTP upload/proxy limiti və ya parser üçün sərt CPU/vaxt limiti deyil.
6. Tarixçə silindikdə və 50 qeyd limiti tətbiq edildikdə əlaqəli yol xəritələri də silinir.
7. AI promptundakı statuslar sxemdəki `yes`, `partial`, `no` dəyərlərinə uyğunlaşdırılır.
8. API və frontend axın testləri, GitHub Actions konfiqurasiyası və məlumatların saxlanması barədə daha dəqiq README əlavə edilir.
9. Seçilən sahəyə uyğunluq balı yekun nəticənin əsasına çevrilir; CV-nin strukturu, ATS və təsir göstəriciləri onu 30%-ə qədər tənzimləyir. Sahə uyğunluğu 35-dən aşağıdırsa istifadəçiyə ayrıca xəbərdarlıq verilir. Keş versiyası yenilənib; köhnə tarixçə qeydləri əvvəlki hesablamanın snapshot-ıdır.

## Növbəti prioritetlər

- **İctimai istifadədən əvvəl:** giriş və AI sorğu limitləri, parol bərpası, e-poçt təsdiqi, CV məlumatları üçün razılıq və silinmə qaydası. Köhnə anonim `X-Client-Id` tarixçəsi yeni hesaba avtomatik daşınmır.
- **Məlumatların saxlanması:** SQLite üçün davamlı disk və ehtiyat nüsxə, sxem miqrasiyaları, keş üçün müddət və silinmə siyasəti. Analizlərdə şəxsi məlumatlı sitatlar qala bilər; tarixçə silinməsi keşi silmir.
- **Məhsulun əsas dəyəri:** icazəli/uyğun mənbədən real vakansiyalar və onların konkret tələbləri ilə CV müqayisəsi. Hazırkı sahə profilləri real vaxt bazar təhlili deyil.
- **Daha sonra:** nəticələrə əsaslanan mentor söhbəti, müraciət izləmə, cihazlararası irəliləyiş.
- **Texniki davamı:** AI-yə göndərilən ilk 15 000 simvoldan uzun CV-lər üçün aydın qayda, daha sərt sübut yoxlaması, paralel keş yazılışlarının idarəsi, roadmap sorğularında köhnə cavabların qarşısının alınması, Tailwind CDN əvəzinə qurulmuş CSS.

## Yoxlama və məhdudiyyətlər

- İlkin backend testləri: 21/21 uğurlu.
- Dəyişikliklərdən sonra: 33 backend testi və 3 frontend axın testi uğurlu.
- Real mətn PDF-si ilə upload/parser və HTTP endpoint axınları test olunur.
- AI cavabları testlərdə əvəz edilir; real Gemini modeli, açar/kvota və cavab keyfiyyəti yoxlanılmayıb.
- Frontend testləri Node VM-də sorğu axınlarını yoxlayır; real brauzerdə vizual/responsive yoxlama aparılmayıb.
- GitHub Actions faylı hazırlanıb; uzaq serverdə CI hələ icra edilməyib.
- Canlı deploy yoxlanılmayıb. Bu nəticələr repo koduna və lokal testlərə aiddir.
