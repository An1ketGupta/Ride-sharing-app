import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const [toastCounter, setToastCounter] = useState(0);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    // Use counter + timestamp + random to ensure unique IDs
    const id = `toast-${Date.now()}-${toastCounter}-${Math.random().toString(36).substr(2, 9)}`;
    setToastCounter((prev) => prev + 1);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [removeToast, toastCounter]);

  const toast = {
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    warning: (message, duration) => addToast(message, 'warning', duration),
    info: (message, duration) => addToast(message, 'info', duration),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, removeToast }) => {
  return (
    <div className="fixed top-24 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const Toast = ({ toast, onClose }) => {
  const icons = {
    success: <CheckCircle className="w-5 h-5 text-[#10b981]" />,
    error: <AlertCircle className="w-5 h-5 text-[#ef4444]" />,
    warning: <AlertTriangle className="w-5 h-5 text-[#f59e0b]" />,
    info: <Info className="w-5 h-5 text-[#0EA5E9]" />,
  };

  const colors = {
    success: 'border-[#10b981]/30 bg-[#111111] border',
    error: 'border-[#ef4444]/30 bg-[#111111] border',
    warning: 'border-[#f59e0b]/30 bg-[#111111] border',
    info: 'border-[#0EA5E9]/30 bg-[#111111] border',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.98 }}
      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
      className={`pointer-events-auto flex items-start gap-3 min-w-[320px] max-w-md p-4 rounded-xl ${colors[toast.type]} shadow-[0_4px_16px_rgba(0,0,0,0.4)]`}
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <p className="flex-1 text-base font-medium text-white leading-relaxed">{toast.message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 p-1 hover:bg-[#1A1A1A] rounded-lg transition-colors duration-200"
      >
        <X className="w-4 h-4 text-white/60 hover:text-white" />
      </button>
    </motion.div>
  );
};

