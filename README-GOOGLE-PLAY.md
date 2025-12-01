# Google Play Store Yayınlama Rehberi

## 🔐 1. Keystore Oluşturma (Sadece 1 Kez)

**ÖNEMLİ:** Keystore dosyasını ve şifresini kaybetmeyin! Google Play'e yüklenen uygulamanın güncellemesi için aynı keystore gereklidir.

```powershell
# Proje root klasöründe çalıştırın
keytool -genkey -v -keystore nelit-release.keystore -alias nelit -keyalg RSA -keysize 2048 -validity 10000
```

Sorulacak bilgiler:
- Keystore şifresi (2 kez)
- Adınız Soyadınız
- Organizasyon Birimi (örn: Mobile)
- Organizasyon Adı (örn: NELIT)
- Şehir (örn: Istanbul)
- Eyalet/İl (örn: Istanbul)
- Ülke Kodu (TR)

## 📝 2. Keystore Bilgilerini Kaydetme

`android/gradle.properties` dosyasına ekleyin:

```properties
RELEASE_STORE_FILE=../nelit-release.keystore
RELEASE_STORE_PASSWORD=sizin_sifreniz
RELEASE_KEY_ALIAS=nelit
RELEASE_KEY_PASSWORD=sizin_key_sifreniz
```

## 🏗️ 3. Release AAB Oluşturma

```powershell
# Proje root klasöründe
npm run build
npx cap sync android

# Android klasörüne git
cd android

# Release AAB oluştur (Google Play için)
.\gradlew bundleRelease

# Veya Release APK oluştur (direkt yükleme için)
.\gradlew assembleRelease
```

## 📦 4. Çıktı Dosyaları

- **AAB (Google Play için):** `android/app/build/outputs/bundle/release/app-release.aab`
- **APK (Direkt yükleme):** `android/app/build/outputs/apk/release/101-104-release.apk`

## 🚀 5. Google Play Console

1. [Google Play Console](https://play.google.com/console) hesabı oluşturun (25$ tek seferlik ücret)
2. "Uygulama oluştur" seçin
3. Uygulama bilgilerini doldurun:
   - Uygulama adı: NELIT 101-104
   - Varsayılan dil: Türkçe
   - Uygulama türü: Uygulama
   - Kategori: İş / Productity
4. Store Listing bilgilerini tamamlayın:
   - Kısa açıklama (80 karakter)
   - Tam açıklama (4000 karakter)
   - Uygulama simgesi (512x512 PNG)
   - Feature graphic (1024x500 PNG)
   - Ekran görüntüleri (en az 2 adet)
5. İçerik derecelendirmesi anketini doldurun
6. Hedef kitle ve içerik seçin
7. "Production" > "Create new release" > AAB dosyasını yükleyin
8. Yayınla!

## 🔄 6. Güncelleme Yayınlama

Her güncelleme için `android/app/build.gradle` dosyasında:

```gradle
versionCode 2  // Her güncelleme için 1 artırın
versionName "1.0.1"  // Görünen versiyon
```

Sonra:
```powershell
npm run build
npx cap sync android
cd android
.\gradlew bundleRelease
```

Yeni AAB dosyasını Google Play Console'a yükleyin.

## ⚠️ Önemli Notlar

1. **Keystore'u kaybetmeyin!** - Backup alın, güvenli bir yerde saklayın
2. **gradle.properties dosyasını git'e commit etmeyin** - .gitignore'a ekleyin
3. **versionCode her güncellemede artmalı** - Google Play düşük versionCode kabul etmez
4. **Play App Signing kullanın** - Google keystore'unuzun yedeğini tutar

## 🔧 Sorun Giderme

### Keystore bulunamadı hatası
- Dosya yolunu kontrol edin
- `../nelit-release.keystore` yerine mutlak yol deneyin

### Şifre hatası
- Şifreyi tırnak içinde yazın: `RELEASE_STORE_PASSWORD="sifre123"`

### Build hatası
- `cd android && .\gradlew clean` çalıştırın
- Java 17 kurulu olduğundan emin olun
