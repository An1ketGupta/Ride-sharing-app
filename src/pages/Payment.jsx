import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import api from '../config/api'
import io from 'socket.io-client'
import { useAuth } from '../context/AuthContext'
import { paymentService } from '../services/paymentService'
import { walletService } from '../services/walletService'
import { promoService } from '../services/promoService'
import { bookingService } from '../services/bookingService'
import { useToast } from '../components/ui/Toast'
import { CreditCard, Wallet, DollarSign, Banknote, Tag, X, Check } from 'lucide-react'

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
  
  // Promo code states
  const [promoCode, setPromoCode] = useState('')
  const [promoApplied, setPromoApplied] = useState(null)
  const [promoValidating, setPromoValidating] = useState(false)
  const [originalAmount, setOriginalAmount] = useState(0)
  const [finalAmount, setFinalAmount] = useState(0)
  const [discount, setDiscount] = useState(0)

  useEffect(() => {
    if (!bookingId) {
      navigate('/search')
    }
    
    // Initialize original amount
    const amt = parseFloat(amount) || 0
    setOriginalAmount(amt)
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

  // Promo code functions
  const validatePromoCode = async () => {
    if (!promoCode.trim()) {
      toast.error('Please enter a promo code')
      return
    }

    setPromoValidating(true)
    try {
      const response = await promoService.validate(promoCode.trim())
      
      if (response.success) {
        const promoData = response.data
        let discountValue = 0
        
        // Calculate discount
        if (promoData.discount_percent) {
          discountValue = (originalAmount * promoData.discount_percent) / 100
        } else if (promoData.discount_amount) {
          discountValue = promoData.discount_amount
        }
        
        // Ensure discount doesn't exceed original amount
        discountValue = Math.min(discountValue, originalAmount)
        
        const newFinalAmount = Math.max(0, originalAmount - discountValue)
        
        setPromoApplied(promoData)
        setDiscount(discountValue)
        setFinalAmount(newFinalAmount)
        
        toast.success(`Promo code applied! You saved ₹${discountValue.toFixed(2)}`)
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || 'Invalid or expired promo code'
      toast.error(errorMsg)
      setPromoApplied(null)
      setDiscount(0)
      setFinalAmount(originalAmount)
    } finally {
      setPromoValidating(false)
    }
  }

  const removePromoCode = () => {
    setPromoCode('')
    setPromoApplied(null)
    setDiscount(0)
    setFinalAmount(originalAmount)
    toast.info('Promo code removed')
  }

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
        payment_method: 'wallet',
        promo_code: promoApplied?.code || null
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
      // Create Razorpay order on server with final amount and promo code
      const { data } = await api.post('/payment/razorpay/order', { 
        booking_id: Number(bookingId),
        amount: finalAmount,
        promo_code: promoApplied?.code || null
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
              amount: finalAmount,
              promo_code: promoApplied?.code || null
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
    <div className="min-h-screen bg-[#000000] px-6 sm:px-8 md:px-10 py-8 sm:py-10 md:py-12 max-w-2xl mx-auto">
      <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-6 sm:mb-8 text-white">Payment</h1>
      <div className="rounded-xl p-6 sm:p-8 border border-[#1A1A1A] bg-[#111111] space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-white/60">Booking ID</div>
          <div className="text-white font-bold">#{bookingId}</div>
        </div>
        <div className="flex items-center justify-between">
          <div className="font-semibold text-white/60">Amount</div>
          <div className="text-2xl font-bold text-white">₹{originalAmount.toFixed(2)}</div>
        </div>
        
        {/* Payment Methods */}
        <div className="space-y-4 pt-4">
          <div className="text-sm font-semibold mb-4 text-white">Select Payment Method</div>
          
          {/* Payment Method Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <button
              onClick={() => setPaymentMethod('razorpay')}
              className={`p-4 rounded-xl border transition-all duration-200 flex items-center justify-center gap-2 ${
                paymentMethod === 'razorpay'
                  ? 'border-[#0EA5E9] bg-[#0EA5E9]/10'
                  : 'border-[#1A1A1A] bg-[#0A0A0A] hover:bg-[#1A1A1A]'
              }`}
            >
              <CreditCard className={`w-5 h-5 ${paymentMethod === 'razorpay' ? 'text-[#0EA5E9]' : 'text-white/60'}`} />
              <span className={`text-sm font-semibold ${paymentMethod === 'razorpay' ? 'text-[#0EA5E9]' : 'text-white/60'}`}>Razorpay</span>
            </button>
            <button
              onClick={() => setPaymentMethod('wallet')}
              className={`p-4 rounded-xl border transition-all duration-200 flex items-center justify-center gap-2 ${
                paymentMethod === 'wallet'
                  ? 'border-[#0EA5E9] bg-[#0EA5E9]/10'
                  : 'border-[#1A1A1A] bg-[#0A0A0A] hover:bg-[#1A1A1A]'
              }`}
            >
              <Wallet className={`w-5 h-5 ${paymentMethod === 'wallet' ? 'text-[#0EA5E9]' : 'text-white/60'}`} />
              <span className={`text-sm font-semibold ${paymentMethod === 'wallet' ? 'text-[#0EA5E9]' : 'text-white/60'}`}>Wallet</span>
            </button>
            <button
              onClick={() => setPaymentMethod('cash')}
              className={`p-4 rounded-xl border transition-all duration-200 flex items-center justify-center gap-2 ${
                paymentMethod === 'cash'
                  ? 'border-[#0EA5E9] bg-[#0EA5E9]/10'
                  : 'border-[#1A1A1A] bg-[#0A0A0A] hover:bg-[#1A1A1A]'
              }`}
            >
              <Banknote className={`w-5 h-5 ${paymentMethod === 'cash' ? 'text-[#0EA5E9]' : 'text-white/60'}`} />
              <span className={`text-sm font-semibold ${paymentMethod === 'cash' ? 'text-[#0EA5E9]' : 'text-white/60'}`}>Cash</span>
            </button>
          </div>

          {/* Wallet Balance Display */}
          {paymentMethod === 'wallet' && (
            <div className="p-4 rounded-xl bg-[#0A0A0A] border border-[#1A1A1A]">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white/60">Wallet Balance</span>
                <span className="font-bold text-white">₹{(Number(walletBalance) || 0).toFixed(2)}</span>
              </div>
              {walletBalance < finalAmount && (
                <p className="text-xs text-[#ef4444] mt-2">Insufficient balance. Top up wallet first.</p>
              )}
            </div>
          )}
        </div>

        {/* Promo Code Section - Now appears after payment method selection */}
        <div className="border-t border-[#1A1A1A] pt-6">
          <div className="font-semibold mb-4 flex items-center gap-2 text-white">
            <Tag className="w-5 h-5 text-[#0EA5E9]" />
            <span>Have a Promo Code?</span>
          </div>
          
          {!promoApplied ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                onKeyPress={(e) => e.key === 'Enter' && validatePromoCode()}
                placeholder="Enter promo code"
                disabled={promoValidating}
                className="flex-1 px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none uppercase text-white placeholder:text-white/40"
              />
              <button
                onClick={validatePromoCode}
                disabled={!promoCode.trim() || promoValidating}
                className="px-6 py-3 bg-[#0EA5E9] text-white font-semibold rounded-xl hover:bg-[#0EA5E9] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {promoValidating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Validating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Apply
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#10b981]/10 border border-[#10b981]/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#10b981] flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="font-bold text-[#10b981]">{promoApplied.code}</div>
                  <div className="text-sm text-white/60">
                    {promoApplied.discount_percent 
                      ? `${promoApplied.discount_percent}% discount` 
                      : `₹${promoApplied.discount_amount} off`}
                  </div>
                </div>
              </div>
              <button
                onClick={removePromoCode}
                className="p-2 rounded-lg hover:bg-[#ef4444]/10 transition-colors duration-200"
                title="Remove promo code"
              >
                <X className="w-5 h-5 text-[#ef4444]" />
              </button>
            </div>
          )}
        </div>

        {/* Amount Display with Discount Breakdown */}
        <div className="border-t border-[#1A1A1A] pt-6 space-y-3">
          <div className="flex items-center justify-between text-white/60">
            <div>Original Amount</div>
            <div>₹{originalAmount.toFixed(2)}</div>
          </div>
          
          {discount > 0 && (
            <div className="flex items-center justify-between text-[#10b981]">
              <div>Discount</div>
              <div>- ₹{discount.toFixed(2)}</div>
            </div>
          )}
          
          <div className="flex items-center justify-between border-t border-[#1A1A1A] pt-3">
            <div className="font-bold text-lg text-white">Total Amount</div>
            <div className="text-3xl font-bold text-[#0EA5E9]">₹{finalAmount.toFixed(2)}</div>
          </div>
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
            className="w-full py-4 bg-[#0EA5E9] text-white font-semibold rounded-xl hover:bg-[#0EA5E9] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2 text-base"
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
          <div className="mt-3 text-sm text-white/60">{message}</div>
        )}
        {processing && (
          <div className="mt-2 text-xs break-all text-white/40">Verifying payment...</div>
        )}
        <div className="pt-6 border-t border-[#1A1A1A] space-y-3">
          <div className="font-semibold text-white">Message your driver</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={driverMsg}
              onChange={(e) => setDriverMsg(e.target.value)}
              placeholder="I'm at the blue gate"
              className="flex-1 px-4 py-3 bg-[#0A0A0A] border border-[#1A1A1A] rounded-xl focus:border-[#0EA5E9] focus:ring-2 focus:ring-[#0EA5E9]/20 transition-all outline-none text-white placeholder:text-white/40"
            />
            <button
              disabled={!driverMsg.trim()}
              onClick={sendMessageToDriver}
              className="px-5 py-3 bg-[#0EA5E9] text-white font-semibold rounded-xl hover:bg-[#0EA5E9] hover:brightness-110 hover:shadow-[0_4px_12px_rgba(14,165,233,0.3)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
          <div className="text-xs text-white/40">This sends a real-time message to your driver.</div>
        </div>
      </div>

      {/* Ride Booked Popup */}
        {showConfirmed && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6" onClick={() => setShowConfirmed(false)}>
          <div className="rounded-xl p-6 sm:p-8 max-w-md w-full border border-[#1A1A1A] bg-[#111111] shadow-[0_4px_16px_rgba(0,0,0,0.4)]" onClick={(e) => e.stopPropagation()}>
            <div className="text-xl sm:text-2xl font-bold mb-2 text-white">Ride booked</div>
            <div className="text-sm sm:text-base text-white/60 mb-6">Your ride is booked with pay-after-ride. Please pay the driver after completion.</div>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmed(false)} className="flex-1 py-3 bg-[#1A1A1A] hover:bg-[#1F1F1F] text-white font-semibold rounded-xl transition-all duration-200">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


