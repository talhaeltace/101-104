# 🚀 Otomatik Güncelleme Sistemi (MySQL + API)

Bu projede güncelleme kontrolü Supabase değil; **Fastify API + Prisma + MySQL** ile çalışır.

## Nasıl çalışır?
1. ✅ Kullanıcı uygulamayı açar
2. ✅ Uygulama API’den en son versiyonu ister: `/app-version/latest?platform=android|ios|web`
3. ✅ Daha yeni sürüm varsa popup gösterir (zorunluysa kapatılamaz)
4. ✅ Tercihen Store’a yönlendirir (`store_url`)
5. (Opsiyonel/legacy) ✅ Android için direkt APK indirilebilir (`apk_url`)

Frontend: `src/components/VersionChecker.tsx`
Backend endpoint: `api/server.ts`
DB model: `prisma/schema.prisma` (`AppVersion`)

## Yeni sürüm yayınlama (önerilen)
1) Uygulamanın versiyonunu artır
- Android: `android/app/build.gradle` (versionCode/versionName)
- iOS: Xcode (MARKETING_VERSION / build)
- UI kontrol sabitleri: `src/components/VersionChecker.tsx` (CURRENT_* değerleri)

2) Store linklerini güncelle
- Android: Google Play linki (`store_url`)
- iOS: App Store linki (`store_url`)

3) DB’ye yeni versiyon kaydı ekle
- Script ile (önerilen):
  - `npm run db:appversion`
- veya MySQL’de manuel SQL ile (örnek alanlar):

```sql
INSERT INTO app_versions (platform, version_code, version_name, store_url, release_notes, is_mandatory)
VALUES ('android', 34, '2.1.16', 'https://play.google.com/store/apps/details?id=com.cartiva.app&hl=tr', 'Bug fix', 0);
```

Not: tablo adı/kolonlar şemaya göre değişebilir; en doğru kaynak `prisma/schema.prisma`.

## Sorun giderme
- Popup görünmüyor: API çalışıyor mu, `VITE_API_BASE_URL` doğru mu, `/app-version/latest` cevap veriyor mu?
- Sürekli popup: `VersionChecker.tsx` CURRENT_* değerleri yeni build ile güncellendi mi?
