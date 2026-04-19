import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import Index from "./pages/Index.tsx";
import NewMeeting from "./pages/NewMeeting.tsx";
import MeetingDetail from "./pages/MeetingDetail.tsx";
import MeetingsPage from "./pages/MeetingsPage.tsx";
import CalendarPage from "./pages/CalendarPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}

const AppRoutes = () => (
  <AuthGate>
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/new-meeting" element={<NewMeeting />} />
      <Route path="/meeting/:id" element={<MeetingDetail />} />
      <Route path="/meetings" element={<MeetingsPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      {/* Legacy auth routes redirect home */}
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/" replace />} />
      <Route path="/reset-password" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </AuthGate>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
