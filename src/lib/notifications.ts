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
  sendNotification('📍 Lokasyona Yaklaştınız!', {
    body: `${locationName} lokasyonuna 100m içinde yaklaştınız. "Adrese Vardım" butonunu kullanabilirsiniz.`,
    tag: 'location-near'
  });
};

export const notifyArrival = (locationName: string): void => {
  sendNotification('✅ Varış Kaydedildi', {
    body: `${locationName} lokasyonuna varışınız kaydedildi. Süre tutmaya başlandı.`,
    tag: 'arrival'
  });
};

export const notifyCompletion = (locationName: string, duration: number): void => {
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  const timeStr = hours > 0 ? `${hours}s ${mins}dk` : `${mins}dk`;
  
  sendNotification('🏁 İş Tamamlandı', {
    body: `${locationName} tamamlandı. Geçen süre: ${timeStr}`,
    tag: 'completion'
  });
};

export const notifyNextLocation = (locationName: string, index: number, total: number): void => {
  sendNotification('➡️ Sonraki Lokasyon', {
    body: `Şimdi ${locationName} lokasyonuna gidebilirsiniz (${index}/${total})`,
    tag: 'next-location'
  });
};

export const notifyRouteCompleted = (): void => {
  sendNotification('🎉 Rota Tamamlandı!', {
    body: 'Tüm lokasyonlar tamamlandı. Harika iş!',
    tag: 'route-complete'
  });
};
