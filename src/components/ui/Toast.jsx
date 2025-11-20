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

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [removeToast]);

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
    <div className="fixed top-20 right-4 z-[100] flex flex-col gap-3 pointer-events-none">
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
    success: <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
    error: <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
    info: <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
  };

  const colors = {
    success: 'border-emerald-500/30 bg-emerald-50/90 dark:bg-emerald-950/90',
    error: 'border-red-500/30 bg-red-50/90 dark:bg-red-950/90',
    warning: 'border-amber-500/30 bg-amber-50/90 dark:bg-amber-950/90',
    info: 'border-blue-500/30 bg-blue-50/90 dark:bg-blue-950/90',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`pointer-events-auto flex items-start gap-3 min-w-[300px] max-w-md p-4 rounded-2xl border-2 backdrop-blur-xl shadow-glow ${colors[toast.type]}`}
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <p className="flex-1 text-sm font-medium text-foreground leading-relaxed">{toast.message}</p>
      <button
        onClick={onClose}
        className="flex-shrink-0 p-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
      >
        <X className="w-4 h-4 text-muted-foreground" />
      </button>
    </motion.div>
  );
};

