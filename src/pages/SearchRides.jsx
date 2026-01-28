import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { rideService } from '../services/rideService';
import { bookingService } from '../services/bookingService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { 
  Search, MapPin, Calendar, Car, Star, Heart, X, ChevronLeft, ChevronRight,
  Home, Car as CarIcon, Calendar as CalendarIcon, Heart as HeartIcon, 
  RefreshCw, User, HelpCircle, Settings, Clock, CheckCircle
} from 'lucide-react';

const SearchRides = () => {
  const [vehicles, setVehicles] = useState([]);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [rentalType, setRentalType] = useState('per-hour'); // 'any', 'per-day', 'per-hour'
  const [availableNow, setAvailableNow] = useState(false);
  const [priceRange, setPriceRange] = useState([22, 98.5]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [bodyStyles, setBodyStyles] = useState(['Hatchback', 'Crossover']);
  const [transmission, setTransmission] = useState('manual');
  const [fuelTypes, setFuelTypes] = useState(['Diesel']);
  const [favorites, setFavorites] = useState(new Set());
  // Initialize with today's date and default times
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const [pickupDate, setPickupDate] = useState(getTodayDate());
  const [pickupTime, setPickupTime] = useState('14:00');
  const [dropoffDate, setDropoffDate] = useState(getTodayDate());
  const [dropoffTime, setDropoffTime] = useState('17:00');
  const [selectedInsurance, setSelectedInsurance] = useState('vehicle-protection');
  const [extraTime, setExtraTime] = useState(false);
  const [activeTab, setActiveTab] = useState('rent-details');
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
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
          price: Number(ride.estimated_fare || ride.fare_per_km || 0),
          rating: ride.driver_rating ? Number(ride.driver_rating) : 4.5,
          reviews: 0,
          status: ride.status === 'scheduled' && ride.available_seats > 0 ? 'available' : 'booked',
          bookedTime: ride.time || '',
          distance: ride.distance_km != null ? `${ride.distance_km} km` : '',
          time: ride.time || '',
          bodyStyle: 'Ride sharing',
          transmission: 'N/A',
          fuel: 'N/A',
          seats: ride.available_seats || ride.total_seats || 1,
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
        `${v.brand} ${v.model} ${v.variant}`.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Rental type (for now, all vehicles support both)
    // This would be filtered based on actual vehicle data

    // Available now
    if (availableNow) {
      filtered = filtered.filter(v => v.status === 'available');
    }

    // Price range
    filtered = filtered.filter(v => v.price >= priceRange[0] && v.price <= priceRange[1]);

    // Body styles
    if (bodyStyles.length > 0) {
      filtered = filtered.filter(v => bodyStyles.includes(v.bodyStyle));
    }

    // Transmission
    if (transmission !== 'any') {
      filtered = filtered.filter(v => 
        v.transmission.toLowerCase() === transmission.toLowerCase()
      );
    }

    // Fuel types
    if (fuelTypes.length > 0) {
      filtered = filtered.filter(v => fuelTypes.includes(v.fuel));
    }

    // Sort
    if (sortBy === 'closest') {
      filtered.sort((a, b) => {
        const aDist = parseFloat(a.distance);
        const bDist = parseFloat(b.distance);
        return aDist - bDist;
      });
    } else if (sortBy === 'price-low') {
      filtered.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-high') {
      filtered.sort((a, b) => b.price - a.price);
    }

    setFilteredVehicles(filtered);
  }, [vehicles, searchQuery, rentalType, availableNow, priceRange, bodyStyles, transmission, fuelTypes, sortBy]);

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
    setCurrentImageIndex(0);
  };

  const calculateTotal = () => {
    if (!selectedVehicle) return { baseTotal: 0, insurance: 0, tax: 0, total: 0 };
    
    const basePrice = selectedVehicle.price;
    
    // Calculate hours between pickup and dropoff
    let hours = 3; // Default
    if (pickupDate && pickupTime && dropoffDate && dropoffTime) {
      const pickup = new Date(`${pickupDate}T${pickupTime}`);
      const dropoff = new Date(`${dropoffDate}T${dropoffTime}`);
      const diffMs = dropoff - pickup;
      hours = Math.max(1, diffMs / (1000 * 60 * 60)); // At least 1 hour
    }
    
    const baseTotal = basePrice * hours;
    
    let insurance = 0;
    if (selectedInsurance === 'vehicle-protection') {
      insurance = 52.00;
    } else if (selectedInsurance === '3rd-party') {
      insurance = 62.00;
    }
    
    const tax = baseTotal * 0.1; // 10% tax
    const total = baseTotal + insurance + tax;
    
    return { baseTotal, insurance, tax, total, hours };
  };

  const handleBookVehicle = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!pickupDate || !pickupTime || !dropoffDate || !dropoffTime) {
      toast.warning('Please select pickup and drop-off dates and times');
      return;
    }

    try {
      // Create booking logic here
      toast.success('Vehicle booked successfully!');
    } catch (error) {
      toast.error('Failed to book vehicle');
    }
  };

  const bodyStyleOptions = ['Hatchback', 'Sedan', 'Wagon', 'Couple', 'Sport coupe', 'Crossover', 'Pickup', 'Van'];
  const transmissionOptions = [
    { value: 'any', label: 'Any', count: 2108 },
    { value: 'manual', label: 'Manual', count: 966 },
    { value: 'automatic', label: 'Automatic', count: 1142 }
  ];
  const fuelTypeOptions = ['Diesel', 'Petrol', 'Electric', 'Hybrid'];

  const totals = calculateTotal();

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Left Sidebar */}
      <div className="hidden lg:flex w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo and Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center">
              <CarIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg text-gray-900">Cab Bazaar</h2>
              <p className="text-xs text-gray-500">Ride Sharing</p>
            </div>
          </div>
          
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Filter by:</h3>
            <button className="text-xs text-blue-600 hover:underline">Reset all</button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Rental Type */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-3 block">Rental Type</label>
            <div className="flex gap-2">
              {['any', 'per-day', 'per-hour'].map((type) => (
                <button
                  key={type}
                  onClick={() => setRentalType(type)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    rentalType === type
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type === 'any' ? 'Any' : type === 'per-day' ? 'Per day' : 'Per hour'}
                </button>
              ))}
            </div>
          </div>

          {/* Available Now */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold text-gray-700">Available Now Only</label>
            <button
              onClick={() => setAvailableNow(!availableNow)}
              className={`w-12 h-6 rounded-full transition-colors ${
                availableNow ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                availableNow ? 'translate-x-6' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Price Range */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Price Range/Hour</label>
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-gray-600">
                <span>${priceRange[0].toFixed(2)}</span>
                <span>${priceRange[1].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="22"
                max="98.5"
                step="0.5"
                value={priceRange[1]}
                onChange={(e) => setPriceRange([priceRange[0], parseFloat(e.target.value)])}
                className="w-full"
              />
            </div>
          </div>

          {/* Car Brand */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              Car Brand
              {selectedBrands.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-xs">
                  {selectedBrands.length}
                </span>
              )}
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Select brand</option>
              <option>Ford</option>
              <option>Toyota</option>
              <option>Honda</option>
            </select>
          </div>

          {/* Car Model & Year */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              Car Model & Year
              {selectedModels.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-xs">
                  {selectedModels.length}
                </span>
              )}
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Select model</option>
              <option>Focus 2023</option>
              <option>Kuga 2023</option>
            </select>
          </div>

          {/* Body Style */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Body Style</label>
            <div className="space-y-2">
              {bodyStyleOptions.map((style) => (
                <label key={style} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bodyStyles.includes(style)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setBodyStyles([...bodyStyles, style]);
                      } else {
                        setBodyStyles(bodyStyles.filter(s => s !== style));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{style}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Transmission */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Transmission</label>
            <div className="space-y-2">
              {transmissionOptions.map((option) => (
                <label key={option.value} className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="transmission"
                      value={option.value}
                      checked={transmission === option.value}
                      onChange={(e) => setTransmission(e.target.value)}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{option.label}</span>
                  </div>
                  <span className="text-xs text-gray-500">{option.count}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Fuel Type */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">Fuel Type</label>
            <div className="space-y-2">
              {fuelTypeOptions.map((fuel) => (
                <label key={fuel} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fuelTypes.includes(fuel)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFuelTypes([...fuelTypes, fuel]);
                      } else {
                        setFuelTypes(fuelTypes.filter(f => f !== fuel));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{fuel}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Navigation */}
        <div className="p-4 border-t border-gray-200 flex items-center justify-around">
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <Home className="w-5 h-5" />
          </button>
          <button className="p-2 text-blue-600">
            <CarIcon className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <CalendarIcon className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <HeartIcon className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <User className="w-5 h-5" />
          </button>
          <button className="p-2 text-gray-400 hover:text-gray-600">
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Column - Vehicle Listings */}
      <div className={`flex-1 overflow-y-auto bg-white transition-all ${selectedVehicle ? 'lg:w-auto' : ''}`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">
              {filteredVehicles.length} rides found
            </h2>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="closest">Closest to me</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </div>

          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-12 text-gray-500">Loading rides...</div>
            ) : error ? (
              <div className="text-center py-12 text-red-500">{error}</div>
            ) : filteredVehicles.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No rides found</div>
            ) : (
              filteredVehicles.map((vehicle) => (
                <div
                  key={vehicle.id}
                  onClick={() => handleSelectVehicle(vehicle)}
                  className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                    selectedVehicle?.id === vehicle.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex gap-4">
                    {/* Vehicle Image */}
                    <div className="flex-shrink-0">
                      <img
                        src={vehicle.images[0]}
                        alt={`${vehicle.brand} ${vehicle.model}`}
                        className="w-32 h-24 object-cover rounded-lg"
                        onError={(e) => {
                          e.target.src = 'https://via.placeholder.com/128x96?text=No+Image';
                        }}
                      />
                    </div>

                    {/* Vehicle Info */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                            <span className="text-sm font-semibold text-gray-900">
                              {vehicle.rating}
                            </span>
                            <span className="text-xs text-gray-500">
                              {vehicle.reviews ? `(${vehicle.reviews} reviews)` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {vehicle.status === 'available' ? (
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                                Available now
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-1 bg-orange-100 text-orange-700 rounded">
                                Booked for {vehicle.bookedTime}
                              </span>
                            )}
                            <span className="text-xs text-gray-500">
                              {vehicle.distance} ({vehicle.time})
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(vehicle.id);
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Heart
                            className={`w-5 h-5 ${
                              favorites.has(vehicle.id)
                                ? 'fill-red-500 text-red-500'
                                : 'text-gray-400'
                            }`}
                          />
                        </button>
                      </div>

                      <h3 className="font-bold text-lg text-gray-900 mb-1">
                        {vehicle.brand} {vehicle.model}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">{vehicle.variant}</p>

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span>{vehicle.bodyStyle}</span>
                        <span>{vehicle.transmission}</span>
                        <span>{vehicle.fuel}</span>
                        <span>{vehicle.seats} seats</span>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="flex-shrink-0 text-right">
                      <div className="text-2xl font-bold text-gray-900">
                        ₹{vehicle.price.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-500">per seat (estimated)</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Panel - Vehicle Details */}
      {selectedVehicle && (
        <div className="hidden xl:flex w-96 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="w-4 h-4" />
              <span>01:48 PM (UTC-7:00)</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500">Nearby area</span>
              <User className="w-4 h-4 text-gray-400 ml-2" />
            </div>
            <button
              onClick={() => setSelectedVehicle(null)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Vehicle Images */}
          <div className="relative">
            <div className="flex overflow-hidden">
              {selectedVehicle.images.map((img, idx) => (
                <img
                  key={idx}
                  src={img}
                  alt={`${selectedVehicle.brand} ${selectedVehicle.model} ${idx + 1}`}
                  className={`w-full h-64 object-cover transition-transform ${
                    idx === currentImageIndex ? 'block' : 'hidden'
                  }`}
                  onError={(e) => {
                    e.target.src = 'https://via.placeholder.com/384x256?text=No+Image';
                  }}
                />
              ))}
            </div>
            {selectedVehicle.images.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentImageIndex((prev) => 
                    prev > 0 ? prev - 1 : selectedVehicle.images.length - 1
                  )}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-md"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-700" />
                </button>
                <button
                  onClick={() => setCurrentImageIndex((prev) => 
                    prev < selectedVehicle.images.length - 1 ? prev + 1 : 0
                  )}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white/80 hover:bg-white rounded-full shadow-md"
                >
                  <ChevronRight className="w-5 h-5 text-gray-700" />
                </button>
              </>
            )}
          </div>

          {/* Vehicle Name and Price */}
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-bold text-lg text-gray-900 mb-1">
              {selectedVehicle.brand} {selectedVehicle.model}
            </h3>
            <p className="text-sm text-gray-600 mb-2">{selectedVehicle.variant}</p>
            <div className="text-2xl font-bold text-gray-900">
              ${selectedVehicle.price.toFixed(2)} /hour
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 overflow-x-auto">
            {['rent-details', 'vehicle-info', 'specifications', 'statistics', 'documents'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === 'rent-details' && (
              <>
                {/* Map Placeholder */}
                <div className="h-48 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500 text-sm">
                  Map View
                  <br />
                  {selectedVehicle.location}
                  <br />
                  {selectedVehicle.distance} ({selectedVehicle.time})
                </div>

                {/* Pick-up Date & Time */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">
                    Pick-up Date & Time
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={pickupDate}
                      onChange={(e) => setPickupDate(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="time"
                      value={pickupTime}
                      onChange={(e) => setPickupTime(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Drop-off Date & Time */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">
                    Drop-off Date & Time
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={dropoffDate}
                      onChange={(e) => setDropoffDate(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="time"
                      value={dropoffTime}
                      onChange={(e) => setDropoffTime(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Insurance */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">Insurance</label>
                  <div className="space-y-2">
                    {[
                      { value: 'no-insurance', label: 'No insurance', price: 0 },
                      { value: 'vehicle-protection', label: 'Vehicle protection', price: 52.00 },
                      { value: '3rd-party', label: '3rd party liability', price: 62.00 }
                    ].map((option) => (
                      <label
                        key={option.value}
                        className="flex items-center justify-between p-3 border-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
                        style={{
                          borderColor: selectedInsurance === option.value ? '#2563EB' : '#E5E7EB',
                          backgroundColor: selectedInsurance === option.value ? '#EFF6FF' : 'transparent'
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="insurance"
                            value={option.value}
                            checked={selectedInsurance === option.value}
                            onChange={(e) => setSelectedInsurance(e.target.value)}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{option.label}</span>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          ${option.price.toFixed(2)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Sales Taxes */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Sales Taxes</span>
                  <span className="text-sm font-semibold text-gray-900">
                    ${totals.tax.toFixed(2)}
                  </span>
                </div>

                {/* Extra Time */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-gray-700">Extra Time</label>
                  <button
                    onClick={() => setExtraTime(!extraTime)}
                    className={`w-12 h-6 rounded-full transition-colors ${
                      extraTime ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform ${
                      extraTime ? 'translate-x-6' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>

                {/* Total Price */}
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border-2 border-blue-200">
                  <span className="text-lg font-bold text-gray-900">Total Price</span>
                  <span className="text-2xl font-bold text-blue-600">
                    ${totals.total.toFixed(2)}
                  </span>
                </div>

                {/* Book Vehicle Button */}
                <button
                  onClick={handleBookVehicle}
                  className="w-full py-4 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors"
                >
                  BOOK VEHICLE
                  <div className="text-sm font-normal mt-1">
                    {selectedVehicle.brand} {selectedVehicle.model}
                  </div>
                </button>

                {/* Free Booking Button */}
                <button className="w-full py-3 bg-blue-100 text-blue-600 font-semibold rounded-lg hover:bg-blue-200 transition-colors flex items-center justify-center gap-2">
                  FREE BOOKING
                  <div className="text-xs font-normal">10 minutes</div>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}

            {activeTab === 'vehicle-info' && (
              <div className="text-sm text-gray-600">
                <p>Vehicle information details will be displayed here.</p>
              </div>
            )}

            {activeTab === 'specifications' && (
              <div className="text-sm text-gray-600">
                <p>Vehicle specifications will be displayed here.</p>
              </div>
            )}

            {activeTab === 'statistics' && (
              <div className="text-sm text-gray-600">
                <p>Vehicle statistics will be displayed here.</p>
              </div>
            )}

            {activeTab === 'documents' && (
              <div className="text-sm text-gray-600">
                <p>Vehicle documents will be displayed here.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchRides;
