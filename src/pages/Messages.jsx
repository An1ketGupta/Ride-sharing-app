import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { motion } from 'framer-motion';
import { MessageSquare, Send, User } from 'lucide-react';
import io from 'socket.io-client';
import { bookingService } from '../services/bookingService';

const Messages = () => {
    const { user } = useAuth();
    const toast = useToast();
    const [socket, setSocket] = useState(null);
    const [bookings, setBookings] = useState([]);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        loadBookings();
    }, [user]);

    useEffect(() => {
        if (!user?.user_id) return;
        const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
        const s = io(socketUrl, { transports: ['websocket'] });

        s.on('connect', () => {
            if (user.user_type === 'driver' || user.user_type === 'both') {
                s.emit('driver_register', { driver_id: user.user_id });
            }
            s.emit('user_register', { user_id: user.user_id });
        });

        // Listen for booking messages for any booking the user is part of
        s.on('booking_message', (payload) => {
            // Check if this message is for any of the user's bookings
            const isRelevantBooking = bookings.some(b =>
                b.booking_id === payload.booking_id
            );

            if (isRelevantBooking) {
                // If this is the currently selected booking, add to messages
                if (selectedBooking && payload.booking_id === selectedBooking.booking_id) {
                    // Determine if message is from driver
                    const isFromDriver = Number(payload.from_user_id) === Number(selectedBooking.driver_id);
                    const isFromMe = Number(payload.from_user_id) === Number(user.user_id);

                    setMessages(prev => {
                        // Avoid duplicates by checking message_id first, then content+timestamp
                        const exists = prev.some(m => {
                            if (m.message_id && payload.message_id && m.message_id === payload.message_id) {
                                return true;
                            }
                            // Also check for duplicate content from same user within 1 second
                            if (m.text === payload.text &&
                                m.from_user_id === payload.from_user_id &&
                                Math.abs(new Date(m.timestamp) - new Date(payload.timestamp)) < 1000) {
                                return true;
                            }
                            return false;
                        });
                        if (exists) return prev;

                        return [...prev, {
                            message_id: payload.message_id,
                            text: payload.text,
                            from_user_id: payload.from_user_id,
                            timestamp: payload.timestamp,
                            is_from_driver: isFromDriver,
                            is_from_me: isFromMe
                        }];
                    });
                }
            }
        });

        setSocket(s);
        return () => s.disconnect();
    }, [user, selectedBooking, bookings]);

    useEffect(() => {
        // Only scroll within the messages container, not the whole page
        if (messagesEndRef.current) {
            const messagesContainer = messagesEndRef.current.closest('.overflow-y-auto');
            if (messagesContainer) {
                // Scroll the container directly instead of using scrollIntoView
                messagesContainer.scrollTo({
                    top: messagesContainer.scrollHeight,
                    behavior: 'smooth'
                });
            }
        }
    }, [messages]);

    const loadBookings = async () => {
        if (!user?.user_id) return;
        try {
            setLoading(true);
            const response = await bookingService.getMyBookings();
            let allBookings = Array.isArray(response.data) ? response.data : [];
            setBookings(allBookings);
        } catch (err) {
            toast.error('Failed to load bookings');
        } finally {
            setLoading(false);
        }
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !selectedBooking || !socket) return;

        try {
            const payload = {
                booking_id: selectedBooking.booking_id,
                text: newMessage.trim(),
                from_user_id: user.user_id
            };

            socket.emit('booking_message', payload);

            // Add message optimistically (will be replaced by socket event with message_id)
            const isFromMe = true;
            const isFromDriver = user.user_type === 'driver' || user.user_type === 'both';

            const tempMessage = {
                message_id: null, // Will be set when socket confirms
                text: newMessage.trim(),
                from_user_id: user.user_id,
                timestamp: new Date().toISOString(),
                is_from_driver: isFromDriver,
                is_from_me: isFromMe
            };

            setMessages(prev => [...prev, tempMessage]);
            setNewMessage('');

            // Wait for socket acknowledgment to update with message_id
            socket.once('booking_message_ack', (ack) => {
                if (ack.ok && ack.message_id) {
                    // Update temp message with real message_id
                    setMessages(prev => prev.map(msg =>
                        msg === tempMessage ? { ...msg, message_id: ack.message_id } : msg
                    ));
                } else {
                    // Remove temp message if save failed
                    setMessages(prev => prev.filter(msg => msg !== tempMessage));
                    // Show detailed error message
                    const errorMsg = ack.message || ack.error || 'Failed to save message. Please try again.';
                    const errorDetails = ack.code ? ` (Error: ${ack.code})` : '';
                    toast.error(`${errorMsg}${errorDetails}`);
                    console.error('Message save failed:', ack);
                    // Restore message text so user can retry
                    setNewMessage(tempMessage.text);
                }
            });
        } catch (err) {
            toast.error('Failed to send message');
        }
    };

    const selectBooking = async (booking, event) => {
        // Prevent page scroll when clicking on booking
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        setSelectedBooking(booking);
        setMessages([]);
        setLoading(true);

        try {
            // Load messages from database
            const response = await bookingService.getBookingMessages(booking.booking_id);
            const loadedMessages = Array.isArray(response.data) ? response.data : [];

            console.log(`Loaded ${loadedMessages.length} messages for booking ${booking.booking_id}`);

            // Format messages for display
            const formattedMessages = loadedMessages.map(msg => ({
                message_id: msg.message_id,
                text: msg.text,
                from_user_id: msg.from_user_id,
                timestamp: msg.timestamp,
                is_from_driver: msg.is_from_driver,
                is_from_me: msg.is_from_me
            }));

            setMessages(formattedMessages);
        } catch (err) {
            console.error('Failed to load messages:', err);
            toast.error('Failed to load messages: ' + (err.response?.data?.message || err.message));
        } finally {
            setLoading(false);
        }
    };

    // Reload messages when socket reconnects
    useEffect(() => {
        if (!socket || !selectedBooking) return;

        const handleConnect = () => {
            // Reload messages when socket reconnects to ensure we have latest data
            if (selectedBooking) {
                bookingService.getBookingMessages(selectedBooking.booking_id)
                    .then(response => {
                        const loadedMessages = Array.isArray(response.data) ? response.data : [];
                        const formattedMessages = loadedMessages.map(msg => ({
                            message_id: msg.message_id,
                            text: msg.text,
                            from_user_id: msg.from_user_id,
                            timestamp: msg.timestamp,
                            is_from_driver: msg.is_from_driver,
                            is_from_me: msg.is_from_me
                        }));
                        setMessages(formattedMessages);
                    })
                    .catch(err => {
                        console.error('Failed to reload messages on reconnect:', err);
                    });
            }
        };

        socket.on('connect', handleConnect);
        return () => {
            socket.off('connect', handleConnect);
        };
    }, [socket, selectedBooking?.booking_id]);

    return (
        <div className="min-h-screen bg-gray-50 px-4 sm:px-6 py-8 max-w-6xl mx-auto">
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
            >
                <h1 className="text-3xl sm:text-4xl font-bold mb-8 text-gray-900">Messages</h1>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Bookings List */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05, duration: 0.25 }}
                    className="lg:col-span-1 max-h-[calc(100vh-200px)] overflow-y-auto"
                >
                    <h2 className="text-xl font-bold mb-4 text-gray-900 sticky top-0 bg-gray-50 pb-2 z-10">Conversations</h2>
                    {loading && bookings.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto" />
                        </div>
                    ) : bookings.length === 0 ? (
                        <div className="rounded-lg border border-gray-200 bg-white shadow-lg p-10 text-center">
                            <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                            <p className="text-gray-500">No bookings yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {bookings.map((booking, index) => (
                                <motion.div
                                    key={booking.booking_id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    onClick={(e) => selectBooking(booking, e)}
                                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${selectedBooking?.booking_id === booking.booking_id
                                            ? 'border-blue-600 bg-blue-50'
                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-lg ${selectedBooking?.booking_id === booking.booking_id
                                                ? 'bg-blue-100'
                                                : 'bg-gray-100'
                                            }`}>
                                            <User className={`w-5 h-5 ${selectedBooking?.booking_id === booking.booking_id
                                                    ? 'text-blue-600'
                                                    : 'text-gray-500'
                                                }`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold truncate text-gray-900">
                                                {user.user_type === 'driver' ? `Passenger #${booking.passenger_id}` : `Driver: ${booking.driver_name || 'Unknown'}`}
                                            </p>
                                            <p className="text-sm text-gray-600 truncate">
                                                {booking.source} → {booking.destination}
                                            </p>
                                            {booking.date && (
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {booking.date} {booking.time}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Messages Area */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.25 }}
                    className="lg:col-span-2"
                >
                    {!selectedBooking ? (
                        <div className="rounded-lg border border-gray-200 bg-white shadow-lg p-10 text-center h-full flex items-center justify-center min-h-[400px]">
                            <div>
                                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                <p className="text-gray-500">Select a booking to start messaging</p>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-lg border border-gray-200 bg-white shadow-lg flex flex-col max-h-[calc(100vh-200px)]">
                            {/* Header */}
                            <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-gray-50 rounded-t-lg">
                                <p className="font-semibold text-gray-900">
                                    {user.user_type === 'driver' ? `Passenger #${selectedBooking.passenger_id}` : `Driver: ${selectedBooking.driver_name || 'Unknown'}`}
                                </p>
                                <p className="text-sm text-gray-600">
                                    {selectedBooking.source} → {selectedBooking.destination}
                                </p>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-gray-50">
                                {messages.length === 0 ? (
                                    <div className="text-center py-10 text-gray-500">
                                        <p>No messages yet. Start the conversation!</p>
                                    </div>
                                ) : (
                                    messages.map((msg) => {
                                        // Determine alignment based on whether message is from current user
                                        const isFromMe = msg.is_from_me || Number(msg.from_user_id) === Number(user.user_id);
                                        // Use message_id as key if available, otherwise use combination of fields
                                        const messageKey = msg.message_id || `${msg.from_user_id}-${msg.timestamp}-${msg.text.substring(0, 20)}`;
                                        return (
                                            <div
                                                key={messageKey}
                                                className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}
                                            >
                                                <div
                                                    className={`max-w-[70%] rounded-lg p-3 ${isFromMe
                                                            ? 'bg-blue-600 text-white'
                                                            : 'bg-white border border-gray-200 text-gray-900'
                                                        }`}
                                                >
                                                    <p className="text-sm">{msg.text}</p>
                                                    <p className={`text-xs mt-1 ${isFromMe ? 'text-white/80' : 'text-gray-500'}`}>
                                                        {new Date(msg.timestamp).toLocaleTimeString()}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="p-4 border-t border-gray-200 flex gap-2 flex-shrink-0 bg-white rounded-b-lg">
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                                    placeholder="Type a message..."
                                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 outline-none placeholder:text-gray-400"
                                />
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={sendMessage}
                                    disabled={!newMessage.trim()}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
                                >
                                    <Send className="w-4 h-4" />
                                    Send
                                </motion.button>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default Messages;
