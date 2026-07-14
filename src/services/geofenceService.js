/**
 * Geofencing Validation Service
 * 
 * Validates if an attendance punch occurred within authorized
 * geographic boundaries (geofence zones).
 * 
 * For ZKTeco devices, geofencing applies when:
 * 1. The device is stationary (fixed outlet) - we know its location
 * 2. Mobile check-in via companion app sends GPS coordinates
 * 3. We want to verify attendance was taken at the correct outlet
 */

// Earth's radius in meters
const EARTH_RADIUS = 6371000;

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lng1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lng2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

class GeofenceService {
  /**
   * Validate if a coordinate is within a device's geofence
   * @param {Object} device - ZkTecoDevice instance with geofence config
   * @param {Object} options
   * @param {number} options.latitude - Punch latitude
   * @param {number} options.longitude - Punch longitude
   * @returns {Object} Validation result
   */
  validatePunch(device, { latitude, longitude }) {
    // If geofencing is not enabled, always pass
    if (!device.geofenceEnabled) {
      return {
        withinGeofence: true,
        distance: null,
        geofenceRadius: null,
        validated: true,
        message: 'Geofencing not enabled - punch accepted',
      };
    }

    // If device has no geofence coordinates or no punch coordinates
    if (!latitude || !longitude || !device.geofenceLatitude || !device.geofenceLongitude) {
      return {
        withinGeofence: false,
        distance: null,
        geofenceRadius: device.geofenceRadius || 100,
        validated: false,
        message: 'Missing location data for geofence validation',
      };
    }

    const deviceLat = parseFloat(device.geofenceLatitude);
    const deviceLng = parseFloat(device.geofenceLongitude);
    const radius = device.geofenceRadius || 100;

    // Calculate distance
    const distance = haversineDistance(
      latitude, longitude,
      deviceLat, deviceLng
    );

    const withinGeofence = distance <= radius;

    return {
      withinGeofence,
      distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
      geofenceRadius: radius,
      validated: withinGeofence,
      message: withinGeofence
        ? `Within geofence (${Math.round(distance)}m / ${radius}m)`
        : `Outside geofence (${Math.round(distance)}m, max ${radius}m)`,
    };
  }

  /**
   * Get geofence status for multiple devices at a coordinate
   * @param {Array<Object>} devices - Array of ZkTecoDevice instances
   * @param {Object} coordinates - { latitude, longitude }
   * @returns {Array<Object>} Per-device geofence results
   */
  validateForAllDevices(devices, { latitude, longitude }) {
    return devices
      .filter((device) => device.isActive)
      .map((device) => ({
        deviceId: device.id,
        deviceName: device.name,
        outletName: device.outletName,
        location: device.location,
        geofenceEnabled: device.geofenceEnabled,
        ...this.validatePunch(device, { latitude, longitude }),
      }));
  }

  /**
   * Calculate geographic midpoint of multiple devices (useful for
   * determining if a user is near any of their assigned outlets)
   * @param {Array<Object>} geofences - Array of { latitude, longitude, radius }
   * @returns {Object|null} Midpoint { latitude, longitude }
   */
  calculateMidpoint(geofences) {
    if (!geofences || geofences.length === 0) return null;

    let latSum = 0;
    let lngSum = 0;
    let count = 0;

    for (const gf of geofences) {
      if (gf.latitude && gf.longitude) {
        latSum += parseFloat(gf.latitude);
        lngSum += parseFloat(gf.longitude);
        count++;
      }
    }

    if (count === 0) return null;

    return {
      latitude: latSum / count,
      longitude: lngSum / count,
    };
  }

  /**
   * Format geofence data for frontend display
   * @param {Object} device - ZkTecoDevice instance
   * @returns {Object} Formatted geofence data
   */
  getGeofenceDisplay(device) {
    if (!device.geofenceEnabled) {
      return {
        enabled: false,
        status: 'Disabled',
        statusClass: 'inactive',
      };
    }

    if (!device.geofenceLatitude || !device.geofenceLongitude) {
      return {
        enabled: true,
        status: 'Not configured',
        statusClass: 'warning',
        latitude: null,
        longitude: null,
        radius: device.geofenceRadius || 100,
      };
    }

    return {
      enabled: true,
      status: 'Active',
      statusClass: 'active',
      latitude: parseFloat(device.geofenceLatitude),
      longitude: parseFloat(device.geofenceLongitude),
      radius: device.geofenceRadius || 100,
      googleMapsUrl: `https://www.google.com/maps?q=${device.geofenceLatitude},${device.geofenceLongitude}`,
    };
  }
}

module.exports = new GeofenceService();