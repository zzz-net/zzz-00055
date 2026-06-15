import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Layout } from "./components/common/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Batches } from "./pages/Batches";
import { Events } from "./pages/Events";
import { EventDetail } from "./pages/EventDetail";
import { Config } from "./pages/Config";
import { Export } from "./pages/Export";
import { ToastProvider } from "./components/common/Toast";

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/batches" element={<Batches />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<EventDetail />} />
            <Route path="/config" element={<Config />} />
            <Route path="/export" element={<Export />} />
          </Route>
        </Routes>
      </ToastProvider>
    </Router>
  );
}
