// Simple singleton registry for Socket.IO and ride request state

let ioInstance = null;

// driverId -> socketId
const driverIdToSocketId = new Map();

// socketId -> driverId
const socketIdToDriverId = new Map();

// userId -> socketId (for notifications)
const userIdToSocketId = new Map();
// socketId -> userId
const socketIdToUserId = new Map();

// requestId -> { passenger_id, source_lat, source_lon, notified_driver_ids: number[], accepted: boolean }
const activeRides = new Map();

export const setIO = (io) => {
  ioInstance = io;
};

export const getIO = () => ioInstance;

export const registerDriverSocket = (driverId, socketId) => {
  driverIdToSocketId.set(driverId, socketId);
  socketIdToDriverId.set(socketId, driverId);
};

export const unregisterSocket = (socketId) => {
  const driverId = socketIdToDriverId.get(socketId);
  if (driverId) {
    driverIdToSocketId.delete(driverId);
  }
  socketIdToDriverId.delete(socketId);

  const userId = socketIdToUserId.get(socketId);
  if (userId) {
    userIdToSocketId.delete(userId);
  }
  socketIdToUserId.delete(socketId);
};

export const getSocketIdForDriver = (driverId) => driverIdToSocketId.get(driverId);

export const registerUserSocket = (userId, socketId) => {
  userIdToSocketId.set(userId, socketId);
  socketIdToUserId.set(socketId, userId);
};

export const getSocketIdForUser = (userId) => userIdToSocketId.get(userId);

export const addActiveRide = (requestId, rideData) => {
  activeRides.set(requestId, { ...rideData, accepted: false });
};

export const getActiveRide = (requestId) => activeRides.get(requestId);

export const markRideAccepted = (requestId) => {
  const r = activeRides.get(requestId);
  if (r) {
    r.accepted = true;
    activeRides.set(requestId, r);
  }
};

export const removeActiveRide = (requestId) => activeRides.delete(requestId);


