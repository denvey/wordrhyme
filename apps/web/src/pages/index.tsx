import Head from "next/head";

/**
 * WordRhyme Web App - Home Page
 *
 * This is the public-facing website that can load plugin pages via Module Federation 2.0.
 * Plugins can inject pages by registering routes in the plugin manifest.
 */
export default function Home() {
  return (
    <>
      <Head>
        <title>WordRhyme</title>
        <meta name="description" content="WordRhyme - Extensible CMS Platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Hero Section */}
        <div className="relative isolate overflow-hidden">
          <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
            {/* Header */}
            <nav className="flex items-center justify-between mb-16">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                  <span className="text-white font-bold text-xl">W</span>
                </div>
                <span className="text-2xl font-bold text-white">WordRhyme</span>
              </div>
              <div className="flex items-center gap-4">
                <a
                  href="/admin"
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  Admin
                </a>
                <a
                  href="/docs"
                  className="text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  Docs
                </a>
                <a
                  href="/login"
                  className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20"
                >
                  Sign In
                </a>
              </div>
            </nav>

            {/* Hero Content */}
            <div className="text-center">
              <h1 className="text-5xl font-bold tracking-tight text-white sm:text-7xl bg-clip-text text-transparent bg-gradient-to-r from-white via-purple-200 to-pink-200">
                Build Extensible
                <br />
                Web Experiences
              </h1>
              <p className="mt-8 text-lg leading-8 text-gray-300 max-w-2xl mx-auto">
                WordRhyme is a modern, plugin-based CMS platform. Build your content
                experiences with a powerful plugin ecosystem and full customization
                control.
              </p>
              <div className="mt-10 flex items-center justify-center gap-6">
                <a
                  href="/docs/getting-started"
                  className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 transition-all hover:shadow-purple-500/50 hover:scale-105"
                >
                  Get Started
                </a>
                <a
                  href="https://github.com/wordrhyme/wordrhyme"
                  className="rounded-full border border-white/20 bg-white/5 px-8 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10"
                >
                  View on GitHub
                </a>
              </div>
            </div>

            {/* Feature Cards */}
            <div className="mt-24 grid grid-cols-1 gap-8 sm:grid-cols-3">
              <div className="rounded-2xl bg-white/5 p-8 backdrop-blur-sm border border-white/10">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Plugin Ecosystem</h3>
                <p className="text-gray-400">
                  Extend functionality with first-party and third-party plugins. Full isolation and security.
                </p>
              </div>

              <div className="rounded-2xl bg-white/5 p-8 backdrop-blur-sm border border-white/10">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-6">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Multi-Tenant</h3>
                <p className="text-gray-400">
                  Built for SaaS from day one. Complete tenant and workspace isolation.
                </p>
              </div>

              <div className="rounded-2xl bg-white/5 p-8 backdrop-blur-sm border border-white/10">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center mb-6">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">Type-Safe</h3>
                <p className="text-gray-400">
                  Full TypeScript support with tRPC. End-to-end type safety from server to client.
                </p>
              </div>
            </div>
          </div>

          {/* Background gradient decorations */}
          <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80">
            <div
              className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
            />
          </div>
          <div className="absolute inset-x-0 top-[calc(100%-13rem)] -z-10 transform-gpu overflow-hidden blur-3xl sm:top-[calc(100%-30rem)]">
            <div
              className="relative left-[calc(50%+3rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 bg-gradient-to-tr from-[#ff80b5] to-[#9089fc] opacity-20 sm:left-[calc(50%+36rem)] sm:w-[72.1875rem]"
            />
          </div>
        </div>
      </main>
    </>
  );
}
