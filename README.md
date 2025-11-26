# Ride Sharing DBMS

A full-stack ride-sharing application built with React and Node.js, featuring real-time ride matching, payment integration, and comprehensive safety features.

![License](https://img.shields.io/badge/license-ISC-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![React](https://img.shields.io/badge/react-18.3.1-blue.svg)

## Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Running the Application](#-running-the-application)
- [Project Structure](#-project-structure)
- [API Endpoints](#-api-endpoints)
- [Features Overview](#-features-overview)
- [Contributing](#-contributing)
- [License](#-license)

## Features

### For Passengers
-  **Search & Book Rides** - Search available rides with filters
-  **Request Rides** - Request a ride with pickup and destination
-  **Multiple Payment Methods** - Razorpay, Stripe, and Wallet integration
-  **Real-time Updates** - Live ride tracking and notifications
-  **Promo Codes** - Apply discount codes for rides
-  **Ride History** - View past rides with detailed information
-  **Wallet System** - Manage wallet balance and transactions
-  **Emergency SOS** - Quick access to emergency services
-  **Saved Locations** - Quick access to frequently used locations
-  **Feedback System** - Rate and review drivers

### For Drivers
-  **Vehicle Management** - Register and manage multiple vehicles
-  **Driver Dashboard** - View bookings, earnings, and statistics
-  **Route Navigation** - Integrated route planning with OpenRouteService
-  **Document Management** - Upload and manage driver documents
-  **Earnings Tracking** - Monitor payments and receipts
-  **Real-time Notifications** - Get instant booking notifications

### Safety Features
-  **Night Ride Safety Checks** - Automated safety verification for night rides
-  **SOS Alerts** - Emergency assistance system
-  **Live Location Tracking** - Real-time location sharing
-  **Safety Confirmations** - Driver and passenger safety check-ins

### Admin Features
-  **User Management** - Manage users, drivers, and passengers
-  **Document Verification** - Review and approve driver documents
-  **Analytics Dashboard** - View platform statistics and insights
-  **Notification Management** - Send system-wide notifications

## Tech Stack

### Frontend
- **React 18.3.1** - UI library
- **Vite** - Build tool and dev server
- **React Router DOM** - Routing
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Socket.io Client** - Real-time communication
- **Axios** - HTTP client
- **Lucide React** - Icons
- **Leaflet/React Leaflet** - Maps
- **Lottie React** - Animations

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Prisma** - ORM
- **PostgreSQL** - Database (Neon)
- **Socket.io** - Real-time communication
- **JWT** - Authentication
- **Bcrypt** - Password hashing
- **Razorpay** - Payment gateway
- **Stripe** - Payment gateway
- **Nodemailer** - Email service
- **OpenRouteService API** - Route planning

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18.0.0 or higher)
- **npm** or **yarn**
- **PostgreSQL** database (or Neon account)
- **Git**

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
cd Ride_Sharing_DBMS
```

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Install Backend Dependencies

```bash
cd backend
npm install
```

### 4. Database Setup

1. Create a PostgreSQL database (or use Neon)
2. Update the database connection string in `backend/.env`

### 5. Environment Variables

Create a `.env` file in the `backend` directory:

```env
# Database
DATABASE_URL="postgresql://user:password@host:port/database?sslmode=require"

# JWT
JWT_SECRET="your-secret-key-here"
JWT_EXPIRES_IN="7d"

# Server
PORT=5000
NODE_ENV=development

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Socket.io
SOCKET_URL=http://localhost:5000

# Payment Gateways
RAZORPAY_KEY_ID=your-razorpay-key
RAZORPAY_KEY_SECRET=your-razorpay-secret
STRIPE_SECRET_KEY=your-stripe-secret
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# OpenRouteService API (Optional)
ORS_API_KEY=your-ors-api-key
```

Create a `.env` file in the root directory for frontend:

```env
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

### 6. Database Migration

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate
```

Or push the schema directly:

```bash
npm run prisma:push
```

## Running the Application

### Development Mode

#### Start Backend Server

```bash
cd backend
npm run dev
```

The backend server will run on `http://localhost:5000`

#### Start Frontend Development Server

```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

### Production Build

#### Build Frontend

```bash
npm run build
```

#### Start Backend in Production

```bash
cd backend
npm start
```

## Project Structure

```
Ride_Sharing_DBMS/
├── backend/
│   ├── config/           # Database configuration
│   ├── controllers/      # Route controllers
│   ├── middleware/       # Auth and validation middleware
│   ├── prisma/          # Prisma schema and migrations
│   ├── routes/          # API routes
│   ├── utils/           # Utility functions
│   └── server.js        # Express server entry point
├── src/
│   ├── components/      # React components
│   │   ├── Map/        # Map components
│   │   └── ui/         # UI components
│   ├── config/         # API configuration
│   ├── context/        # React context providers
│   ├── hooks/          # Custom React hooks
│   ├── pages/          # Page components
│   ├── services/       # API service functions
│   └── utils/          # Utility functions
├── public/             # Static assets
└── package.json        # Frontend dependencies
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Rides
- `GET /api/rides` - Get all available rides
- `GET /api/rides/:id` - Get ride details
- `POST /api/rides` - Create a ride (driver)
- `GET /api/rides/my-rides` - Get user's rides

### Bookings
- `POST /api/bookings` - Create a booking
- `GET /api/bookings/my` - Get user's bookings
- `GET /api/bookings/:id` - Get booking details
- `PUT /api/bookings/:id/status` - Update booking status

### Payments
- `POST /api/payments/razorpay/create-order` - Create Razorpay order
- `POST /api/payments/stripe/create-payment` - Create Stripe payment
- `POST /api/payments/wallet` - Pay with wallet
- `GET /api/payments/history` - Get payment history

### Requests
- `POST /api/requests` - Request a ride
- `GET /api/requests/my` - Get user's ride requests

### Vehicles
- `GET /api/vehicles` - Get user's vehicles
- `POST /api/vehicles` - Register a vehicle
- `PUT /api/vehicles/:id` - Update vehicle
- `DELETE /api/vehicles/:id` - Delete vehicle

### Wallet
- `GET /api/wallet` - Get wallet balance
- `POST /api/wallet/add-funds` - Add funds to wallet
- `GET /api/wallet/transactions` - Get wallet transactions

### Promo Codes
- `GET /api/promo-codes` - Get available promo codes
- `POST /api/promo-codes/apply` - Apply promo code

### Safety
- `POST /api/safety/sos` - Send SOS alert
- `POST /api/safety/night-ride-check` - Night ride safety check

## Features Overview

### Real-time Communication
- Socket.io integration for live updates
- Real-time ride matching
- Instant notifications
- Live location tracking

### Payment Integration
- **Razorpay** - Indian payment gateway
- **Stripe** - International payments
- **Wallet System** - Internal payment method
- Transaction history and receipts

### Map Integration
- OpenRouteService for route planning
- Leaflet maps for visualization
- Distance and duration calculation
- Real-time location updates

### Safety Features
- Emergency SOS alerts
- Night ride safety checks
- Driver document verification
- Safety confirmations

### User Experience
- Modern, responsive UI
- Dark theme support
- Smooth animations
- Mobile-friendly design
- Toast notifications
