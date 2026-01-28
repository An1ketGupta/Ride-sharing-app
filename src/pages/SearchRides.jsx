import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { rideService } from '../services/rideService';
import { bookingService } from '../services/bookingService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MapPin, Calendar, Car, Star, Heart, X, ChevronDown, ChevronUp,
  Clock, CheckCircle, Filter, Users, Navigation, CreditCard, ArrowRight
} from 'lucide-react';

const SearchRides = () => {
  const [vehicles, setVehicles] = useState([]);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [availableNow, setAvailableNow] = useState(false);
  const [priceRange, setPriceRange] = useState([0, 500]);
  const [favorites, setFavorites] = useState(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [seatsRequired, setSeatsRequired] = useState(1);
  const [sortBy, setSortBy] = useState('closest');

  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  // Parse optional search params from navigation state or query string
  const searchState = location.state || {};

  useEffect(() => {
    const fetchRides = async () => {
      try {
        setLoading(true);
        setError('');

        const params = {
          source: searchState.source || undefined,
          destination: searchState.destination || undefined,
          date: searchState.date || undefined,
        };

        const response = await rideService.searchRides(params);
        const rides = Array.isArray(response?.data) ? response.data : response;

        const mapped = (rides || []).map((ride) => ({
          id: ride.ride_id || ride.id,
          brand: ride.vehicle_model || 'Ride',
          model: ride.vehicle_color ? `(${ride.vehicle_color})` : '',
          variant: `${ride.source || ''} → ${ride.destination || ''}`.trim(),
          source: ride.source || '',
          destination: ride.destination || '',
          price: Number(ride.estimated_fare || ride.fare_per_km || 0),
          rating: ride.driver_rating ? Number(ride.driver_rating) : 4.5,
          reviews: 0,
          status: (ride.status === 'scheduled' || ride.status === 'active' || ride.status === 'pending' || !ride.status) && (ride.available_seats > 0 || ride.available_seats === undefined) ? 'available' : 'booked',
          bookedTime: ride.time || '',
          distance: ride.distance_km != null ? `${ride.distance_km} km` : '',
          time: ride.time || '',
          date: ride.date || '',
          seats: ride.available_seats || ride.total_seats || 1,
          driverName: ride.driver_name || 'Driver',
          images: ride.vehicle_image_url
            ? [ride.vehicle_image_url]
            : ['https://via.placeholder.com/128x96?text=Ride'],
          location: ride.source || '',
        }));

        setVehicles(mapped);
        setFilteredVehicles(mapped);
      } catch (err) {
        console.error('Failed to load rides', err);
        setError('Failed to load rides. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchRides();
  }, [location.state]);

  useEffect(() => {
    // Apply filters
    let filtered = [...vehicles];

    // Search query
    if (searchQuery) {
      filtered = filtered.filter(v =>
        `${v.brand} ${v.model} ${v.variant} ${v.driverName}`.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Available now
    if (availableNow) {
      filtered = filtered.filter(v => v.status === 'available');
    }

    // Price range
    filtered = filtered.filter(v => v.price >= priceRange[0] && v.price <= priceRange[1]);

    // Sort
    if (sortBy === 'closest') {
      filtered.sort((a, b) => {
        const aDist = parseFloat(a.distance) || 0;
        const bDist = parseFloat(b.distance) || 0;
        return aDist - bDist;
      });
    } else if (sortBy === 'price-low') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-high') {
      filtered.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'rating') {
      filtered.sort((a, b) => b.rating - a.rating);
    }

    setFilteredVehicles(filtered);
  }, [vehicles, searchQuery, availableNow, priceRange, sortBy]);

  const toggleFavorite = (id) => {
    setFavorites(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectVehicle = (vehicle) => {
    setSelectedVehicle(vehicle);
  };

  const handleBookRide = async (vehicle) => {
    if (!user) {
      navigate('/login');
      return;
    }

    try {
      const response = await bookingService.createBooking({
        ride_id: vehicle.id,
        seats_booked: seatsRequired,
        notes: ''
      });

      if (response.success || response.data) {
        toast.success('Ride booked successfully!');
        navigate('/passenger/dashboard');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to book ride');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 sm:px-8 md:px-10 py-8 sm:py-10 md:py-12 max-w-7xl mx-auto page-transition">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mb-8 sm:mb-10 md:mb-12"
      >
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-3 text-gray-900">Search Rides</h1>
        <p className="text-gray-900/60 text-lg sm:text-xl">Find and book available rides near you</p>
      </motion.div>

      {/* Search and Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="bg-white rounded-lg p-4 sm:p-6 border border-gray-200 mb-6 sm:mb-8"
      >
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by route, driver name, or vehicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all"
            />
          </div>

          {/* Sort Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all min-w-[180px]"
          >
            <option value="closest">Sort: Closest</option>
            <option value="price-low">Sort: Price Low to High</option>
            <option value="price-high">Sort: Price High to Low</option>
            <option value="rating">Sort: Highest Rated</option>
          </select>

          {/* Filter Toggle Button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowFilters(!showFilters)}
            className={`px-6 py-3 rounded-lg font-semibold transition-all duration-200 flex items-center gap-2 ${showFilters
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
          >
            <Filter className="w-5 h-5" />
            Filters
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </motion.button>
        </div>

        {/* Expandable Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-6 mt-6 border-t border-gray-200">
                {/* Available Now Toggle */}
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="text-sm font-semibold text-gray-700">Available Now Only</label>
                  <button
                    onClick={() => setAvailableNow(!availableNow)}
                    className={`w-12 h-6 rounded-full transition-colors ${availableNow ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${availableNow ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                  </button>
                </div>

                {/* Seats Required */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">Seats Required</label>
                  <select
                    value={seatsRequired}
                    onChange={(e) => setSeatsRequired(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  >
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={n}>{n} seat{n > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>

                {/* Price Range */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 col-span-1 sm:col-span-2">
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">
                    Price Range: ₹{priceRange[0]} - ₹{priceRange[1]}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="10"
                    value={priceRange[1]}
                    onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                    className="w-full accent-blue-600"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Results Count */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.25 }}
        className="flex items-center justify-between mb-6"
      >
        <p className="text-gray-600">
          <span className="font-bold text-gray-900">{filteredVehicles.length}</span> rides found
        </p>
      </motion.div>

      {/* Ride Listings */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-gray-600">Loading rides...</p>
            </div>
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
            <X className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        ) : filteredVehicles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-lg p-12 text-center border border-gray-200"
          >
            <Car className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2 text-gray-900">No rides found</h3>
            <p className="text-gray-600">
              Try adjusting your filters or <a href="/request" className="text-blue-600 hover:underline font-semibold">request a ride</a>
            </p>
          </motion.div>
        ) : (
          filteredVehicles.map((vehicle, index) => (
            <motion.div
              key={vehicle.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.25 }}
              whileHover={{ y: -2 }}
              onClick={() => handleSelectVehicle(vehicle)}
              className={`bg-white rounded-lg p-4 sm:p-6 border-2 cursor-pointer transition-all duration-200 ${selectedVehicle?.id === vehicle.id
                ? 'border-blue-600 bg-blue-50/50'
                : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
            >
              <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                {/* Vehicle Image */}
                <div className="flex-shrink-0">
                  <img
                    src={vehicle.images[0]}
                    alt={`${vehicle.brand} ${vehicle.model}`}
                    className="w-full lg:w-40 h-32 object-cover rounded-lg"
                    onError={(e) => {
                      e.target.src = 'https://via.placeholder.com/160x128?text=No+Image';
                    }}
                  />
                </div>

                {/* Ride Info */}
                <div className="flex-1 space-y-3">
                  {/* Header Row */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                        <span className="text-sm font-semibold text-gray-900">{vehicle.rating.toFixed(1)}</span>
                        {vehicle.status === 'available' ? (
                          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                            Available
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded-full font-medium">
                            Booked
                          </span>
                        )}
                      </div>
                      <h3 className="font-bold text-lg text-gray-900">{vehicle.brand} {vehicle.model}</h3>
                      <p className="text-sm text-gray-600">Driver: {vehicle.driverName}</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(vehicle.id);
                      }}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Heart
                        className={`w-5 h-5 ${favorites.has(vehicle.id)
                          ? 'fill-red-500 text-red-500'
                          : 'text-gray-400'
                          }`}
                      />
                    </button>
                  </div>

                  {/* Route */}
                  <div className="flex items-center gap-2 text-gray-700">
                    <MapPin className="w-4 h-4 text-blue-600" />
                    <span className="font-medium">{vehicle.source}</span>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{vehicle.destination}</span>
                  </div>

                  {/* Details */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                    {vehicle.date && (
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>{new Date(vehicle.date).toLocaleDateString()}</span>
                      </div>
                    )}
                    {vehicle.time && (
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span>{vehicle.time}</span>
                      </div>
                    )}
                    {vehicle.distance && (
                      <div className="flex items-center gap-1">
                        <Navigation className="w-4 h-4 text-gray-400" />
                        <span>{vehicle.distance}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{vehicle.seats} seats</span>
                    </div>
                  </div>
                </div>

                {/* Price and Book */}
                <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3">
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">₹{vehicle.price.toFixed(0)}</div>
                    <div className="text-sm text-gray-500">per seat</div>
                  </div>
                  {vehicle.status === 'available' && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleBookRide(vehicle);
                      }}
                      className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
                    >
                      <CreditCard className="w-4 h-4" />
                      Book Now
                    </motion.button>
                  )}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Selected Ride Modal */}
      <AnimatePresence>
        {selectedVehicle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6"
            onClick={() => setSelectedVehicle(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-lg p-6 sm:p-8 max-w-lg w-full border border-gray-200 shadow-xl max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{selectedVehicle.brand} {selectedVehicle.model}</h3>
                  <p className="text-gray-600">Driver: {selectedVehicle.driverName}</p>
                </div>
                <button
                  onClick={() => setSelectedVehicle(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Image */}
              <div className="mb-6 overflow-hidden rounded-lg">
                <img
                  src={selectedVehicle.images[0]}
                  alt={`${selectedVehicle.brand} ${selectedVehicle.model}`}
                  className="w-full h-48 object-cover"
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/512x256?text=No+Image';
                  }}
                />
              </div>

              {/* Route */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-6">
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-blue-600" />
                  <div className="flex-1">
                    <div className="font-semibold text-gray-900">{selectedVehicle.source}</div>
                    <div className="text-sm text-gray-600">Pickup</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400" />
                  <div className="flex-1 text-right">
                    <div className="font-semibold text-gray-900">{selectedVehicle.destination}</div>
                    <div className="text-sm text-gray-600">Drop-off</div>
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Date</div>
                  <div className="font-semibold text-gray-900">
                    {selectedVehicle.date ? new Date(selectedVehicle.date).toLocaleDateString() : 'N/A'}
                  </div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Time</div>
                  <div className="font-semibold text-gray-900">{selectedVehicle.time || 'N/A'}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Distance</div>
                  <div className="font-semibold text-gray-900">{selectedVehicle.distance || 'N/A'}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600">Available Seats</div>
                  <div className="font-semibold text-gray-900">{selectedVehicle.seats}</div>
                </div>
              </div>

              {/* Seats Selector */}
              <div className="mb-6">
                <label className="text-sm font-semibold text-gray-700 mb-2 block">Seats to Book</label>
                <select
                  value={seatsRequired}
                  onChange={(e) => setSeatsRequired(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                >
                  {Array.from({ length: selectedVehicle.seats }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n} seat{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Price */}
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-100 mb-6">
                <span className="text-lg font-semibold text-gray-900">Total Price</span>
                <span className="text-2xl font-bold text-green-600">
                  ₹{(selectedVehicle.price * seatsRequired).toFixed(0)}
                </span>
              </div>

              {/* Book Button */}
              {selectedVehicle.status === 'available' ? (
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => handleBookRide(selectedVehicle)}
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md"
                >
                  <CheckCircle className="w-5 h-5" />
                  Confirm Booking
                </motion.button>
              ) : (
                <div className="w-full py-4 bg-gray-100 text-gray-500 font-semibold rounded-lg text-center">
                  This ride is not available
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SearchRides;
