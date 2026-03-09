import { ReactNode } from "react";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0d14] text-white">
      {/* Soft brand glows */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 -top-10 h-64 w-64 rounded-full bg-[#132038]/60 blur-3xl" />
        <div className="absolute bottom-10 right-0 h-72 w-72 rounded-full bg-[#7c1d2d]/30 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col px-4 py-8 md:px-10">
        {/* Header / brand */}
        <div className="flex items-center gap-3">
          <img
            src="/logo-sime.png"
            alt="SIME"
            className="h-14 w-14 rounded-lg border border-white/10 bg-white p-1 backdrop-blur"
          />
          <div className="leading-tight">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
              Plateforme interne
            </p>
            <p className="text-sm text-slate-200">CER2E · SIME</p>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-lg">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl sm:p-10">
              <div className="mb-8 space-y-2">
                <h1 className="text-3xl font-semibold text-white sm:text-4xl">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-sm text-slate-300">{subtitle}</p>
                )}
              </div>

              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
