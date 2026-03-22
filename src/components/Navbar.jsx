import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import logoImg from "../assets/logo.png";

export default function Navbar() {
  const { pathname } = useLocation();
  const isMap = pathname === "/map";
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-1100 transition-all duration-300 ${
        isMap
          ? "bg-white/70 backdrop-blur-md shadow-sm"
          : "bg-white shadow-sm"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2 text-xl tracking-tight no-underline"
            style={{ fontFamily: "'DM Serif Display', serif", color: "#134e4a" }}
          >
            <img src={logoImg} alt="River Watch logo" className="h-8 w-8" />
            River Watch
          </Link>

          {/* Desktop links */}
          <div className="hidden sm:flex items-center gap-8">
            <Link
              to="/"
              className={`text-sm font-medium no-underline transition-colors duration-200 ${
                pathname === "/"
                  ? "text-teal-900"
                  : "text-slate-500 hover:text-teal-800"
              }`}
            >
              Home
            </Link>
            <Link
              to="/map"
              className={`text-sm font-medium no-underline transition-colors duration-200 ${
                isMap
                  ? "text-teal-900"
                  : "text-slate-500 hover:text-teal-800"
              }`}
            >
              Explore Map
            </Link>
          </div>

          {/* Mobile menu toggle */}
          <button
            className="sm:hidden p-2 text-slate-600 hover:text-teal-800 transition-colors bg-transparent border-none"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="sm:hidden bg-white border-t border-slate-100 px-4 pb-4">
          <Link
            to="/"
            onClick={() => setMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-700 no-underline hover:text-teal-800"
          >
            Home
          </Link>
          <Link
            to="/map"
            onClick={() => setMenuOpen(false)}
            className="block py-2 text-sm font-medium text-slate-700 no-underline hover:text-teal-800"
          >
            Explore Map
          </Link>
        </div>
      )}
    </nav>
  );
}
