// Notification permission helper
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!('Notification' in window)) {
    console.warn('⚠️ Bu tarayıcı bildirim desteklemiyor');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
};

// Send notification
export const sendNotification = (title: string, options?: NotificationOptions): void => {
  if (!('Notification' in window)) {
    console.warn('⚠️ Bildirim desteklenmiyor');
    return;
  }

  if (Notification.permission !== 'granted') {
    console.warn('⚠️ Bildirim izni yok');
    return;
  }

  try {
    const notification = new Notification(title, {
      icon: '/icon.png',
      badge: '/icon.png',
      requireInteraction: true,
      ...options
    });

    // Auto close after 10 seconds
    setTimeout(() => {
      notification.close();
    }, 10000);

    console.log('🔔 Bildirim gönderildi:', title);
  } catch (error) {
    console.error('❌ Bildirim hatası:', error);
  }
};

// Location-specific notifications
export const notifyNearLocation = (locationName: string): void => {
  sendNotification('📍 Rota Uyarısı: 100m Kaldı', {
    body: `Seçili rota kapsamında ${locationName} lokasyonuna yaklaşık 100m kaldı. Saha personeli adrese geldiğinde "Adrese Vardım" kaydırma alanını kullanarak varışını işaretleyebilir.`,
    tag: 'location-near'
  });
};

export const notifyArrival = (locationName: string): void => {
  sendNotification('✅ Varış Kaydedildi', {
    body: `Saha personeli ${locationName} lokasyonuna varışını "Adrese Vardım" olarak kaydetti. Bu nokta için çalışma süresi sayacı başlatıldı.`,
    tag: 'arrival'
  });
};

export const notifyCompletion = (locationName: string, duration: number): void => {
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  const timeStr = hours > 0 ? `${hours}s ${mins}dk` : `${mins}dk`;
  
  sendNotification('🏁 İş Tamamlandı', {
    body: `Saha personeli ${locationName} lokasyonundaki çalışmasını "Tamamlandı" olarak işaretledi. Bu adres için geçen toplam süre: ${timeStr}.`,
    tag: 'completion'
  });
};

export const notifyNextLocation = (locationName: string, index: number, total: number): void => {
  sendNotification('➡️ Sonraki Lokasyon', {
    body: `Rota üzerindeki sıradaki adres: ${locationName}. Genel rota sırası: ${index}/${total}.`,
    tag: 'next-location'
  });
};

export const notifyRouteCompleted = (): void => {
  sendNotification('🎉 Rota Tamamlandı!', {
    body: 'Tüm lokasyonlar tamamlandı. Harika iş!',
    tag: 'route-complete'
  });
};

export const notifyRouteStarted = (username: string | null, totalLocations: number): void => {
  const userPart = username ? `Saha personeli ${username}` : 'Bir saha personeli';
  const countPart = totalLocations > 0 ? `${totalLocations} lokasyonluk` : 'bir';
  sendNotification('🗺️ Rota Başlatıldı', {
    body: `${userPart} yeni bir ${countPart} rota başlattı. İlk adrese ilerliyor.`,
    tag: 'route-started'
  });
};
