// Simple route deviation detector: distance from current point to start->end line > threshold
export const isDeviatingFromRoute = (start, end, current, thresholdMeters = 200) => {
    if (!start || !end || !current) return false;
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371000;
    const lat1 = toRad(start.lat), lon1 = toRad(start.lon);
    const lat2 = toRad(end.lat), lon2 = toRad(end.lon);
    const lat3 = toRad(current.lat), lon3 = toRad(current.lon);
    // Approximate cross-track distance
    const d13 = 2 * Math.asin(Math.sqrt(Math.sin((lat3-lat1)/2)**2 + Math.cos(lat1)*Math.cos(lat3)*Math.sin((lon3-lon1)/2)**2));
    const theta13 = Math.atan2(Math.sin(lon3-lon1)*Math.cos(lat3), Math.cos(lat1)*Math.sin(lat3)-Math.sin(lat1)*Math.cos(lat3)*Math.cos(lon3-lon1));
    const theta12 = Math.atan2(Math.sin(lon2-lon1)*Math.cos(lat2), Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(lon2-lon1));
    const xt = Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12));
    const dist = Math.abs(xt) * R;
    return dist > thresholdMeters;
};




