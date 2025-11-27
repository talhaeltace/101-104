# 🧪 Rota Takip Sistemi - Test Modu

## Test Modu Aktif!

Şu anda sistem **test modu**nda çalışıyor. Gerçek GPS yerine simüle edilmiş konum verileri kullanılıyor.

### Test Senaryosu:

1. **Rota Oluştur** butonuna tıklayın
2. Birkaç lokasyon seçin
3. **"🚀 Rota Takibini Başlat"** butonuna tıklayın
4. Ekranın altında tracking overlay görünecek

### Otomatik Test Akışı:

| Zaman | Durum | Ekranda Görünen |
|-------|-------|-----------------|
| **0s** | Uzak (2km) | "Mesafe: 2000m" (gri) |
| **10s** | Yakın (50m) | "Yakınındasınız" (yeşil) + **"Adrese Vardım"** sürükleme butonu |
| **40s** | Tekrar uzak (3km) | "Mesafe: 3000m" (gri) |

### Console Logları:

Tarayıcı console'unda (F12) şu mesajları göreceksiniz:

```
🧪 TEST MODE: GPS simülasyonu başlatılıyor...
📍 Başlangıç pozisyonu (uzak): [41.026, 28.9784]
📏 Mesafe: 2000m | Yakın mı: ❌ HAYIR

// 10 saniye sonra:
✅ 10 saniye sonra yakına geldi (50m): [41.00865, 28.9784]
📏 Mesafe: 50m | Yakın mı: ✅ EVET
🎯 YAKINA GELDİ! "Adrese Vardım" butonu gösterilecek

// 40 saniye sonra:
🚶 40 saniye sonra uzaklaştı (3km): [40.981, 28.9784]
📏 Mesafe: 3000m | Yakın mı: ❌ HAYIR
🚶 Uzaklaştı...
```

### Test Adımları:

1. ✅ **"Adrese Vardım"** butonunu sağa sürükleyin
   - Console: `✅ ADRESE VARDIM onaylandı`
   - Süre tutmaya başlar
   - Overlay'de çalışma süresi gösterilir

2. ✅ **"Tamamlandı"** butonunu sağa sürükleyin
   - Console: `🏁 TAMAMLANDI onaylandı`
   - Console: `⏱️ Çalışma süresi: X dakika`
   - Rotadaki sonraki lokasyona geçer
   - Aktiviteler listesinde kayıt görünür

### Gerçek GPS'e Geçiş:

Test tamamlandığında `src/App.tsx` dosyasında:

```typescript
testMode: true  // 🧪 TEST MODE
```

bunu şu şekilde değiştirin:

```typescript
testMode: false  // 🌍 REAL GPS MODE
```

### Aktiviteler:

Sağ üstteki **Aktiviteler** panelinde şunları göreceksiniz:
- ✅ "Mehmet Yılmaz **X Lokasyonu** lokasyonuna vardı"
- ✅ "Mehmet Yılmaz **X Lokasyonu** lokasyonunu tamamladı (5 dakika)"

### Sorun Giderme:

- **Overlay görünmüyor**: RouteBuilder'da "Rota Takibini Başlat"a tıkladığınızdan emin olun
- **10 saniye sonra yakınlaşmıyor**: Console'u kontrol edin, test timer çalışıyor mu?
- **Sürükleme çalışmıyor**: Mobil cihazda mı test ediyorsunuz? Touch event'leri destekleniyor

### Notlar:

- Test modunda gerçek GPS kullanılmaz
- Her lokasyon için timer resetlenir
- Rota tamamlandığında tracking durur
- Aktiviteler Supabase'e kaydedilir (gerçek veriler)
