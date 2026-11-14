import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useAuth } from "@/context/AuthContext";
import { OrganizationProvider } from "@/context/OrganizationContext";
import { RequireOrganization } from "@/components/auth/RequireOrganization";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import AcceptInvitation from "./pages/AcceptInvitation";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { BenjaminBubble } from "@/components/chatbot/BenjaminBubble";

// Pages de l'application chargées à la demande : chacune devient un fichier JS
// téléchargé à sa première ouverture, au lieu d'un seul bundle pour tout le site.
// Les pages publiques (connexion, invitation, session lue dans l'URL) restent
// chargées immédiatement.
const Index = lazy(() => import("./pages/Index"));
const Facturation = lazy(() => import("./pages/Facturation"));
const AnnotationPage = lazy(() => import("./pages/AnnotationPage").then((m) => ({ default: m.AnnotationPage })));
const Inventaire = lazy(() => import("./pages/Inventaire"));
const Audits = lazy(() => import("./pages/Audits"));
const AuditDetail = lazy(() => import("./pages/AuditDetail"));
const Rapport = lazy(() => import("./pages/Rapport"));
const Mesures = lazy(() => import("./pages/Mesures"));
const Parametres = lazy(() => import("./pages/Parametres"));
const Compte = lazy(() => import("./pages/Compte"));
const IOT = lazy(() => import("./pages/IOT"));

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

/** Affiché dans la zone de contenu pendant le téléchargement d'une page. */
function PageLoading() {
  return (
    <div className="flex items-center justify-center py-24" role="status" aria-label="Chargement de la page">
      <div className="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <Toaster />
        {/* La majorité des pages notifient via `toast` de sonner */}
        <Sonner />

        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Routes publiques */}
            <Route path="/login" element={<Login />} />
            {/* Inscription libre fermée (21/10/2026) : accès sur invitation (/invite) */}
            <Route path="/signup" element={<Navigate to="/login" replace />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/invite" element={<AcceptInvitation />} />

            {/* Routes protégées avec sidebar */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <OrganizationProvider>
                    <RequireOrganization>
                    <div className="flex min-h-screen w-full bg-background text-foreground">
                      <AppSidebar />
                      <div className="flex flex-1 flex-col min-w-0">
                        <AppHeader />
                        <main className="flex-1 min-w-0 overflow-x-hidden bg-transparent p-4 md:p-6 md:pl-28">
                          <Suspense fallback={<PageLoading />}>
                          <Routes>
                            <Route path="/" element={<Index />} />
                            <Route path="/facturation" element={<Facturation />} />
                            <Route path="/mesures" element={<Mesures />} />
                            <Route path="/annotation" element={<AnnotationPage />} />
                            <Route path="/inventaire" element={<Inventaire />} />
                            <Route path="/audits" element={<Audits />} />
                            <Route path="/audits/:auditId" element={<AuditDetail />} />
                            <Route path="/iot" element={<IOT />} />
                            <Route path="/rapport" element={<Rapport />} />
                            <Route path="/parametres" element={<Parametres />} />
                            <Route path="/compte" element={<Compte />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                          </Suspense>
                        </main>
                      </div>
                    </div>
                    </RequireOrganization>
                    <BenjaminBubble />
                  </OrganizationProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
