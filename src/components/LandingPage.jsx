import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { MapPin, LineChart, Droplets, TrendingUp } from "lucide-react";
import avatarImg from "../assets/me_snow.jpeg";

/* ── Intersection Observer hook (trigger once) ─────────────── */

function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, visible];
}

/* ── Animated counter hook ─────────────────────────────────── */

function useCountUp(target, duration = 2000, start = false) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    let raf;
    const t0 = performance.now();

    function tick(now) {
      const elapsed = now - t0;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out expo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, start]);

  return value;
}

/* ── Feature cards data ────────────────────────────────────── */

const features = [
  {
    icon: MapPin,
    title: "Sampling Points",
    description:
      "Explore over 65,000 water quality monitoring locations across every river, lake, and estuary in England.",
  },
  {
    icon: LineChart,
    title: "Time Series Data",
    description:
      "View historical measurements visualised as interactive charts — spot patterns, seasonal cycles, and long-term shifts.",
  },
  {
    icon: Droplets,
    title: "Pollution Indicators",
    description:
      "Track key pollutants like ammonia, phosphates, and dissolved oxygen against official water quality thresholds.",
  },
  {
    icon: TrendingUp,
    title: "River Health Trends",
    description:
      "See how water quality has changed over decades and understand what's improving — and what isn't.",
  },
];

/* ── Video background component ────────────────────────────── */

function VideoBackground() {
  return (
    <>
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src="/rivers_loop.mp4"
        poster="/thumbnail.png"
        autoPlay
        loop
        muted
        playsInline
      />
      {/* Dark overlay for text contrast */}
      <div className="absolute inset-0 bg-black/50" />
    </>
  );
}

/* ── Curved section divider ────────────────────────────────── */

function SectionDivider({ from = "#f8fafc", to = "#0f172a", flip = false }) {
  return (
    <div className={`w-full overflow-hidden leading-[0] ${flip ? "rotate-180" : ""}`}>
      <svg
        className="w-full h-16 sm:h-24"
        viewBox="0 0 1440 100"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M0,0 L0,60 Q360,100 720,60 Q1080,20 1440,60 L1440,0Z"
          fill={from}
        />
        <path
          d="M0,60 Q360,100 720,60 Q1080,20 1440,60 L1440,100 L0,100Z"
          fill={to}
        />
      </svg>
    </div>
  );
}

/* ── Feature card component ────────────────────────────────── */

function FeatureCard({ icon: Icon, title, description, delay, visible }) {
  return (
    <div
      className="group bg-white/80 backdrop-blur rounded-2xl p-6 shadow-sm border border-slate-200/60 transition-all duration-700 ease-out hover:shadow-xl hover:shadow-teal-900/10 hover:-translate-y-1"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(32px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mb-4 transition-colors duration-300 group-hover:bg-teal-100">
        <Icon className="text-teal-700" size={24} />
      </div>
      <h3
        className="text-lg font-semibold text-slate-900 mb-2"
        style={{ fontFamily: "'DM Serif Display', serif" }}
      >
        {title}
      </h3>
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </div>
  );
}

/* ── Stat block component ──────────────────────────────────── */

function StatBlock({ value, suffix, label, visible }) {
  return (
    <div className="text-center px-4">
      <div
        className="text-4xl sm:text-5xl font-bold text-teal-300 mb-1 transition-opacity duration-700"
        style={{
          fontFamily: "'DM Serif Display', serif",
          opacity: visible ? 1 : 0,
        }}
      >
        {value.toLocaleString()}
        {suffix}
      </div>
      <div className="text-sm text-slate-400">{label}</div>
    </div>
  );
}

/* ── Main landing page ─────────────────────────────────────── */

export default function LandingPage() {
  const [featuresRef, featuresVisible] = useReveal(0.1);
  const [statsRef, statsVisible] = useReveal(0.2);

  const samplingPoints = useCountUp(65000, 2200, statsVisible);
  const measurements = useCountUp(58000000, 2600, statsVisible);

  return (
    <div className="min-h-screen bg-white">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 overflow-hidden">
        <VideoBackground />

        <div className="relative z-10 max-w-3xl mx-auto pt-16">
          <h1
            className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight drop-shadow-lg"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            England's river health,
            <br />
            <span className="text-teal-300">made visible.</span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-200 max-w-2xl mx-auto mb-10 leading-relaxed drop-shadow">
            Explore decades of water quality data from every river, lake and
            estuary in England — all in one place. No jargon, no paywalls, just
            the data that matters.
          </p>

          <Link
            to="/map"
            className="inline-flex items-center gap-2 px-8 py-4 bg-teal-600 text-white text-base font-medium rounded-full no-underline transition-all duration-300 hover:bg-teal-500 hover:shadow-lg hover:shadow-teal-400/20 hover:-translate-y-0.5"
          >
            Explore the map
            <MapPin size={18} />
          </Link>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="py-24 px-4 bg-gradient-to-b from-slate-50 to-white" ref={featuresRef}>
        <div className="max-w-6xl mx-auto">
          <h2
            className="text-3xl sm:text-4xl font-bold text-slate-900 text-center mb-4"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            What you can explore
          </h2>
          <p className="text-center text-slate-500 mb-16 max-w-xl mx-auto">
            Open data from the Environment Agency, transformed into something
            anyone can understand.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <FeatureCard
                key={f.title}
                {...f}
                delay={i * 150}
                visible={featuresVisible}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────── */}
      <SectionDivider from="#ffffff" to="#0f172a" />
      <section
        className="py-24 px-4 bg-slate-900 relative overflow-hidden"
        ref={statsRef}
      >
        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, rgba(20,184,166,0.15) 0%, transparent 70%)" }} />

        <div className="max-w-4xl mx-auto relative z-10">
          <h2
            className="text-3xl sm:text-4xl font-bold text-white text-center mb-16"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            The scale of the data
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-12">
            <StatBlock
              value={samplingPoints}
              suffix="+"
              label="sampling points"
              visible={statsVisible}
            />
            <StatBlock
              value={measurements}
              suffix="+"
              label="measurements"
              visible={statsVisible}
            />
            <div className="text-center px-4">
              <div
                className="text-4xl sm:text-5xl font-bold text-teal-300 mb-1 transition-opacity duration-700"
                style={{
                  fontFamily: "'DM Serif Display', serif",
                  opacity: statsVisible ? 1 : 0,
                }}
              >
                2000-present
              </div>
              <div className="text-sm text-slate-400">years of data</div>
            </div>
          </div>
        </div>
      </section>
      {/* ── Why ─────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-slate-50">
        <div className="max-w-3xl mx-auto relative">
          {/* Decorative quote mark */}
          <div
            className="absolute -top-8 left-1/2 -translate-x-1/2 text-[12rem] leading-none text-teal-100 pointer-events-none select-none"
            style={{ fontFamily: "'DM Serif Display', serif" }}
            aria-hidden="true"
          >
            &ldquo;
          </div>

          <div className="relative z-10 text-center">
            <h2
              className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Why this exists
            </h2>
            <div className="mx-auto max-w-2xl border-l-4 border-teal-400 pl-6 text-left space-y-6">
              <p className="text-lg text-slate-600 leading-relaxed">
                Water quality data in England is publicly available, but it's buried
                in sprawling spreadsheets and technical reports that most people will
                never read. Geolumen exists to change that — to take this complex,
                fragmented data and make it something anyone can explore and
                understand.
              </p>
              <p className="text-lg text-slate-600 leading-relaxed">
                Whether you live near a river and want to know what's in it, or
                you're curious about pollution trends in your area and what might be
                causing them, this tool puts the answers within reach.
              </p>
              <p className="text-lg text-slate-600 leading-relaxed">
                This is only the beginning. There's much more I want to build —
                more data layers, deeper analysis, and new ways to understand the
                health of England's waterways.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who ──────────────────────────────────────────── */}
      <section className="py-24 px-4 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-2xl mx-auto">
          <h2
            className="text-3xl sm:text-4xl font-bold text-slate-900 text-center mb-10"
            style={{ fontFamily: "'DM Serif Display', serif" }}
          >
            Who's behind this
          </h2>
          <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-lg shadow-slate-200/50 border border-slate-100 text-center">
            <img
              src={avatarImg}
              alt="Laurence Wayne"
              className="w-24 h-24 rounded-full object-cover mx-auto mb-6 shadow-md ring-4 ring-teal-50"
            />
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              Geolumen is built by{" "}
              <a
                href="https://laurence-wayne.com/about"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-600 hover:text-teal-800 underline transition-colors"
              >
                Laurence Wayne
              </a>
              , a developer passionate about environmental issues and finding
              practical ways to solve them. Making hidden data visible is one
              small step toward better understanding — and better outcomes — for
              England's rivers.
            </p>
            <p className="text-lg text-slate-600 leading-relaxed mb-8">
              Have questions, ideas, or feedback? I'd love to hear from you.
            </p>
            <div className="flex items-center justify-center gap-6">
              <a
                href="mailto:hello@laurence-wayne.com"
                className="inline-flex items-center gap-2 text-teal-700 hover:text-teal-900 font-medium transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="20" height="16" x="2" y="4" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
                hello@laurence-wayne.com
              </a>
              <a
                href="https://www.linkedin.com/in/laurencewayne/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-teal-700 hover:text-teal-900 font-medium transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                  <rect width="4" height="12" x="2" y="9" />
                  <circle cx="4" cy="4" r="2" />
                </svg>
                LinkedIn
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="py-12 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center">
          <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-teal-600 to-transparent mx-auto mb-8" />
          <p className="text-sm text-slate-400 mb-2">
            Data provided by the{" "}
            <a
              href="https://environment.data.gov.uk/water-quality/view/landing"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-600 hover:text-teal-800 underline transition-colors"
            >
              Environment Agency
            </a>{" "}
            via their open data API.
          </p>
          <p className="text-xs text-slate-300">
            © {new Date().getFullYear()} River Watch. Open-source and free to use.
          </p>
        </div>
      </footer>
    </div>
  );
}
