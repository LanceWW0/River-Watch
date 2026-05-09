"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
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
  // Initialise with target so SSR/static HTML shows real numbers for SEO
  const [value, setValue] = useState(target);

  useEffect(() => {
    // Reset to 0 on mount so the animation can run from zero
    if (!start) {
      setValue(0);
      return;
    }

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

/* ── Impact section components ─────────────────────────────── */

// Real numbers from the wq_index.json analysis
const STATUS_BREAKDOWN = [
  { key: "B", label: "Bad", count: 2115, color: "#dc2626", description: "Severely impacted" },
  { key: "P", label: "Poor", count: 613, color: "#f97316", description: "Failing standards" },
  { key: "M", label: "Moderate", count: 452, color: "#f59e0b", description: "Mixed picture" },
  { key: "G", label: "Good", count: 766, color: "#16a34a", description: "Meeting standards" },
  { key: "H", label: "Excellent", count: 1311, color: "#60a5fa", description: "Near-pristine" },
];

const TOP_POLLUTANTS = [
  { key: "ammonia", label: "Ammonia", count: 2218, hint: "Sewage & farm runoff" },
  { key: "bod", label: "BOD", count: 1022, hint: "Organic pollution load" },
  { key: "do_percent", label: "Dissolved Oxygen", count: 915, hint: "Suffocates aquatic life" },
  { key: "phosphate", label: "Phosphate", count: 840, hint: "Causes algal blooms" },
  { key: "ph", label: "pH", count: 262, hint: "Acidity / alkalinity" },
];

function DonutChart({ segments, visible }) {
  const total = segments.reduce((a, b) => a + b.count, 0);
  const radius = 70;
  const stroke = 28;
  const cx = 100;
  const cy = 100;

  let accumulated = 0;
  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-[260px]" role="img" aria-label="Water quality status breakdown">
      {/* Track */}
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />

      {segments.map((s, i) => {
        const pct = (s.count / total) * 100;
        const dashArray = visible ? `${pct} ${100 - pct}` : `0 100`;
        const offset = -accumulated;
        accumulated += pct;
        return (
          <circle
            key={s.key}
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            pathLength="100"
            strokeDasharray={dashArray}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
            style={{
              transition: `stroke-dasharray 1.2s cubic-bezier(0.16, 1, 0.3, 1) ${i * 120}ms`,
            }}
          />
        );
      })}

      {/* Centre label */}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 28,
          fill: "#0f172a",
          fontWeight: 700,
        }}
      >
        {total.toLocaleString()}
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        style={{ fontSize: 11, fill: "#64748b", letterSpacing: "0.05em" }}
      >
        SCORED SITES
      </text>
    </svg>
  );
}

function StatusRow({ label, count, color, description, total, delay, visible }) {
  const pct = ((count / total) * 100).toFixed(1);
  return (
    <div
      className="flex items-center gap-4 py-2 transition-all duration-700 ease-out"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0)" : "translateX(-12px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold text-slate-900">{label}</span>
          <span className="text-sm tabular-nums text-slate-600">
            <span className="font-bold" style={{ color }}>
              {pct}%
            </span>
            <span className="text-slate-400 ml-2">{count.toLocaleString()}</span>
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
    </div>
  );
}

function PollutantBar({ label, count, hint, max, delay, visible }) {
  const widthPct = (count / max) * 100;
  return (
    <div
      className="transition-opacity duration-700"
      style={{
        opacity: visible ? 1 : 0,
        transitionDelay: `${delay}ms`,
      }}
    >
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-semibold text-slate-900">{label}</span>
          <span className="text-xs text-slate-500 truncate">{hint}</span>
        </div>
        <span className="text-sm font-bold text-slate-900 tabular-nums flex-shrink-0">
          {count.toLocaleString()}
          <span className="text-xs font-medium text-slate-400 ml-1">sites</span>
        </span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all ease-out"
          style={{
            width: visible ? `${widthPct}%` : "0%",
            background: "linear-gradient(90deg, #f97316, #dc2626)",
            transitionDuration: "1400ms",
            transitionDelay: `${delay + 200}ms`,
          }}
        />
      </div>
    </div>
  );
}

function ImpactSection() {
  const [ref, visible] = useReveal(0.15);

  // Headline animated number: % Poor or Bad
  const poorBadCount = useCountUp(2728, 1800, visible);
  const totalScored = STATUS_BREAKDOWN.reduce((a, b) => a + b.count, 0);
  const maxPollutant = TOP_POLLUTANTS[0].count;

  return (
    <section
      className="py-24 px-4 bg-gradient-to-b from-white to-slate-50"
      ref={ref}
    >
      <div className="max-w-6xl mx-auto">
        {/* Eyebrow */}
        <div className="text-center mb-3">
          <span className="inline-block text-xs font-semibold tracking-widest text-teal-700 uppercase">
            What the data shows
          </span>
        </div>

        {/* Headline */}
        <h2
          className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 text-center mb-4 leading-tight"
          style={{ fontFamily: "'DM Serif Display', serif" }}
        >
          Over half of monitored waters score{" "}
          <span className="text-orange-600">Poor</span>
          {" or "}
          <span className="text-red-600">Bad</span>
          .
        </h2>
        <p className="text-center text-slate-500 mb-16 max-w-2xl mx-auto leading-relaxed">
          We pulled health classifications for{" "}
          <span className="font-semibold text-slate-700">5,462</span> Environment
          Agency monitoring sites across England.{" "}
          <span className="font-semibold text-slate-700">
            {poorBadCount.toLocaleString()} ({((2728 / totalScored) * 100).toFixed(1)}%)
          </span>{" "}
          fall below acceptable health standards.
        </p>

        {/* Donut + breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-20">
          <div className="flex justify-center">
            <DonutChart segments={STATUS_BREAKDOWN} visible={visible} />
          </div>
          <div className="space-y-1">
            <h3
              className="text-xl font-bold text-slate-900 mb-4"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              Health classification breakdown
            </h3>
            {STATUS_BREAKDOWN.map((s, i) => {
              const { key, ...rest } = s;
              return (
                <StatusRow
                  key={key}
                  {...rest}
                  total={totalScored}
                  delay={i * 100}
                  visible={visible}
                />
              );
            })}
          </div>
        </div>

        {/* Top pollutants */}
        <div className="bg-white/80 backdrop-blur rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-200/60">
          <div className="mb-6">
            <h3
              className="text-xl sm:text-2xl font-bold text-slate-900 mb-2"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              The pollutants driving the failures
            </h3>
            <p className="text-sm text-slate-500">
              Each site's worst-scoring indicator. Ammonia and BOD — both
              markers of sewage and organic pollution — dominate.
            </p>
          </div>

          <div className="space-y-4">
            {TOP_POLLUTANTS.map((p, i) => {
              const { key, ...rest } = p;
              return (
                <PollutantBar
                  key={key}
                  {...rest}
                  max={maxPollutant}
                  delay={i * 120}
                  visible={visible}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
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

  const samplingPoints = useCountUp(111000, 2200, statsVisible);
  const measurements = useCountUp(60000000, 2600, statsVisible);

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
            href="/map"
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

      {/* ── Impact / data findings ───────────────────────── */}
      <ImpactSection />

      {/* ── Stats ────────────────────────────────────────── */}
      <SectionDivider from="#f8fafc" to="#0f172a" />
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
                never read. River Watch exists to change that — to take this complex,
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
              src={avatarImg.src}
              alt="Laurence Wayne"
              className="w-24 h-24 rounded-full object-cover mx-auto mb-6 shadow-md ring-4 ring-teal-50"
            />
            <p className="text-lg text-slate-600 leading-relaxed mb-6">
              River Watch is built by{" "}
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
