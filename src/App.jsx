import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import LandingPage from "./components/LandingPage";
import MapView from "./components/MapView";
import "./App.css";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  return (
    <>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/map" element={<MapView />} />
        </Routes>
      </BrowserRouter>
      <Analytics />
    </>
  );
}