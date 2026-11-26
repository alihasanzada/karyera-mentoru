// ===== AI Mentor çatı: mövzular və hazır cavablar =====
//
// Bu faylı dəyişməklə çatbotu genişləndirə bilərsən. Kod bilmək lazım deyil.
//
// Yeni mövzu əlavə etmək üçün "topics" siyahısındakı istənilən blokun
// { ... } surətini çıxar, sonuncu blokdan sonra vergüllə əlavə et və doldur:
//
//   {
//     keys: ["açar söz", "başqa yazılış"],  // sualda bu sözlərdən biri varsa, bu cavab seçilir
//     chip: "Düymənin adı",                   // (istəyə görə) çatın altında tez sual düyməsi
//     text: "Cavabın giriş cümləsi:",
//     tips: ["Birinci məsləhət.", "İkinci məsləhət."],               // (istəyə görə) siyahı
//     link: { href: "#cv-yoxla", label: "Bölməyə keçid →" },         // (istəyə görə) keçid
//   },
//
// Qeydlər:
// - Açar sözləri kiçik hərflə yaz. Hərfi "ə" olan sözün "e" ilə yazılışını da əlavə et.
// - Mövzular yuxarıdan aşağı yoxlanır: ilk uyğun gələn cavab göstərilir.
// - Sayt backend-ə qoşulanda və istifadəçi daxil olanda suallara real AI cavab verir.
//   Bu hazır cavablar o zaman yalnız AI əlçatan olmayanda istifadə olunur.

window.CHAT_DATA = {
  // Çat ilk açılanda göstərilən salam. {ad} yerinə istifadəçinin adı yazılır.
  greeting: "Salam{ad}! Mən Karyera Mentoruyam. CV, müsahibə, LinkedIn, staj və ya maaş haqqında soruş, ya da aşağıdakı düymələrdən birini seç.",

  // Heç bir mövzuya uyğun gəlməyəndə verilən cavab
  fallback: {
    text: "Bu suala hələ hazır cavabım yoxdur. Bu mövzulardan birini seç:",
  },

  topics: [
    {
      keys: ["cv", "rezüme", "rezume", "özgeçmiş"],
      chip: "CV necə yazım?",
      text: "Güclü CV üçün əsas qaydalar:",
      tips: [
        "1 səhifə: Əlaqə → Təhsil → Təcrübə → Bacarıqlar → Layihələr.",
        "Hər təcrübə bəndini fel ilə başla və rəqəmlə bitir: “Satışları 3 ayda 15% artırdım”.",
        "Vakansiyadakı açar sözləri CV-yə əlavə et, ATS sistemləri onları axtarır.",
        "Şəkil, cədvəl və rəngli fon istifadə etmə, ATS onları oxumaya bilər.",
      ],
      link: { href: "#cv-yoxla", label: "CV-ni yoxlat →" },
    },
    {
      keys: ["müsahibə", "musahibe", "interview"],
      chip: "Müsahibəyə hazırlıq",
      text: "Müsahibəyə hazırlıq üçün:",
      tips: [
        "Şirkəti araşdır: nə edir, son xəbərləri, dəyərləri.",
        "“Özün haqqında danış” sualına 1 dəqiqəlik hazır cavab yaz.",
        "Çətin suallara STAR metodu ilə cavab ver: Situasiya, Tapşırıq, Addım, Nəticə.",
        "Sonda ən azı 2 sual ver, məsələn: “Bu vəzifədə ilk 3 ayda uğur nə deməkdir?”",
      ],
    },
    {
      keys: ["linkedin", "linkdin", "profil"],
      chip: "LinkedIn profili",
      text: "LinkedIn profilini gücləndir:",
      tips: [
        "Peşəkar şəkil və aydın başlıq: “Data analitika tələbəsi | SQL, Power BI”.",
        "“Haqqında” bölməsində 3–4 cümlə: kimsən, nə bacarırsan, nə axtarırsan.",
        "Layihələrini və sertifikatlarını “Featured” bölməsinə əlavə et.",
        "Sahəndəki insanlarla şəxsi mesajla əlaqə qur, boş dəvət göndərmə.",
      ],
    },
    {
      keys: ["staj", "təcrübə proqram", "tecrube", "internship", "praktika", "təcrübəçi"],
      chip: "Staj tapmaq",
      text: "Staj tapmaq üçün:",
      tips: [
        "Universitetinin karyera mərkəzinə yazıl, çox staj elanı ilk ora gəlir.",
        "Böyük şirkətlərin “təcrübə proqramı” səhifələrini izlə, adətən yaz və payızda açılır.",
        "Kiçik şirkətlərə və startaplara birbaşa e-poçt yaz, rəqabət azdır.",
        "Bitirdiyin hər layihəni portfolioya əlavə et. Təcrübən yoxdursa, nümunələrin danışsın.",
      ],
      link: { href: "#cv-yoxla", label: "CV Yoxla-da nümunə vakansiyalar →" },
    },
    {
      keys: ["maaş", "maas", "əmək haqqı", "emek haqqi", "salary", "danışıq"],
      chip: "Maaş danışığı",
      text: "Maaş danışığında:",
      tips: [
        "Əvvəlcə araşdır: eyni vəzifə üçün elanlardakı maaş aralıqlarına bax.",
        "Rəqəmi ilk sən demə, “Bu vəzifə üçün büdcəniz nədir?” deyə soruş.",
        "Dəqiq rəqəm əvəzinə aralıq de, aşağı həddi gözləntindən bir az yuxarı qoy.",
        "Yalnız maaşı yox, bonus, təlim, uzaqdan iş və məzuniyyəti də nəzərə al.",
      ],
    },
    {
      keys: ["motivasiya", "cover letter", "müraciət məktubu", "məktub"],
      chip: "Motivasiya məktubu",
      text: "Motivasiya məktubu üçün:",
      tips: [
        "Yarım səhifədən uzun olmasın, 3 abzas kifayətdir.",
        "Birinci abzas: hansı vəzifəyə və niyə məhz bu şirkətə müraciət edirsən.",
        "İkinci abzas: vakansiyadakı 2 tələbi götür və hər birinə öz nümunəni yaz.",
        "Sonda görüşməyə hazır olduğunu qısa və nəzakətlə bildir.",
      ],
    },
    {
      keys: ["salam", "hello", "sabahın xeyir", "günaydın"],
      text: "Salam! Sənə necə kömək edə bilərəm? CV, müsahibə, LinkedIn, staj və ya maaş haqqında soruş.",
    },
    {
      keys: ["təşəkkür", "tesekkur", "sağ ol", "sag ol", "çox sağ", "thanks"],
      text: "Dəyməz. Başqa sualın olsa, yaz. Uğurlar!",
    },
  ],
};
