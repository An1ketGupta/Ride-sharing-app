import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../config/api'
import io from 'socket.io-client'
import { useAuth } from '../context/AuthContext'
import { paymentService } from '../services/paymentService'
import { walletService } from '../services/walletService'
import { bookingService } from '../services/bookingService'
import { useToast } from '../components/ui/Toast'
import { CreditCard, Wallet, DollarSign, Banknote } from 'lucide-react'

const useQuery = () => new URLSearchParams(useLocation().search)

export default function Payment() {
  const query = useQuery()
  const navigate = useNavigate()
  const bookingId = query.get('bookingId')
  const amount = query.get('amount')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [processing, setProcessing] = useState(false)
  const [showConfirmed, setShowConfirmed] = useState(false)
  const [socket, setSocket] = useState(null)
  const [driverMsg, setDriverMsg] = useState('')
  const [walletBalance, setWalletBalance] = useState(0)
  const [paymentMethod, setPaymentMethod] = useState('razorpay') // razorpay, wallet, cash
  const { user } = useAuth()
  const toast = useToast()
  
  const [finalAmount, setFinalAmount] = useState(0)

  useEffect(() => {
    if (!bookingId) {
      navigate('/search')
    }
    
    // Initialize amount
    const amt = parseFloat(amount) || 0
    setFinalAmount(amt)
    
    // Load wallet balance
    if (user?.user_id) {
      walletService.getWalletBalance().then(resp => {
        const balance = Number(resp.balance) || 0
        setWalletBalance(balance)
      }).catch(() => {
        setWalletBalance(0)
      })
    }
  }, [bookingId, navigate, user?.user_id, amount])

  // Setup socket to allow messaging the driver after booking
  useEffect(() => {
    if (!user?.user_id) return
    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000'
    const s = io(socketUrl, { transports: ['websocket'] })
    s.on('connect', () => {
      // register as user to receive potential acks (optional)
      s.emit('user_register', { user_id: user.user_id })
    })
    s.on('booking_message_ack', () => {
      // optional ack
    })
    setSocket(s)
    return () => {
      s.disconnect()
    }
  }, [user])

  const payCash = async () => {
    setLoading(true)
    setMessage('')
    try {
      await paymentService.cashInit(Number(bookingId))
      setMessage('Cash payment initialized. Pay after ride to the driver.')
      setShowConfirmed(true)
      setTimeout(() => {
        navigate('/passenger/dashboard')
      }, 2000)
    } catch (e) {
      setMessage(e.response?.data?.message || 'Failed to initialize cash payment')
      toast.error('Failed to initialize cash payment')
    } finally {
      setLoading(false)
    }
  }

  const payWithWallet = async () => {
    setLoading(true)
    setMessage('')
    try {
      const amt = finalAmount
      if (walletBalance < amt) {
        toast.error('Insufficient wallet balance')
        setMessage('Insufficient wallet balance. Please top up your wallet.')
        return
      }
      await paymentService.confirmPayment({
        booking_id: Number(bookingId),
        amount: amt,
        payment_method: 'wallet'
      })
      toast.success('Payment successful!')
      setMessage('Payment successful!')
      setTimeout(() => navigate('/passenger/dashboard'), 1500)
    } catch (e) {
      setMessage(e.response?.data?.message || 'Failed to process wallet payment')
      toast.error('Payment failed')
    } finally {
      setLoading(false)
    }
  }

  const payOnline = async () => {
    setLoading(true)
    setMessage('')
    try {
      // Create Razorpay order on server with final amount
      const { data } = await api.post('/payment/razorpay/order', { 
        booking_id: Number(bookingId),
        amount: finalAmount
      })
      const { order_id, amount: amtPaise, currency, key } = data?.data || {}

      if (!order_id || !key) {
        throw new Error('Failed to initialize payment')
      }

      const options = {
        key,
        amount: amtPaise,
        currency,
        name: 'Ride Sharing',
        description: `Booking #${bookingId}`,
        order_id,
        handler: async function (response) {
          try {
            setProcessing(true)
            await api.post('/payment/razorpay/verify', {
              booking_id: Number(bookingId),
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              amount: finalAmount
            })
            toast.success('Payment successful!')
            setMessage('Payment successful!')
            setTimeout(() => navigate('/passenger/dashboard'), 1200)
          } catch (e) {
            setMessage(e.response?.data?.message || 'Payment verification failed')
          } finally {
            setProcessing(false)
          }
        },
        theme: { color: '#6366F1' },
        modal: {
          ondismiss: async function() {
            try {
              // Check if payment was actually completed before cancelling
              const [paymentCheck] = await api.get(`/payment/booking/${bookingId}`)
              if (paymentCheck?.data?.data?.payment_status === 'completed') {
                toast.info('Payment already completed')
                setTimeout(() => navigate('/passenger/dashboard'), 1000)
                return
              }
              
              // Cancel booking only if payment not completed
              await bookingService.cancelBooking(Number(bookingId))
              toast.error('Payment cancelled. Booking has been cancelled.')
              setMessage('Payment cancelled. Booking has been cancelled.')
              setTimeout(() => navigate('/search'), 2000)
            } catch (e) {
              toast.error('Payment cancelled. Please cancel the booking manually if needed.')
              setMessage('Payment cancelled. Please cancel the booking manually.')
            } finally {
              setLoading(false)
            }
          }
        }
      }

      // eslint-disable-next-line no-undef
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', async function (resp) {
        try {
          // Check if payment was actually completed before cancelling
          try {
            const [paymentCheck] = await api.get(`/payment/booking/${bookingId}`)
            if (paymentCheck?.data?.data?.payment_status === 'completed') {
              toast.info('Payment already completed')
              setTimeout(() => navigate('/passenger/dashboard'), 1000)
              return
            }
          } catch {}
          
          // Cancel booking only if payment not completed
          await bookingService.cancelBooking(Number(bookingId))
          toast.error('Payment failed. Booking has been cancelled.')
          setMessage(resp.error?.description || 'Payment failed. Booking has been cancelled.')
        } catch (e) {
          toast.error('Payment failed. Please cancel the booking manually.')
          setMessage(resp.error?.description || 'Payment failed')
        } finally {
          setLoading(false)
        }
      })
      rzp.open()
      setMessage('Opening payment gateway...')
    } catch (e) {
      setMessage(e.response?.data?.message || 'Failed to create payment intent')
    } finally {
      setLoading(false)
    }
  }

  const sendMessageToDriver = () => {
    if (!socket || !driverMsg.trim()) return
    socket.emit('booking_message', {
      booking_id: Number(bookingId),
      text: driverMsg.trim(),
      from_user_id: Number(user?.user_id)
    })
    setDriverMsg('')
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 sm:px-8 md:px-10 py-8 sm:py-10 md:py-12 max-w-2xl mx-auto">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 sm:mb-8 text-gray-900">Payment</h1>
      <div className="rounded-lg p-6 sm:p-8 border border-gray-200 bg-white space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-gray-900/60">Booking ID</div>
          <div className="text-gray-900 font-bold">#{bookingId}</div>
        </div>
        <div className="flex items-center justify-between">
          <div className="font-semibold text-gray-900/60">Amount</div>
          <div className="text-2xl font-bold text-gray-900">₹{finalAmount.toFixed(2)}</div>
        </div>
        
        {/* Payment Methods */}
        <div className="space-y-4 pt-4">
          <div className="text-sm font-semibold mb-4 text-gray-900">Select Payment Method</div>
          
          {/* Payment Method Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <button
              onClick={() => setPaymentMethod('razorpay')}
              className={`p-4 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 ${
                paymentMethod === 'razorpay'
                  ? 'border-[#0EA5E9] bg-blue-600/10'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <CreditCard className={`w-5 h-5 ${paymentMethod === 'razorpay' ? 'text-blue-600' : 'text-gray-900/60'}`} />
              <span className={`text-sm font-semibold ${paymentMethod === 'razorpay' ? 'text-blue-600' : 'text-gray-900/60'}`}>Razorpay</span>
            </button>
            <button
              onClick={() => setPaymentMethod('wallet')}
              className={`p-4 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 ${
                paymentMethod === 'wallet'
                  ? 'border-[#0EA5E9] bg-blue-600/10'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <Wallet className={`w-5 h-5 ${paymentMethod === 'wallet' ? 'text-blue-600' : 'text-gray-900/60'}`} />
              <span className={`text-sm font-semibold ${paymentMethod === 'wallet' ? 'text-blue-600' : 'text-gray-900/60'}`}>Wallet</span>
            </button>
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`p-4 rounded-lg border transition-all duration-200 flex items-center justify-center gap-2 ${
                paymentMethod === 'cash'
                  ? 'border-[#0EA5E9] bg-blue-600/10'
                  : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
              }`}
            >
              <Banknote className={`w-5 h-5 ${paymentMethod === 'cash' ? 'text-blue-600' : 'text-gray-900/60'}`} />
              <span className={`text-sm font-semibold ${paymentMethod === 'cash' ? 'text-blue-600' : 'text-gray-900/60'}`}>Cash</span>
            </button>
          </div>

          {/* Wallet Balance Display */}
          {paymentMethod === 'wallet' && (
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-900/60">Wallet Balance</span>
                <span className="font-bold text-gray-900">₹{(Number(walletBalance) || 0).toFixed(2)}</span>
              </div>
              {walletBalance < finalAmount && (
                <p className="text-xs text-[#ef4444] mt-2">Insufficient balance. Top up wallet first.</p>
              )}
            </div>
          )}
        </div>

        {/* Payment Action Section */}
        <div className="space-y-3 pt-6">
          {/* Pay Button */}
          <button
            onClick={() => {
              if (paymentMethod === 'cash') payCash()
              else if (paymentMethod === 'wallet') payWithWallet()
              else payOnline() // Razorpay
            }}
            disabled={loading || processing || (paymentMethod === 'wallet' && walletBalance < finalAmount)}
            className="w-full py-4 bg-blue-600 text-gray-900 font-semibold rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 text-base"
          >
            {loading || processing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Processing...
              </>
            ) : (
              <>
                {paymentMethod === 'cash' && <Banknote className="w-5 h-5" />}
                {paymentMethod === 'wallet' && <Wallet className="w-5 h-5" />}
                {(paymentMethod === 'razorpay') && <CreditCard className="w-5 h-5" />}
                {paymentMethod === 'cash' ? 'Pay After Ride' : 'Pay Now'}
              </>
            )}
          </button>
        </div>
        {message && (
          <div className="mt-3 text-sm text-gray-900/60">{message}</div>
        )}
        {processing && (
          <div className="mt-2 text-xs break-all text-gray-900/40">Verifying payment...</div>
        )}
        <div className="pt-6 border-t border-gray-200 space-y-3">
          <div className="font-semibold text-gray-900">Message your driver</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={driverMsg}
              onChange={(e) => setDriverMsg(e.target.value)}
              placeholder="I'm at the blue gate"
              className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none text-gray-900 placeholder:text-gray-900/40"
            />
            <button
              disabled={!driverMsg.trim()}
              onClick={sendMessageToDriver}
              className="px-5 py-3 bg-blue-600 text-gray-900 font-semibold rounded-lg hover:bg-blue-600 hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
          <div className="text-xs text-gray-900/40">This sends a real-time message to your driver.</div>
        </div>
      </div>

      {/* Ride Booked Popup */}
        {showConfirmed && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6" onClick={() => setShowConfirmed(false)}>
          <div className="rounded-lg p-6 sm:p-8 max-w-md w-full border border-gray-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-xl sm:text-2xl font-bold mb-2 text-gray-900">Ride booked</div>
            <div className="text-sm sm:text-base text-gray-900/60 mb-6">Your ride is booked with pay-after-ride. Please pay the driver after completion.</div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmed(false)} className="flex-1 py-3 bg-[#1A1A1A] hover:bg-[#1F1F1F] text-gray-900 font-semibold rounded-lg transition-all duration-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


