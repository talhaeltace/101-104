import React from 'react';
import { MapPin, Clock, XCircle } from 'lucide-react';
import SwipeConfirm from './SwipeConfirm';
import { Location } from '../data/regions';

interface LocationTrackingOverlayProps {
  currentLocation: Location | null;
  distanceToTarget: number | null;
  isNearby: boolean;
  isWorking: boolean;
  workStartTime: Date | null;
  onArrivalConfirm: () => void;
  onCompletionConfirm: () => void;
  onCancelRoute?: () => void;
}

const formatDistance = (meters: number | null): string => {
  if (meters === null) return 'Konum alınıyor…';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(2)}km`;
};

const formatDuration = (startTime: Date | null): string => {
  if (!startTime) return '—';
  const now = new Date();
  const diffMs = now.getTime() - startTime.getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}s ${mins}dk`;
  return `${mins}dk`;
};

const LocationTrackingOverlay: React.FC<LocationTrackingOverlayProps> = ({
  currentLocation,
  distanceToTarget,
  isNearby,
  isWorking,
  workStartTime,
  onArrivalConfirm,
  onCompletionConfirm,
  onCancelRoute
}) => {
  if (!currentLocation) {
    return null;
  }

  const handleCancel = () => {
    if (window.confirm('Rota takibini iptal etmek istediğinizden emin misiniz?')) {
      onCancelRoute?.();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9998,
        padding: '12px 16px',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        backgroundColor: 'rgba(17,24,39,0.95)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxHeight: '35vh',
        overflow: 'hidden'
      }}
    >
      {/* Main info row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: 'rgba(16,185,129,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          <MapPin className="w-5 h-5 text-emerald-400" />
        </div>
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#f3f4f6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentLocation.name}
          </div>
          <div style={{ fontSize: '12px', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isNearby ? '#10b981' : '#6b7280',
                flexShrink: 0
              }}
            />
            {isNearby ? 'Yakınındasınız' : `${formatDistance(distanceToTarget)}`}
          </div>
        </div>

        {isWorking && workStartTime && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: 'rgba(250,204,21,0.15)',
              borderRadius: '12px',
              fontSize: '12px',
              color: '#fbbf24',
              fontWeight: 500,
              flexShrink: 0
            }}
          >
            <Clock className="w-4 h-4" />
            <span>{formatDuration(workStartTime)}</span>
          </div>
        )}
      </div>

      {/* Swipe actions - full width and prominent when available */}
      {isNearby && !isWorking && (
        <div style={{ width: '100%' }}>
          <SwipeConfirm
            text="Kaydırın: Adrese Vardım"
            confirmText="✓"
            backgroundColor="#10b981"
            onConfirm={onArrivalConfirm}
          />
        </div>
      )}

      {isWorking && (
        <div style={{ width: '100%' }}>
          <SwipeConfirm
            text="Kaydırın: Tamamlandı"
            confirmText="✓"
            backgroundColor="#3b82f6"
            onConfirm={onCompletionConfirm}
          />
        </div>
      )}

      {/* Cancel button - subtle and on the side */}
      {onCancelRoute && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4px' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(239,68,68,0.1)',
              color: '#ef4444',
              borderRadius: '8px',
              border: '1px solid rgba(239,68,68,0.3)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.2)';
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)';
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)';
            }}
          >
            <XCircle className="w-4 h-4" />
            Rotayı İptal Et
          </button>
        </div>
      )}
    </div>
  );
};

export default LocationTrackingOverlay;
