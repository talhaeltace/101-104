# APK Oluşturma ve Dağıtım

## Hızlı APK Oluşturma

Her kod değişikliğinden sonra yeni APK oluşturmak için:

```bash
npm run build:apk
```

Bu komut şunları yapar:
1. ✅ Web assets'leri build eder (`npm run build`)
2. ✅ Android'e sync eder (`npx cap sync android`)
3. ✅ APK'yı oluşturur (Gradle build)
4. ✅ APK'yı proje root klasörüne kopyalar

## APK Konumu

Build sonrası APK burada olacak:
- **Proje root**: `app-latest.apk` (WhatsApp ile paylaşmak için)
- **Android klasörü**: `android/app/build/outputs/apk/debug/101-104-debug.apk`

## Manuel Build (PowerShell Script)

Alternatif olarak PowerShell script'i kullanabilirsin:

```powershell
.\build-apk.ps1
```

## Güncelleme Süreci

1. Kodda değişiklik yap
2. `npm run build:apk` çalıştır
3. `app-latest.apk` dosyasını WhatsApp'tan gönder
4. Kullanıcılar eski uygulamayı kaldırıp yeni APK'yı yüklesinler

## Version Takibi

APK adı: `101-104-debug.apk` 
- İlk kısım (101-104): Uygulama version code
- Version değiştirmek için: `android/app/build.gradle` dosyasında `versionCode` ve `versionName` değerlerini artır

## Notlar

- Debug APK imzasız olduğu için her yüklemede uygulama yeniden kurulur
- Production APK için keystore oluştur ve signed APK build et
- OTA (Over-The-Air) güncelleme için Capacitor Live Updates kullanabilirsin
