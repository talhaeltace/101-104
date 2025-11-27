# 🚀 Otomatik Güncelleme Sistemi

## Nasıl Çalışır?

Artık uygulamanda **Supabase tabanlı otomatik güncelleme kontrolü** var! 

### Sistem Akışı:
1. ✅ Kullanıcı uygulamayı açar
2. ✅ Uygulama Supabase'den en son versiyonu kontrol eder
3. ✅ Yeni versiyon varsa popup gösterir
4. ✅ Kullanıcı "İndir" butonuna basar
5. ✅ Yeni APK indirilir

## 📋 Supabase Migration'ı Çalıştır

İlk önce Supabase'e migration'ı çalıştır:

```bash
# Supabase CLI ile:
supabase db push

# Veya Supabase Dashboard'dan:
# SQL Editor > New Query > migration dosyasını yapıştır
```

Migration dosyası: `supabase/migrations/20251127_create_app_version.sql`

## 🔧 Yeni Versiyon Yayınlama Adımları

### 1. Kod değişikliğini yap

### 2. Version numarasını artır

`src/components/VersionChecker.tsx` dosyasında:
```typescript
const CURRENT_VERSION_CODE = 2;  // 1'den 2'ye çıkar
const CURRENT_VERSION_NAME = '1.1.0';  // Versiyon ismini güncelle
```

### 3. APK oluştur
```bash
npm run build:apk
```

### 4. APK'yı bir yere yükle

APK'yı yükleyebileceğin yerler:
- **Google Drive** (Public link al)
- **Dropbox** (Public link al)
- **GitHub Releases**
- **Kendi sunucun** (XAMPP varsa public folder)
- **Herhangi bir dosya hosting**

Örnek: `https://drive.google.com/uc?export=download&id=XXXXX`

### 5. Supabase'de yeni versiyon ekle

Supabase Dashboard > SQL Editor:

```sql
INSERT INTO app_version (version_code, version_name, apk_url, release_notes, is_mandatory)
VALUES (
  2,
  '1.1.0',
  'https://yourserver.com/app-latest.apk',
  'Yenilikler:
- Süre tutma düzeltmeleri
- Harita simgesi eklendi
- Performance iyileştirmeleri',
  false  -- true ise zorunlu güncelleme, false ise isteğe bağlı
);
```

### 6. Eski kullanıcılar uygulamayı açtığında:

- 🔔 Popup görürler: "Yeni Versiyon Mevcut"
- 📱 "İndir" butonuna basarlar
- ✅ Yeni APK'yı yüklerler

## ⚙️ Güncelleme Türleri

### İsteğe Bağlı Güncelleme (`is_mandatory: false`)
- Kullanıcı "Daha Sonra" diyebilir
- Uygulamayı kullanmaya devam edebilir
- Tekrar açtığında yine popup görür

### Zorunlu Güncelleme (`is_mandatory: true`)
- "Daha Sonra" butonu YOK
- Kullanıcı güncellemeden uygulamayı kullanamaz
- Kritik güncellemeler için kullan

## 📝 Örnek Supabase Kayıt

```sql
-- Versiyon 1.0.0 (İlk versiyon - zaten var)
INSERT INTO app_version (version_code, version_name, apk_url, release_notes, is_mandatory)
VALUES (1, '1.0.0', 'https://example.com/v1.apk', 'İlk sürüm', false);

-- Versiyon 1.1.0 (İsteğe bağlı)
INSERT INTO app_version (version_code, version_name, apk_url, release_notes, is_mandatory)
VALUES (2, '1.1.0', 'https://example.com/v1.1.apk', 'Bug düzeltmeleri', false);

-- Versiyon 2.0.0 (ZORUNLU)
INSERT INTO app_version (version_code, version_name, apk_url, release_notes, is_mandatory)
VALUES (3, '2.0.0', 'https://example.com/v2.apk', 'Kritik güvenlik güncellemesi', true);
```

## 🎯 Önemli Notlar

1. **APK URL mutlaka erişilebilir olmalı** - Telefondan test et!
2. **Version code her zaman artmalı** - 1, 2, 3, 4... (geri dönüş yok)
3. **APK adını değiştirme** - Her seferinde aynı URL kullanabilirsin, sadece dosyayı değiştir
4. **VersionChecker.tsx'te version'ı unutma!** - Yoksa kullanıcılar sürekli popup görür

## 🐛 Sorun Giderme

**Popup görünmüyor:**
- Supabase'de `app_version` tablosu oluşturulmuş mu?
- RLS policy'ler doğru mu?
- Console'da hata var mı? (F12)

**APK indirme çalışmıyor:**
- URL doğru mu? Tarayıcıdan test et
- Public erişim var mı?
- CORS sorunu olabilir (direkt download link olmalı)

**Her açılışta popup gösteriyor:**
- VersionChecker.tsx'te `CURRENT_VERSION_CODE` güncellemeyi unutmuş olabilirsin
- Build yeniden yapılmış mı?

## ✨ Gelişmiş: Auto-Download

İleride istersen otomatik indirme de ekleyebiliriz:
- Background download
- Silent install (root gerekir)
- In-app browser ile download

Ama şimdilik manuel indirme en güvenli ve kolay yöntem!
