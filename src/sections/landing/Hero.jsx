import { ArrowRight, Car, MapPin } from 'lucide-react'

export default function Hero({ onPrimary, onSecondary }) {
  return (
    <section className="relative pt-20 sm:pt-32 pb-16 sm:pb-24 min-h-[80vh] sm:min-h-[90vh] flex items-center bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid md:grid-cols-2 gap-8 md:gap-10 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight text-gray-900 dark:text-gray-100">
              <span className="block text-primary">Ride sharing,</span>
              <span className="block mt-2">reinvented for a</span>
              <span className="block mt-2 text-primary">smarter city.</span>
            </h1>
            <p className="mt-6 text-gray-600 dark:text-gray-400 text-lg sm:text-xl max-w-2xl leading-relaxed">
              Minimal, premium, and fast. Book safe, affordable rides with beautiful simplicity.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={onPrimary} className="flex items-center p-[9px] rounded-[14px] text-white bg-[linear-gradient(135deg,#6366f1,40%,#06b6d4)] hover:brightness-110 shadow-glow">
                Find a ride
                <ArrowRight className="ml-2" size={16} />
              </button>
              <button onClick={onSecondary} className="border border-border text-foreground hover:bg-muted p-[9px] rounded-[14px]">
                Offer a ride
              </button>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-5 max-w-lg">
              <div className="rounded-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mb-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <MapPin size={18} className="text-primary"/>
                  </div>
                  <span className="font-semibold">Live routes</span>
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">120+</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">cities</div>
              </div>
              <div className="rounded-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mb-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Car size={18} className="text-amber-600"/>
                  </div>
                  <span className="font-semibold">Verified</span>
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100">4.9★</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">avg rating</div>
              </div>
            </div>
          </div>
          <div className="relative mt-8 md:mt-0">
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-lg">
              <img
                src="https://images.unsplash.com/photo-1502877338535-766e1452684a?q=80&w=1600&auto=format&fit=crop"
                alt="Modern city ride"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
