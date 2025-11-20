export const toRad = (d) => (d * Math.PI) / 180;
export const haversineKm = (aLat, aLon, bLat, bLon) => {
    const R = 6371;
    const dLat = toRad(bLat - aLat);
    const dLon = toRad(bLon - aLon);
    const s = Math.sin(dLat/2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon/2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
};