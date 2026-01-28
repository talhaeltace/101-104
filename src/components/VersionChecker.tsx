import { useEffect, useState } from 'react';
import { X, Download, AlertCircle, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { apiFetch } from '../lib/apiClient';

// Current app version - UPDATE THIS WHEN YOU RELEASE NEW VERSION
// Android: versionName 2.1.11 (versionCode 30)
// iOS: MARKETING_VERSION 2.1.11 (build 40)
const CURRENT_VERSION_NAME = '2.1.15';
const CURRENT_ANDROID_VERSION_CODE = 34;
const CURRENT_IOS_BUILD = 44;

// Default store URLs (fallback when server row has no store_url yet)
const DEFAULT_ANDROID_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.cartiva.app&hl=tr';
const DEFAULT_IOS_STORE_URL =
  'https://apps.apple.com/tr/app/mapflow/id6755817368?l=tr';

interface AppVersion {
  version_code: number;
  version_name: string;
  platform?: 'android' | 'ios' | 'web' | string;
  store_url?: string | null;
  apk_url?: string | null;
  release_notes: string | null;
  is_mandatory: boolean;
}

export const VersionChecker = () => {
  const [showUpdate, setShowUpdate] = useState(false);
  const [newVersion, setNewVersion] = useState<AppVersion | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const platform = Capacitor.getPlatform();

  useEffect(() => {
    let cancelled = false;

    const checkForUpdates = async () => {
      try {
        const currentCode =
          platform === 'ios'
            ? CURRENT_IOS_BUILD
            : platform === 'android'
              ? CURRENT_ANDROID_VERSION_CODE
              : CURRENT_ANDROID_VERSION_CODE;

        const qs = new URLSearchParams({ platform });
        const res = await apiFetch<{ data?: AppVersion | null }>(`/app-version/latest?${qs.toString()}`);
        const data = res?.data ?? null;

        if (!cancelled && data && data.version_code > currentCode) {
          setNewVersion(data);
          setShowUpdate(true);
        }
      } catch (e) {
        console.error('Version check error:', e);
      }
    };

    checkForUpdates();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  const openExternal = (url: string) => {
    try {
      // On Capacitor this generally opens the system browser.
      window.open(url, '_blank');
    } catch {
      // ignore
    }
  };

  const handleDownload = async () => {
    if (!newVersion) return;

    const fallbackStoreUrl =
      platform === 'ios'
        ? DEFAULT_IOS_STORE_URL
        : platform === 'android'
          ? DEFAULT_ANDROID_STORE_URL
          : null;

    // Preferred: store-based update.
    if (newVersion.store_url || fallbackStoreUrl) {
      openExternal(newVersion.store_url || fallbackStoreUrl!);
      return;
    }

    // iOS: no APK fallback.
    if (platform === 'ios') {
      alert('Bu sürüm için App Store bağlantısı tanımlı değil.');
      return;
    }

    // Android fallback: direct APK download (legacy behavior).
    if (!newVersion.apk_url) {
      alert('Güncelleme bağlantısı bulunamadı.');
      return;
    }

    const isNative = platform !== 'web';

    if (!isNative) {
      openExternal(newVersion.apk_url);
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      // Download APK file
      const response = await fetch(newVersion.apk_url);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const reader = new FileReader();

      reader.onloadend = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];   
          
          // Save to Downloads folder
          const fileName = `app-update-v${newVersion.version_name}.apk`;
          const result = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true
          });

          setDownloadProgress(100);
          
          // Show success message and instructions
          alert(
            `✅ APK İndirildi!\n\n` +
            `Konum: ${result.uri}\n\n` +
            `Kurulum için:\n` +
            `1. Dosya yöneticisini aç\n` +
            `2. Downloads klasörüne git\n` +
            `3. "${fileName}" dosyasını aç\n` +
            `4. Yükle'ye bas`
          );
          
          // Try to open the file (may not work on all Android versions)
          try {
            const uri = result.uri;
            if (uri) {
              // Attempt to open with file viewer
              window.open(uri, '_system');
            }
          } catch (e) {
            console.log('Auto-open not supported:', e);
          }
          
        } catch (error) {
          console.error('Save failed:', error);
          alert('❌ Kaydetme başarısız. Tarayıcıdan indirin: ' + newVersion.apk_url);
          if (newVersion.apk_url) openExternal(newVersion.apk_url);
        } finally {
          setIsDownloading(false);
        }
      };

      reader.onerror = () => {
        alert('❌ Okuma hatası. Tarayıcıdan indirin.');
        if (newVersion.apk_url) openExternal(newVersion.apk_url);
        setIsDownloading(false);
      };

      // Update progress during read
      let loaded = 0;
      const total = blob.size;
      reader.onprogress = (e) => {
        if (e.lengthComputable) {
          loaded = e.loaded;
          setDownloadProgress(Math.round((loaded / total) * 100));
        }
      };

      reader.readAsDataURL(blob);

    } catch (error) {
      console.error('Download error:', error);
      alert('❌ İndirme başarısız. Tarayıcıdan deneyin.');
      if (newVersion.apk_url) openExternal(newVersion.apk_url);
      setIsDownloading(false);
    }
  };

  const handleDismiss = () => {
    if (newVersion?.is_mandatory) {
      // Mandatory update - cannot dismiss
      return;
    }
    setShowUpdate(false);
  };

  if (!showUpdate || !newVersion) return null;

  const updateButtonLabel =
    platform === 'ios'
      ? 'App Store\'da Güncelle'
      : platform === 'android'
        ? 'Google Play\'de Güncelle'
        : 'Güncellemeyi Aç';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          backgroundColor: '#1f2937',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '400px',
          width: '100%',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(59, 130, 246, 0.3)'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {newVersion.is_mandatory ? (
              <AlertCircle className="w-6 h-6 text-red-400" />
            ) : (
              <Download className="w-6 h-6 text-blue-400" />
            )}
            <h3 style={{ fontSize: '20px', fontWeight: '600', color: '#f3f4f6', margin: 0 }}>
              {newVersion.is_mandatory ? 'Zorunlu Güncelleme' : 'Yeni Versiyon Mevcut'}
            </h3>
          </div>
          {!newVersion.is_mandatory && (
            <button
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: '#9ca3af'
              }}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Current vs New Version */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#9ca3af', fontSize: '14px' }}>Mevcut Versiyon:</span>
            <span style={{ color: '#f3f4f6', fontSize: '14px', fontWeight: '500' }}>{CURRENT_VERSION_NAME}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#9ca3af', fontSize: '14px' }}>Yeni Versiyon:</span>
            <span style={{ color: '#10b981', fontSize: '14px', fontWeight: '600' }}>{newVersion.version_name}</span>
          </div>
        </div>

        {/* Release Notes */}
        {newVersion.release_notes && (
          <div
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              border: '1px solid rgba(59, 130, 246, 0.2)'
            }}
          >
            <h4 style={{ color: '#93c5fd', fontSize: '14px', fontWeight: '600', marginTop: 0, marginBottom: '8px' }}>
              Yenilikler:
            </h4>
            <p style={{ color: '#d1d5db', fontSize: '13px', lineHeight: '1.5', margin: 0, whiteSpace: 'pre-line' }}>
              {newVersion.release_notes}
            </p>
          </div>
        )}

        {/* Warning for mandatory updates */}
        {newVersion.is_mandatory && (
          <div
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '16px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px'
            }}
          >
            <AlertCircle className="w-4 h-4 text-red-400" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ color: '#fca5a5', fontSize: '13px', margin: 0, lineHeight: '1.5' }}>
              Bu güncelleme zorunludur. Uygulamayı kullanmaya devam etmek için güncelleyin.
            </p>
          </div>
        )}

        {/* Download Button */}
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: isDownloading ? '#6b7280' : (newVersion.is_mandatory ? '#dc2626' : '#3b82f6'),
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: isDownloading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
            opacity: isDownloading ? 0.8 : 1
          }}
          onMouseOver={(e) => {
            if (!isDownloading) {
              e.currentTarget.style.backgroundColor = newVersion.is_mandatory ? '#b91c1c' : '#2563eb';
            }
          }}
          onMouseOut={(e) => {
            if (!isDownloading) {
              e.currentTarget.style.backgroundColor = newVersion.is_mandatory ? '#dc2626' : '#3b82f6';
            }
          }}
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              İndiriliyor... {downloadProgress}%
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              {updateButtonLabel}
            </>
          )}
        </button>

        {!newVersion.is_mandatory && (
          <button
            onClick={handleDismiss}
            style={{
              width: '100%',
              marginTop: '8px',
              padding: '10px',
              backgroundColor: 'transparent',
              color: '#9ca3af',
              border: '1px solid #374151',
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.borderColor = '#4b5563';
              e.currentTarget.style.color = '#d1d5db';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.borderColor = '#374151';
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            Daha Sonra
          </button>
        )}
      </div>
    </div>
  );
};
