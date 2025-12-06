import { useState, useEffect } from 'react';
import { Location } from '../data/regions';
import { notifyNearLocation } from '../lib/notifications';

// Haversine distance in meters
const haversine = (a: [number, number], b: [number, number]) => {
  const toRad = (v: number) => v * Math.PI / 180;
  const R = 6371000; // meters
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const A = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const C = 2 * Math.atan2(Math.sqrt(A), Math.sqrt(1 - A));
  return R * C;
};

export interface LocationTrackingState {
  currentLocation: Location | null;
  distanceToTarget: number | null;
  isNearby: boolean; // within 100m
  arrivalTime: Date | null;
  isWorking: boolean; // user confirmed arrival
  workStartTime: Date | null;
}

interface UseLocationTrackingOptions {
  targetLocation: Location | null;
  proximityThreshold?: number; // meters, default 100
  userPosition: [number, number] | null; // Receive position from parent instead of watching internally
  testMode?: boolean; // Simulate GPS movement for testing
  initialWorkState?: { isWorking: boolean; workStartTime: Date | null }; // Restore work state from localStorage
}

export const useLocationTracking = ({
  targetLocation,
  proximityThreshold = 100,
  userPosition,
  testMode = false,
  initialWorkState
}: UseLocationTrackingOptions) => {
  const [trackingState, setTrackingState] = useState<LocationTrackingState>({
    currentLocation: null,
    distanceToTarget: null,
    isNearby: false,
    arrivalTime: null,
    isWorking: initialWorkState?.isWorking || false,
    workStartTime: initialWorkState?.workStartTime || null
  });

  // Update tracking state when initialWorkState changes (e.g., restored from database)
  useEffect(() => {
    if (initialWorkState) {
      setTrackingState(prev => ({
        ...prev,
        isWorking: initialWorkState.isWorking,
        workStartTime: initialWorkState.workStartTime
      }));
    }
  }, [initialWorkState]);

  // GPS watching removed - position is now received from parent component
  // This prevents constant re-renders caused by continuous geolocation updates

  // Test mode: Override userPosition with simulated movement
  const [testPosition, setTestPosition] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (!testMode || !targetLocation) {
      setTestPosition(null);
      return;
    }

    // Start at 300m away
    const offset300m = 0.0027; // ~300m
    const farPosition: [number, number] = [
      targetLocation.coordinates[0] + offset300m,
      targetLocation.coordinates[1]
    ];
    setTestPosition(farPosition);

    // After 10 seconds, move to 50m (nearby)
    const timer1 = setTimeout(() => {
      const offset50m = 0.00045; // ~50m
      const nearPosition: [number, number] = [
        targetLocation.coordinates[0] + offset50m,
        targetLocation.coordinates[1]
      ];
      setTestPosition(nearPosition);
    }, 10000);

    // After 40 seconds total, move far away (2km)
    const timer2 = setTimeout(() => {
      const offset2km = 0.018; // ~2km
      const farAgainPosition: [number, number] = [
        targetLocation.coordinates[0] - offset2km,
        targetLocation.coordinates[1]
      ];
      setTestPosition(farAgainPosition);
    }, 40000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [testMode, targetLocation]);

  // Use test position if test mode is active, otherwise use real position
  const activePosition = testMode && testPosition ? testPosition : userPosition;

  // Calculate distance and update tracking state
  useEffect(() => {
    if (!activePosition || !targetLocation) {
      return;
    }

    const distance = haversine(activePosition, targetLocation.coordinates);
    const isNearby = distance <= proximityThreshold;

    setTrackingState(prev => {
      const newState = { ...prev };
      newState.distanceToTarget = distance;
      newState.currentLocation = targetLocation;

      // Auto-detect arrival if we weren't nearby before and now we are
      if (!prev.isNearby && isNearby && !prev.arrivalTime) {
        newState.isNearby = true;
        newState.arrivalTime = new Date();
        // Send notification
        notifyNearLocation(targetLocation.name);
      } else if (prev.isNearby !== isNearby) {
        newState.isNearby = isNearby;
      }

      return newState;
    });
  }, [activePosition, targetLocation, proximityThreshold]);

  // Manual confirmation handlers
  const confirmArrival = () => {
    setTrackingState(prev => ({
      ...prev,
      isWorking: true,
      workStartTime: new Date()
    }));
  };

  const completeWork = (): { duration: number; startTime: Date } | null => {
    if (!trackingState.workStartTime) return null;

    const endTime = new Date();
    const durationMs = endTime.getTime() - trackingState.workStartTime.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    // Reset tracking state
    setTrackingState({
      currentLocation: null,
      distanceToTarget: null,
      isNearby: false,
      arrivalTime: null,
      isWorking: false,
      workStartTime: null
    });

    return {
      duration: durationMinutes,
      startTime: trackingState.workStartTime
    };
  };

  const resetTracking = () => {
    setTrackingState({
      currentLocation: null,
      distanceToTarget: null,
      isNearby: false,
      arrivalTime: null,
      isWorking: false,
      workStartTime: null
    });
  };

  return {
    trackingState,
    confirmArrival,
    completeWork,
    resetTracking
  };
};
