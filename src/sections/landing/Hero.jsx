import { ArrowRight, Car, MapPin } from 'lucide-react'

export default function Hero({ onPrimary, onSecondary }) {
  return (
    <section className="relative pt-20 sm:pt-32 pb-16 sm:pb-24 min-h-[80vh] sm:min-h-[90vh] flex items-center bg-black">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid md:grid-cols-2 gap-8 md:gap-10 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight text-white">
              <span className="block text-[#0EA5E9]">Ride sharing,</span>
              <span className="block mt-2">reinvented for a</span>
              <span className="block mt-2 text-[#0EA5E9]">smarter city.</span>
            </h1>
            <p className="mt-6 text-gray-400 text-lg sm:text-xl max-w-2xl leading-relaxed">
              Minimal, premium, and fast. Book safe, affordable rides with beautiful simplicity.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button 
                onClick={onPrimary} 
                className="flex items-center px-6 py-3 rounded-xl text-white bg-[#0EA5E9] hover:bg-[#0c94d6] shadow-md transition-all duration-200 ease-out font-semibold"
              >
                Find a ride
                <ArrowRight className="ml-2" size={16} />
              </button>
              <button 
                onClick={onSecondary} 
                className="border border-gray-700 text-gray-300 hover:bg-gray-800 px-6 py-3 rounded-xl transition-all duration-200 ease-out font-semibold"
              >
                Offer a ride
              </button>
            </div>
            <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-5 max-w-lg">
              <div className="rounded-xl p-4 sm:p-6 border border-gray-800 bg-gray-900 hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3 text-sm text-gray-400 mb-3">
                  <div className="p-2 rounded-lg bg-[#0EA5E9]/10">
                    <MapPin size={18} className="text-[#0EA5E9]"/>
                  </div>
                  <span className="font-semibold">Live routes</span>
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-white">120+</div>
                <div className="text-sm text-gray-500 mt-1">cities</div>
              </div>
              <div className="rounded-xl p-4 sm:p-6 border border-gray-800 bg-gray-900 hover:bg-gray-800 transition-colors">
                <div className="flex items-center gap-3 text-sm text-gray-400 mb-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <Car size={18} className="text-amber-500"/>
                  </div>
                  <span className="font-semibold">Verified</span>
                </div>
                <div className="text-3xl sm:text-4xl font-bold text-white">4.9★</div>
                <div className="text-sm text-gray-500 mt-1">avg rating</div>
              </div>
            </div>
          </div>
          <div className="relative mt-8 md:mt-0">
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-gray-800 shadow-lg">
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
