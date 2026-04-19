import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import NewMeeting from "./pages/NewMeeting.tsx";
import MeetingDetail from "./pages/MeetingDetail.tsx";
import MeetingsPage from "./pages/MeetingsPage.tsx";
import CalendarPage from "./pages/CalendarPage.tsx";
import SettingsPage from "./pages/SettingsPage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const AppRoutes = () => (
  <Routes>
    <Route path="/" element={<Index />} />
    <Route path="/new-meeting" element={<NewMeeting />} />
    <Route path="/meeting/:id" element={<MeetingDetail />} />
    <Route path="/meetings" element={<MeetingsPage />} />
    <Route path="/calendar" element={<CalendarPage />} />
    <Route path="/settings" element={<SettingsPage />} />
    <Route path="*" element={<NotFound />} />
  </Routes>
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