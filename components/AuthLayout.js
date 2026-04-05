'use client';

export default function AuthLayout({ children, title, subtitle, illustration }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 flex">
      {/* Left Side - Branding & Illustration */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-700 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="absolute inset-0 h-full w-full" fill="none" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="large-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="m 40 0 l 0 40 m -40 0 l 40 0" stroke="currentColor" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#large-grid)" />
          </svg>
        </div>

        {/* Content */}
        <div className="relative flex flex-col justify-center px-12 py-24 text-white">
          <div className="max-w-md mx-auto">
            {/* Logo */}
            <div className="mb-12">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                  <div className="w-6 h-6 bg-white rounded-sm"></div>
                </div>
                <span className="text-2xl font-bold">Konnect</span>
              </div>
            </div>

            {/* Main Content */}
            <div className="space-y-6">
              <h1 className="text-4xl font-bold leading-tight">
                {title || "Connect with confidence, grow with trust"}
              </h1>
              <p className="text-indigo-100 text-lg leading-relaxed">
                {subtitle || "Join thousands of teams who trust Konnect for seamless collaboration and powerful insights."}
              </p>
              
              {/* Stats or Features */}
              <div className="grid grid-cols-2 gap-6 pt-8">
                <div className="text-center">
                  <div className="text-3xl font-bold">10K+</div>
                  <div className="text-indigo-200 text-sm">Active Users</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold">99.9%</div>
                  <div className="text-indigo-200 text-sm">Uptime SLA</div>
                </div>
              </div>
            </div>

            {/* Decorative Elements */}
            <div className="absolute top-20 right-20 w-72 h-72 bg-white/5 rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 left-10 w-60 h-60 bg-purple-400/10 rounded-full blur-2xl"></div>
          </div>
        </div>

        {/* Bottom Testimonial */}
        <div className="absolute bottom-12 left-12 right-12">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-lg font-semibold">
                S
              </div>
              <div>
                <div className="font-medium">Sarah Chen</div>
                <div className="text-indigo-200 text-sm">Head of Product at TechCorp</div>
              </div>
            </div>
            <p className="mt-4 text-indigo-100 text-sm leading-relaxed">
              "Konnect transformed how our team collaborates. The seamless experience and powerful features make it indispensable."
            </p>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex flex-col justify-center px-4 sm:px-6 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-sm lg:max-w-md">
          <div className="animate-fade-in">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}