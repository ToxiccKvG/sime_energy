import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useAuth } from "@/context/AuthContext";
import { OrganizationProvider } from "@/context/OrganizationContext";
import { AppSidebar } from "@/components/AppSidebar";
import { AppHeader } from "@/components/AppHeader";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { ForgotPassword } from "./pages/ForgotPassword";
import AcceptInvitation from "./pages/AcceptInvitation";
import Index from "./pages/Index";
import Facturation from "./pages/Facturation";
import { AnnotationPage } from "./pages/AnnotationPage";
import Mesures from "./pages/Mesures";
import Inventaire from "./pages/Inventaire";
import Audits from "./pages/Audits";
import AuditDetail from "./pages/AuditDetail";
import Parametres from "./pages/Parametres";
import Compte from "./pages/Compte";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <TooltipProvider>
        <Toaster />

        <BrowserRouter>
          <Routes>
            {/* Routes publiques */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/invite" element={<AcceptInvitation />} />

            {/* Routes protégées */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <OrganizationProvider>
                    <div className="flex min-h-screen w-full bg-[#0f111a] text-slate-100">
                      <AppSidebar />
                      <div className="flex flex-1 flex-col">
                        <AppHeader />
                        <main className="flex-1 bg-transparent p-6 pl-24">
                          <Routes>
                            <Route path="/" element={<Index />} />
                            <Route path="/facturation" element={<Facturation />} />
                            <Route path="/annotation" element={<AnnotationPage />} />
                            <Route path="/mesures" element={<Mesures />} />
                            <Route path="/inventaire" element={<Inventaire />} />
                            <Route path="/audits" element={<Audits />} />
                            <Route path="/audits/:auditId" element={<AuditDetail />} />
                            <Route path="/parametres" element={<Parametres />} />
                            <Route path="/compte" element={<Compte />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </main>
                      </div>
                    </div>
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
