// Stubs for ML features
export const predictETA = ({ distanceKm, avgSpeedKmph = 30 }) => {
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) return { etaMinutes: 0 };
    const minutes = Math.round((distanceKm / avgSpeedKmph) * 60);
    return { etaMinutes: Math.max(1, minutes) };
};

export const forecastDemand = ({ lat, lon, hour }) => {
    // Return a dummy demand score 0-100 based on hour
    const h = (Number(hour) + 24) % 24;
    const score = h >= 7 && h <= 10 ? 80 : h >= 17 && h <= 21 ? 90 : 40;
    return { demandScore: score };
};

export const detectAnomaly = ({ amount, distanceKm }) => {
    if (amount <= 0 || distanceKm < 0) return { anomaly: true, reason: 'Invalid values' };
    if (amount / (distanceKm || 1) > 200) return { anomaly: true, reason: 'Excessive price per km' };
    return { anomaly: false };
};




