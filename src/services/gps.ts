export type GPSFix = {
  lat: number;
  lon: number;
  accuracyM: number | null;
};

export async function captureGPS(): Promise<GPSFix> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("No geolocation available on this device/browser."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      (err) => reject(new Error(err.message || "GPS capture failed")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
