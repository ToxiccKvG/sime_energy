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
import Inventaire from "./pages/Inventaire";
import Audits from "./pages/Audits";
import AuditDetail from "./pages/AuditDetail";
import Rapport from "./pages/Rapport";
import Parametres from "./pages/Parametres";
import Compte from "./pages/Compte";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { BenjaminBubble } from "@/components/chatbot/BenjaminBubble";

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

        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Routes publiques */}
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
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
                    <div className="flex min-h-screen w-full bg-background text-foreground">
                      <AppSidebar />
                      <div className="flex flex-1 flex-col">
                        <AppHeader />
                        <main className="flex-1 bg-transparent p-4 md:p-6 md:pl-28">
                          <Routes>
                            <Route path="/" element={<Index />} />
                            <Route path="/facturation" element={<Facturation />} />
                            <Route path="/annotation" element={<AnnotationPage />} />
                            <Route path="/inventaire" element={<Inventaire />} />
                            <Route path="/audits" element={<Audits />} />
                            <Route path="/audits/:auditId" element={<AuditDetail />} />
                            <Route path="/rapport" element={<Rapport />} />
                            <Route path="/parametres" element={<Parametres />} />
                            <Route path="/compte" element={<Compte />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </main>
                      </div>
                    </div>
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
