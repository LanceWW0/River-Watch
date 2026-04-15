"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// Layer configuration for visual differentiation
const LAYER_CONFIG = {
  "water-quality": {
    color: "#3b82f6",
    borderColor: "#2563eb",
    bgColor: "#eff6ff",
    label: "Water Quality",
    chartColor: "#3b82f6",
  },
  fish: {
    color: "#16a34a",
    borderColor: "#15803d",
    bgColor: "#f0fdf4",
    label: "Fish Survey",
    chartColor: "#16a34a",
  },
  invertebrates: {
    color: "#d97706",
    borderColor: "#b45309",
    bgColor: "#fffbeb",
    label: "Invertebrates",
    chartColor: "#d97706",
  },
};

// Invertebrate index information with thresholds
const INV_INDEX_INFO = {
  BMWP_TOTAL: {
    name: "BMWP Score",
    description: "River health indicator. Above 100 is good, below 50 is poor.",
    thresholds: [
      { value: 100, label: "Good", color: "#22c55e" },
      { value: 50, label: "Moderate", color: "#eab308" },
    ],
    goodAbove: 100,
  },
  BMWP_ASPT: {
    name: "Avg Score Per Taxon",
    description: "Average sensitivity of species. Above 6 suggests clean water.",
    thresholds: [
      { value: 6, label: "Good", color: "#22c55e" },
      { value: 5, label: "Moderate", color: "#eab308" },
    ],
    goodAbove: 6,
  },
  BMWP_N_TAXA: {
    name: "Number of Taxa",
    description: "Number of invertebrate families found. More = healthier.",
    thresholds: [],
  },
  WHPT_TOTAL: {
    name: "WHPT Total Score",
    description: "Modern replacement for BMWP. Higher = healthier.",
    thresholds: [
      { value: 100, label: "Good", color: "#22c55e" },
      { value: 50, label: "Moderate", color: "#eab308" },
    ],
    goodAbove: 100,
  },
  WHPT_ASPT: {
    name: "WHPT Avg Score Per Taxon",
    description: "Higher = cleaner water.",
    thresholds: [
      { value: 6, label: "Good", color: "#22c55e" },
      { value: 5, label: "Moderate", color: "#eab308" },
    ],
    goodAbove: 6,
  },
  LIFE_FAMILY_INDEX: {
    name: "LIFE Index",
    description: "Flow sensitivity. Detects drought and abstraction impacts.",
    thresholds: [],
  },
  PSI_FAMILY_SCORE: {
    name: "PSI Score",
    description: "Sediment sensitivity. Lower = more siltation.",
    thresholds: [],
  },
  DEHLI: {
    name: "DEHLI",
    description: "Headwater health index.",
    thresholds: [],
  },
};

// Key determinands the public would care about, with WFD-style thresholds
const DETERMINAND_INFO = {
  "0111": {
    name: "Ammonia",
    unit: "mg/l",
    description: "Sewage & pollution indicator. Lower is better.",
    thresholds: [
      { value: 0.3, label: "Excellent", color: "#22c55e" },
      { value: 0.6, label: "Good", color: "#84cc16" },
      { value: 1.1, label: "Moderate", color: "#eab308" },
      { value: 2.5, label: "Poor", color: "#f97316" },
    ],
    badAbove: 2.5,
  },
  "0076": {
    name: "Water Temperature",
    unit: "°C",
    description: "Affects dissolved oxygen and aquatic life.",
    thresholds: [],
  },
  "0085": {
    name: "BOD (Biochemical Oxygen Demand)",
    unit: "mg/l",
    description: "Organic pollution. Lower is better.",
    thresholds: [
      { value: 4, label: "Good", color: "#22c55e" },
      { value: 6, label: "Moderate", color: "#eab308" },
      { value: 7.5, label: "Poor", color: "#f97316" },
    ],
    badAbove: 7.5,
  },
  "0117": {
    name: "Nitrate",
    unit: "mg/l",
    description: "Agricultural runoff indicator. High levels harm ecosystems.",
    thresholds: [],
  },
  "0180": {
    name: "Orthophosphate",
    unit: "mg/l",
    description: "Causes algal blooms. Lower is better.",
    thresholds: [
      { value: 0.036, label: "Excellent", color: "#22c55e" },
      { value: 0.069, label: "Good", color: "#84cc16" },
      { value: 0.174, label: "Moderate", color: "#eab308" },
      { value: 0.466, label: "Poor", color: "#f97316" },
    ],
    badAbove: 0.466,
  },
  "9901": {
    name: "Dissolved Oxygen",
    unit: "% saturation",
    description: "Essential for aquatic life. Higher is better.",
    thresholds: [
      { value: 80, label: "Good", color: "#22c55e" },
      { value: 60, label: "Moderate", color: "#eab308" },
      { value: 50, label: "Poor", color: "#f97316" },
    ],
    goodAbove: 80,
  },
  "0061": {
    name: "pH",
    unit: "pH units",
    description: "Acidity/alkalinity. Rivers are typically 6.5–8.5.",
    thresholds: [],
  },
};

const DETERMINAND_PRIORITY = [
  "0111",
  "9901",
  "0085",
  "0180",
  "0117",
  "0076",
  "0061",
];

// Priority order for semantic determinand keys (from wq_config)
const WQ_DETERMINAND_PRIORITY = [
  "ammonia",
  "do_percent",
  "bod",
  "phosphate",
  "nitrate",
  "ph",
  "temperature",
  "conductivity",
  "ss",
  "total_oxidised_n",
  "ss_alt",
];

// Descriptions for semantic determinand keys
const WQ_DETERMINAND_DESCRIPTIONS = {
  ammonia: "Sewage & pollution indicator. Lower is better.",
  do_percent: "Essential for aquatic life. Higher is better.",
  bod: "Organic pollution. Lower is better.",
  phosphate: "Causes algal blooms. Lower is better.",
  nitrate: "Agricultural runoff indicator. High levels harm ecosystems.",
  ph: "Acidity/alkalinity. Rivers are typically 6.5–8.5.",
  temperature: "Affects dissolved oxygen and aquatic life.",
  conductivity: "Measure of dissolved ions in water.",
  ss: "Suspended particles in water.",
  total_oxidised_n: "Combined nitrate and nitrite levels.",
  ss_alt: "Suspended solids (alternative measure).",
};

function parseObservations(members) {
  const grouped = {};

  for (const obs of members) {
    const code = obs.observedProperty?.notation;
    const name = obs.observedProperty?.prefLabel || code;
    const time = obs.phenomenonTime;
    const unit = obs.hasResult?.hasUnit?.prefLabel || obs.hasUnit || "";

    let value = obs.hasResult?.numericValue;
    if (value === null || value === undefined) {
      value = obs.hasResult?.upperBound;
    }
    if (value === null || value === undefined) continue;

    if (!grouped[code]) {
      grouped[code] = { code, name, unit, data: [] };
    }

    grouped[code].data.push({
      date: time,
      timestamp: new Date(time).getTime(),
      value: parseFloat(value),
    });
  }

  for (const key of Object.keys(grouped)) {
    grouped[key].data.sort((a, b) => a.timestamp - b.timestamp);
  }

  return grouped;
}

function sortGroups(groups) {
  return Object.values(groups).sort((a, b) => {
    const aIdx = DETERMINAND_PRIORITY.indexOf(a.code);
    const bIdx = DETERMINAND_PRIORITY.indexOf(b.code);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

function sortWqGroups(groups) {
  return Object.values(groups).sort((a, b) => {
    const aIdx = WQ_DETERMINAND_PRIORITY.indexOf(a.code);
    const bIdx = WQ_DETERMINAND_PRIORITY.indexOf(b.code);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Build threshold array from wqConfig for DeterminandChart.
 * Converts wqConfig.thresholds[key] to the [{value, label, color}] format.
 */
function buildThresholdsFromConfig(key, wqConfig) {
  if (!wqConfig?.thresholds?.[key]) return [];
  const t = wqConfig.thresholds[key];
  const statusColors = {
    High: "#60a5fa",
    Good: "#22c55e",
    Moderate: "#eab308",
    Poor: "#f97316",
    Bad: "#dc2626",
  };
  const statusLabels = ["Excellent", "Good", "Moderate", "Poor"];

  if (t.direction === "range") return []; // pH range-based, skip threshold lines

  const boundaries = t.boundaries || [];
  return boundaries.map((val, i) => ({
    value: val,
    label: statusLabels[i] || "",
    color: statusColors[statusLabels[i]] || "#9ca3af",
  }));
}

/* ── Plain-English summary generator ───────────────────────── */

function generateSummary(observations) {
  const groups = Object.values(observations);
  if (groups.length === 0) return null;

  // ── Basic stats ──
  let totalReadings = 0;
  let earliestTs = Infinity;
  for (const g of groups) {
    totalReadings += g.data.length;
    for (const d of g.data) {
      if (d.timestamp < earliestTs) earliestTs = d.timestamp;
    }
  }
  const numIndicators = groups.length;
  const earliestYear = new Date(earliestTs).getFullYear();

  const sentences = [];
  sentences.push(
    `This site has been monitored since ${earliestYear} with ${totalReadings.toLocaleString()} measurements across ${numIndicators} indicator${numIndicators !== 1 ? "s" : ""}.`
  );

  // ── Trend detection for key determinands with thresholds ──
  const trendCodes = DETERMINAND_PRIORITY.filter(
    (code) =>
      observations[code] &&
      DETERMINAND_INFO[code]?.thresholds?.length > 0 &&
      observations[code].data.length >= 4
  );

  const trends = [];
  for (const code of trendCodes) {
    const info = DETERMINAND_INFO[code];
    const data = observations[code].data;
    const firstYear = new Date(data[0].timestamp).getFullYear();
    const lastYear = new Date(data[data.length - 1].timestamp).getFullYear();
    if (firstYear === lastYear) continue;

    const avgForYear = (year) => {
      const vals = data.filter(
        (d) => new Date(d.timestamp).getFullYear() === year
      );
      if (vals.length === 0) return null;
      return vals.reduce((s, v) => s + v.value, 0) / vals.length;
    };

    const firstAvg = avgForYear(firstYear);
    const lastAvg = avgForYear(lastYear);
    if (firstAvg === null || lastAvg === null) continue;

    const isHigherBetter = !!info.goodAbove;
    const ratio = firstAvg !== 0 ? (lastAvg - firstAvg) / Math.abs(firstAvg) : 0;

    let direction;
    if (isHigherBetter) {
      direction = ratio > 0.2 ? "improved" : ratio < -0.2 ? "worsened" : "remained stable";
    } else {
      direction = ratio < -0.2 ? "improved" : ratio > 0.2 ? "worsened" : "remained stable";
    }

    // Spike detection: max in last 2 years vs "Poor" threshold
    const twoYearsAgo = lastYear - 2;
    const recentData = data.filter(
      (d) => new Date(d.timestamp).getFullYear() >= twoYearsAgo
    );
    const recentMax = Math.max(...recentData.map((d) => d.value));
    const poorThreshold = [...info.thresholds].sort((a, b) => b.value - a.value)[0]?.value;
    const hasSpikes =
      !isHigherBetter &&
      poorThreshold != null &&
      recentMax > poorThreshold &&
      direction !== "worsened";

    trends.push({
      code,
      name: info.name,
      direction,
      hasSpikes,
      magnitude: Math.abs(ratio),
    });
  }

  // Pick up to 2 most notable trends (prefer non-stable, then by magnitude)
  trends.sort((a, b) => {
    const aStable = a.direction === "remained stable" ? 1 : 0;
    const bStable = b.direction === "remained stable" ? 1 : 0;
    if (aStable !== bStable) return aStable - bStable;
    return b.magnitude - a.magnitude;
  });

  const notable = trends.slice(0, 2);
  for (const t of notable) {
    let s = `${t.name} levels have generally ${t.direction} over time`;
    if (t.hasSpikes) s += " but show occasional spikes";
    s += ".";
    sentences.push(s);
  }

  // ── Current state characterisation ──
  const statuses = [];
  for (const code of trendCodes) {
    const info = DETERMINAND_INFO[code];
    const data = observations[code].data;
    if (data.length === 0) continue;
    const latest = data[data.length - 1].value;

    let status;
    if (info.goodAbove) {
      status =
        latest >= info.thresholds[0].value
          ? "good"
          : latest >= info.thresholds[1].value
            ? "moderate"
            : "poor";
    } else {
      const sorted = [...info.thresholds].sort((a, b) => a.value - b.value);
      status = "good";
      for (const t of sorted) {
        if (latest > t.value) {
          status =
            t.color === "#22c55e" || t.color === "#84cc16"
              ? "moderate"
              : t.color === "#eab308"
                ? "poor"
                : "bad";
        }
      }
    }
    statuses.push({ code, name: info.name, status });
  }

  if (statuses.length > 0) {
    const good = statuses.filter((s) => s.status === "good").length;
    const poor = statuses.filter(
      (s) => s.status === "poor" || s.status === "bad"
    );
    const total = statuses.length;

    let qualityPhrase;
    if (good === total) {
      qualityPhrase = "Latest readings suggest good water quality.";
    } else if (poor.length > 0) {
      const concernNames = poor.map((p) => p.name).join(" and ");
      qualityPhrase = `Latest readings suggest mixed water quality, with ${concernNames} levels of concern.`;
    } else {
      qualityPhrase = "Latest readings suggest moderate water quality.";
    }
    sentences.push(qualityPhrase);
  }

  return sentences.join(" ");
}

/* ── Shared time axis helpers ──────────────────────────────── */

function computeSharedTimeDomain(groups) {
  let min = Infinity;
  let max = -Infinity;

  for (const g of Object.values(groups)) {
    for (const d of g.data) {
      if (d.timestamp < min) min = d.timestamp;
      if (d.timestamp > max) max = d.timestamp;
    }
  }

  if (min === Infinity) return { domain: [0, 1], ticks: [] };

  // Snap domain to Jan 1st of the bounding years
  const minDate = new Date(min);
  const maxDate = new Date(max);
  const startYear = minDate.getFullYear();
  const endYear = maxDate.getFullYear() + 1;
  const domainMin = new Date(startYear, 0, 1).getTime();
  const domainMax = new Date(endYear, 0, 1).getTime();

  const yearSpan = endYear - startYear;

  // Choose tick interval based on data span
  const ticks = [];
  if (yearSpan <= 3) {
    // Quarterly ticks
    for (let y = startYear; y <= endYear; y++) {
      for (let q = 0; q < 4; q++) {
        const t = new Date(y, q * 3, 1).getTime();
        if (t >= domainMin && t <= domainMax) ticks.push(t);
      }
    }
  } else if (yearSpan <= 10) {
    // Yearly ticks
    for (let y = startYear; y <= endYear; y++) {
      ticks.push(new Date(y, 0, 1).getTime());
    }
  } else {
    // Every 2 or 5 years
    const step = yearSpan <= 20 ? 2 : 5;
    const firstTick = Math.ceil(startYear / step) * step;
    for (let y = firstTick; y <= endYear; y += step) {
      ticks.push(new Date(y, 0, 1).getTime());
    }
  }

  return { domain: [domainMin, domainMax], ticks, yearSpan };
}

function formatTickLabel(timestamp, yearSpan) {
  const d = new Date(timestamp);
  if (yearSpan <= 3) {
    // Show "Jan 20", "Apr 20" etc for quarterly
    return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  }
  // Just show year for longer spans
  return d.getFullYear().toString();
}

/* ── Animations ────────────────────────────────────────────── */

const styleSheet = `
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
`;

/* ── Skeleton loading placeholders ─────────────────────────── */

function SkeletonBlock({ width, height, style = {} }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 6,
        background:
          "linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%)",
        backgroundSize: "800px 100%",
        animation: "shimmer 1.8s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

function SkeletonChart({ delay = 0 }) {
  return (
    <div
      style={{
        marginBottom: 24,
        animation: `fadeInUp 0.3s ease ${delay}ms both`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div>
          <SkeletonBlock width={140} height={14} />
          <SkeletonBlock width={200} height={10} style={{ marginTop: 6 }} />
        </div>
        <SkeletonBlock width={50} height={28} />
      </div>
      <SkeletonBlock width="100%" height={140} style={{ borderRadius: 8 }} />
      <SkeletonBlock width={120} height={10} style={{ marginTop: 6 }} />
    </div>
  );
}

/* ── Summary block ─────────────────────────────────────────── */

function SummaryBlock({ summary, loading }) {
  if (!summary && !loading) return null;

  if (!summary && loading) {
    return (
      <div
        style={{
          marginBottom: 20,
          padding: 14,
          borderRadius: 8,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          animation: "fadeInUp 0.3s ease both",
        }}
      >
        <SkeletonBlock width="90%" height={12} />
        <SkeletonBlock width="100%" height={12} style={{ marginTop: 6 }} />
        <SkeletonBlock width="70%" height={12} style={{ marginTop: 6 }} />
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 20,
        padding: 14,
        borderRadius: 8,
        background: "#f0f9ff",
        border: "1px solid #bae6fd",
        animation: "fadeInUp 0.35s ease both",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.55,
          color: "#334155",
        }}
      >
        {summary}
      </p>
    </div>
  );
}

/* ── Determinand breakdown from tile detail ───────────────── */

const TREND_ARROWS = {
  improving: { arrow: "\u2191", color: "#16a34a", label: "Improving" },
  declining: { arrow: "\u2193", color: "#dc2626", label: "Declining" },
  stable: { arrow: "\u2192", color: "#64748b", label: "Stable" },
  insufficient_data: { arrow: "\u2022", color: "#94a3b8", label: "Insufficient data" },
};

function DeterminandBreakdown({ detail, wqConfig, worstDeterminand }) {
  if (!detail?.determinands) return null;

  const statusColors = {};
  if (wqConfig?.statuses) {
    for (const [key, val] of Object.entries(wqConfig.statuses)) {
      statusColors[key] = val.color;
    }
  }

  const entries = Object.entries(detail.determinands);
  // Sort by WQ priority
  entries.sort((a, b) => {
    const aIdx = WQ_DETERMINAND_PRIORITY.indexOf(a[0]);
    const bIdx = WQ_DETERMINAND_PRIORITY.indexOf(b[0]);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return 0;
  });

  return (
    <div
      style={{
        marginBottom: 20,
        animation: "fadeInUp 0.35s ease both",
      }}
    >
      <h4
        style={{
          margin: "0 0 8px",
          fontSize: 12,
          fontWeight: 600,
          color: "#64748b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Determinand Summary
      </h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {entries.map(([key, det]) => {
          const isWorst = key === worstDeterminand;
          const statusColor = statusColors[det.status] || "#9ca3af";
          const trend = TREND_ARROWS[det.trend] || TREND_ARROWS.insufficient_data;

          return (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 8,
                background: isWorst ? "#fef2f2" : "#f8fafc",
                border: `1px solid ${isWorst ? "#fecaca" : "#e2e8f0"}`,
              }}
            >
              {/* Status dot */}
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: statusColor,
                  flexShrink: 0,
                }}
              />

              {/* Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: isWorst ? 700 : 500,
                    color: "#1e293b",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {det.label || key}
                  {isWorst && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 9,
                        fontWeight: 600,
                        color: "#dc2626",
                        background: "#fee2e2",
                        padding: "1px 5px",
                        borderRadius: 99,
                        textTransform: "uppercase",
                      }}
                    >
                      Worst
                    </span>
                  )}
                </div>
              </div>

              {/* Trend */}
              <span
                style={{
                  fontSize: 14,
                  color: trend.color,
                  flexShrink: 0,
                }}
                title={trend.label}
              >
                {trend.arrow}
              </span>

              {/* Mean value */}
              <div style={{ textAlign: "right", flexShrink: 0, minWidth: 55 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>
                  {det.mean != null ? det.mean.toFixed(2) : "–"}
                </span>
                <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 2 }}>
                  {det.unit}
                </span>
              </div>

              {/* Status badge */}
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: "white",
                  background: statusColor,
                  padding: "2px 6px",
                  borderRadius: 99,
                  flexShrink: 0,
                  textTransform: "uppercase",
                  letterSpacing: "0.03em",
                }}
              >
                {det.status === "High" ? "Excellent" : det.status || "–"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Chart component ───────────────────────────────────────── */

function DeterminandChart({
  group,
  animDelay = 0,
  isStreaming,
  timeDomain,
  hoveredTimestamp,
  onHoverTimestamp,
  chartColor = "#3b82f6",
  dataType = "water-quality",
  wqConfig = null,
}) {
  // Get info based on data type
  let info, displayName, description, thresholds;

  if (dataType === "invertebrates") {
    info = INV_INDEX_INFO[group.code];
    displayName = info?.name || group.name;
    description = info?.description || group.description || "";
    thresholds = info?.thresholds || [];
  } else if (dataType === "fish") {
    info = null;
    displayName = group.name || group.code;
    description = "Fish population count over time.";
    thresholds = [];
  } else if (dataType === "water-quality-static" && wqConfig) {
    // Semantic key lookup from wqConfig
    const detConfig = wqConfig.determinands?.[group.code];
    displayName = detConfig?.label || group.name || group.code;
    description = WQ_DETERMINAND_DESCRIPTIONS[group.code] || "";
    thresholds = buildThresholdsFromConfig(group.code, wqConfig);
    // Check if this determinand has higher_is_better direction
    const direction = wqConfig.thresholds?.[group.code]?.direction;
    info = direction === "higher_is_better" ? { goodAbove: thresholds[0]?.value } : null;
  } else {
    info = DETERMINAND_INFO[group.code];
    displayName = info?.name || group.name;
    description = info?.description || "";
    thresholds = info?.thresholds || [];
  }

  const latestValue =
    group.data.length > 0 ? group.data[group.data.length - 1].value : null;
  const latestDate =
    group.data.length > 0 ? group.data[group.data.length - 1].date : null;

  let statusColor = "#6b7280";
  let statusLabel = "";
  if (thresholds.length > 0 && latestValue !== null) {
    if (info?.goodAbove) {
      if (latestValue >= thresholds[0].value) {
        statusColor = "#22c55e";
        statusLabel = "Good";
      } else if (latestValue >= thresholds[1].value) {
        statusColor = "#eab308";
        statusLabel = "Moderate";
      } else {
        statusColor = "#ef4444";
        statusLabel = "Poor";
      }
    } else {
      const sorted = [...thresholds].sort((a, b) => a.value - b.value);
      statusColor = "#22c55e";
      statusLabel = "Good";
      for (const t of sorted) {
        if (latestValue > t.value) {
          statusColor =
            t.color === "#22c55e" || t.color === "#84cc16" || t.color === "#2563eb"
              ? "#eab308"
              : t.color === "#eab308"
                ? "#f97316"
                : "#ef4444";
          statusLabel =
            t.color === "#22c55e" || t.color === "#84cc16" || t.color === "#2563eb"
              ? "Moderate"
              : t.color === "#eab308"
                ? "Poor"
                : "Bad";
        }
      }
    }
  }

  const yearSpan = timeDomain?.yearSpan || 10;

  return (
    <div
      style={{
        marginBottom: 24,
        animation: `fadeInUp 0.35s ease ${animDelay}ms both`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 4,
        }}
      >
        <div>
          <h4
            style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 600,
              color: "#1e293b",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {displayName}
            {isStreaming && (
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#3b82f6",
                  animation: "pulse 1.2s ease-in-out infinite",
                }}
              />
            )}
          </h4>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "#64748b" }}>
            {description}
          </p>
        </div>
        {latestValue !== null && (
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: statusColor }}>
              {latestValue}
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 4 }}>
              {group.unit}
            </span>
            {statusLabel && (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: statusColor,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {statusLabel}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ width: "100%", height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={group.data}
            margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
            onMouseMove={(state) => {
              if (state?.isTooltipActive && state?.activeLabel != null) {
                onHoverTimestamp(state.activeLabel);
              }
            }}
            onMouseLeave={() => onHoverTimestamp(null)}
          >
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={timeDomain?.domain || ["dataMin", "dataMax"]}
              ticks={timeDomain?.ticks}
              tickFormatter={(ts) => formatTickLabel(ts, yearSpan)}
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={{ stroke: "#e2e8f0" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <ReferenceLine
              x={hoveredTimestamp}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="3 3"
              style={{ opacity: hoveredTimestamp ? 1 : 0 }}
              ifOverflow="hidden"
            />
            {thresholds.map((t, i) => (
              <ReferenceLine
                key={i}
                y={t.value}
                stroke={t.color}
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            ))}
            <Tooltip
              position={{ x: undefined, y: undefined }}
              offset={-80}
              contentStyle={{
                fontSize: 12,
                background: "#1e293b",
                border: "none",
                borderRadius: 6,
                color: "#f1f5f9",
                padding: "6px 10px",
              }}
              wrapperStyle={{ pointerEvents: "none" }}
              allowEscapeViewBox={{ x: true, y: false }}
              labelFormatter={(ts) =>
                new Date(ts).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              }
              formatter={(val) => [`${val} ${group.unit}`, displayName]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={chartColor}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, fill: chartColor }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
        {group.data.length} readings
        {latestDate &&
          ` · Latest: ${new Date(latestDate).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}`}
      </div>
    </div>
  );
}

/* ── Fish/Invertebrate summary generators ─────────────────── */

function generateFishSummary(data, siteInfo) {
  if (!data || data.length === 0) return null;

  const speciesCount = data.length;
  let totalSurveys = 0;
  let earliestTs = Infinity;
  let latestTs = -Infinity;

  for (const species of data) {
    for (const d of species.data) {
      if (d.timestamp < earliestTs) earliestTs = d.timestamp;
      if (d.timestamp > latestTs) latestTs = d.timestamp;
    }
    totalSurveys = Math.max(totalSurveys, species.data.length);
  }

  const earliestYear = new Date(earliestTs).getFullYear();
  const latestYear = new Date(latestTs).getFullYear();

  // Find dominant species (highest total count)
  let dominant = data[0];
  let maxTotal = 0;
  for (const species of data) {
    const total = species.data.reduce((sum, d) => sum + d.value, 0);
    if (total > maxTotal) {
      maxTotal = total;
      dominant = species;
    }
  }

  const sentences = [];
  sentences.push(`This site has recorded ${speciesCount} fish species across ${totalSurveys} surveys from ${earliestYear} to ${latestYear}.`);

  if (dominant) {
    const dominantName = dominant.code || dominant.name;
    sentences.push(`${dominantName} is the most commonly recorded species.`);
  }

  return sentences.join(" ");
}

function generateInvSummary(data, siteInfo) {
  if (!data || data.length === 0) return null;

  const sentences = [];
  const bmwp = data.find(d => d.code === "BMWP_TOTAL");
  const aspt = data.find(d => d.code === "BMWP_ASPT" || d.code === "WHPT_ASPT");

  if (siteInfo?.totalSamples) {
    sentences.push(`This site has been sampled ${siteInfo.totalSamples} times.`);
  }

  if (bmwp && bmwp.data.length > 0) {
    const latest = bmwp.data[bmwp.data.length - 1].value;
    let quality = "poor";
    if (latest >= 100) quality = "good";
    else if (latest >= 50) quality = "moderate";
    sentences.push(`The latest BMWP score of ${latest} indicates ${quality} river health.`);
  }

  if (aspt && aspt.data.length > 0) {
    const latest = aspt.data[aspt.data.length - 1].value.toFixed(2);
    const cleanWater = parseFloat(latest) >= 6 ? "suggesting clean water" : "indicating some pollution pressure";
    sentences.push(`Average Score Per Taxon is ${latest}, ${cleanWater}.`);
  }

  return sentences.join(" ");
}

/* ── Side panel ────────────────────────────────────────────── */

export default function SidePanel({ selectedItem, onClose, wqConfig, getPointDetail }) {
  const [observations, setObservations] = useState({});
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [hoveredTimestamp, setHoveredTimestamp] = useState(null);
  const [tileDetail, setTileDetail] = useState(null);
  const [useStaticData, setUseStaticData] = useState(false);
  const abortRef = useRef(null);

  const dataType = selectedItem?.type || "water-quality";
  const itemData = selectedItem?.data;
  const layerConfig = LAYER_CONFIG[dataType];
  const isScored = dataType === "water-quality" && itemData?.scored;

  useEffect(() => {
    if (!selectedItem) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setProgress({ loaded: 0, total: 0 });
    setObservations({});
    setTileDetail(null);
    setUseStaticData(false);

    async function fetchData() {
      try {
        if (dataType === "water-quality") {
          // If scored, try loading tile detail + static timeseries first
          if (isScored && getPointDetail) {
            // Load tile detail for determinand breakdown
            const detail = await getPointDetail(
              itemData.id,
              itemData.lat,
              itemData.lon
            );
            if (!controller.signal.aborted) {
              setTileDetail(detail);
            }

            // Try static timeseries
            const safeId = itemData.id.replace(/\//g, "_");
            try {
              const tsRes = await fetch(`/data/wq/timeseries/${safeId}.json`, {
                signal: controller.signal,
              });
              if (tsRes.ok) {
                const tsData = await tsRes.json();
                const grouped = {};
                for (const [key, series] of Object.entries(tsData)) {
                  const detConfig = wqConfig?.determinands?.[key];
                  grouped[key] = {
                    code: key,
                    name: detConfig?.label || key,
                    unit: detConfig?.unit || "",
                    data: series.dates.map((d, i) => ({
                      date: d,
                      timestamp: new Date(d).getTime(),
                      value: series.values[i],
                    })),
                  };
                }
                // Sort each group's data by timestamp
                for (const g of Object.values(grouped)) {
                  g.data.sort((a, b) => a.timestamp - b.timestamp);
                }
                if (!controller.signal.aborted) {
                  setObservations(grouped);
                  setUseStaticData(true);
                  setProgress({
                    loaded: Object.keys(grouped).length,
                    total: Object.keys(grouped).length,
                  });
                  setLoading(false);
                }
                return;
              }
            } catch (err) {
              if (err.name === "AbortError") return;
              // Fall through to EA API
            }
          }

          // Fallback: EA API pagination
          const point = itemData;
          const notation = point.notation || point.id;
          let allMembers = [];
          let skip = 0;
          let total = Infinity;

          while (skip < total) {
            const res = await fetch(
              `/api/observation?notation=${notation}&skip=${skip}&limit=250`,
              {
                headers: {
                  accept: "application/ld+json",
                  "API-Version": "1",
                },
                signal: controller.signal,
              }
            );
            const data = await res.json();
            total = data.totalItems || 0;
            const members = data.member || [];
            allMembers = [...allMembers, ...members];
            skip += 250;

            setProgress({ loaded: allMembers.length, total });

            const grouped = parseObservations(allMembers);
            setObservations(grouped);

            if (members.length < 250) break;
          }
        } else if (dataType === "fish") {
          // Static JSON fetch for fish data
          const res = await fetch(
            `/data/fish_observations/${itemData.siteId}.json`,
            { signal: controller.signal }
          );
          if (res.ok) {
            const data = await res.json();
            // Transform to grouped format
            const grouped = {};
            for (const species of data.species || []) {
              grouped[species.code] = {
                code: species.code,
                name: species.name,
                unit: species.unit || "count",
                data: species.data.map((d) => ({
                  date: new Date(d.timestamp).toISOString(),
                  timestamp: d.timestamp,
                  value: d.value,
                })),
              };
            }
            setObservations(grouped);
            setProgress({ loaded: Object.keys(grouped).length, total: Object.keys(grouped).length });
          }
        } else if (dataType === "invertebrates") {
          // Static JSON fetch for invertebrate data
          const res = await fetch(
            `/data/inv_observations/${itemData.siteId}.json`,
            { signal: controller.signal }
          );
          if (res.ok) {
            const data = await res.json();
            // Transform to grouped format
            const grouped = {};
            for (const det of data.determinands || []) {
              grouped[det.code] = {
                code: det.code,
                name: det.name,
                unit: det.unit || "score",
                description: det.description,
                data: det.data.map((d) => ({
                  date: new Date(d.timestamp).toISOString(),
                  timestamp: d.timestamp,
                  value: d.value,
                })),
              };
            }
            setObservations(grouped);
            setProgress({ loaded: Object.keys(grouped).length, total: Object.keys(grouped).length });
          }
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Error fetching data:", err);
        }
      }
      setLoading(false);
    }

    fetchData();

    return () => controller.abort();
  }, [selectedItem, dataType, itemData, isScored, getPointDetail, wqConfig]);

  const summary = useMemo(() => {
    if (loading) return null;
    if (dataType === "fish") {
      return generateFishSummary(Object.values(observations), itemData);
    } else if (dataType === "invertebrates") {
      return generateInvSummary(Object.values(observations), itemData);
    } else {
      return generateSummary(observations);
    }
  }, [observations, loading, dataType, itemData]);

  if (!selectedItem) return null;

  const effectiveDataType = useStaticData ? "water-quality-static" : dataType;
  const sortedGroups =
    effectiveDataType === "water-quality-static"
      ? sortWqGroups(observations)
      : effectiveDataType === "water-quality"
        ? sortGroups(observations)
        : Object.values(observations).sort((a, b) =>
            a.name.localeCompare(b.name)
          );
  const timeDomain = computeSharedTimeDomain(observations);
  const hasCharts = sortedGroups.length > 0;

  // Get display info based on data type
  let siteName, siteSubtitle, statusBadge, regionBadge;

  // Overall health status for scored WQ points
  // configKey looks up wq_config.json (uses "High"), displayLabel is user-facing ("Excellent")
  const STATUS_CONFIG_KEYS = { H: "High", G: "Good", M: "Moderate", P: "Poor", B: "Bad" };
  const STATUS_DISPLAY_LABELS = { H: "Excellent", G: "Good", M: "Moderate", P: "Poor", B: "Bad" };
  let overallStatusBadge = null;

  if (dataType === "water-quality") {
    const point = itemData;

    if (isScored) {
      // Scored point — show status prominently
      const statusLabel = STATUS_DISPLAY_LABELS[point.s] || "Unknown";
      const configKey = STATUS_CONFIG_KEYS[point.s] || "Unknown";
      const statusColor = wqConfig?.statuses?.[configKey]?.color || "#9ca3af";
      const worstDetLabel = wqConfig?.determinands?.[point.w]?.label || point.w;

      siteName = tileDetail?.label || point.id;
      siteSubtitle = tileDetail?.type || null;

      overallStatusBadge = {
        label: statusLabel,
        color: statusColor,
      };

      statusBadge = {
        label: statusLabel,
        bg: statusColor,
        color: "white",
      };
      regionBadge = `${point.n} samples · Latest: ${point.d}`;
    } else {
      // Unscored point — existing behaviour
      const isOpen = point.samplingPointStatus?.notation !== "C";
      siteName = point.prefLabel || point.altLabel;
      siteSubtitle = point.samplingPointType?.prefLabel;
      statusBadge = {
        label: isOpen ? "Active" : "Closed",
        bg: isOpen ? "#dcfce7" : "#f3f4f6",
        color: isOpen ? "#166534" : "#6b7280",
      };
      regionBadge = point.region?.prefLabel;
    }
  } else if (dataType === "fish") {
    siteName = itemData.name;
    siteSubtitle = itemData.waterbody ? `Waterbody: ${itemData.waterbody}` : itemData.area;
    statusBadge = {
      label: `${itemData.speciesCount || "?"} species`,
      bg: "#dcfce7",
      color: "#166534",
    };
    regionBadge = itemData.region;
  } else {
    siteName = itemData.name;
    siteSubtitle = itemData.catchment ? `Catchment: ${itemData.catchment}` : itemData.area;
    const bmwp = itemData.latestBmwp;
    let bmwpStatus = { label: "No BMWP", bg: "#f3f4f6", color: "#6b7280" };
    if (bmwp != null) {
      if (bmwp >= 100) bmwpStatus = { label: `BMWP ${bmwp}`, bg: "#dcfce7", color: "#166534" };
      else if (bmwp >= 50) bmwpStatus = { label: `BMWP ${bmwp}`, bg: "#fef3c7", color: "#92400e" };
      else bmwpStatus = { label: `BMWP ${bmwp}`, bg: "#fee2e2", color: "#991b1b" };
    }
    statusBadge = bmwpStatus;
    regionBadge = itemData.area;
  }

  return (
    <div
      style={{
        position: "absolute",
        top: "4rem",
        right: 0,
        width: 420,
        maxWidth: "100%",
        height: "calc(100% - 4rem)",
        background: "#ffffff",
        zIndex: 1000,
        boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        display: "flex",
        flexDirection: "column",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <style>{styleSheet}</style>

      {/* Header with colored accent */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #e2e8f0",
          borderLeft: `4px solid ${overallStatusBadge?.color || layerConfig.color}`,
          background: layerConfig.bgColor,
          flexShrink: 0,
        }}
      >
        {/* Layer type indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: layerConfig.color,
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: layerConfig.borderColor,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {layerConfig.label}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 700,
                color: "#0f172a",
                lineHeight: 1.3,
              }}
            >
              {siteName}
            </h2>
            {siteSubtitle && (
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                {siteSubtitle}
              </p>
            )}

            {/* Overall health status badge for scored points */}
            {overallStatusBadge && (
              <div
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 12px",
                  borderRadius: 99,
                  background: overallStatusBadge.color,
                  color: "white",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.02em",
                }}
              >
                {overallStatusBadge.label}
              </div>
            )}

            {/* Worst determinand for scored points */}
            {isScored && itemData.w && wqConfig?.determinands?.[itemData.w] && (
              <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>
                Worst indicator:{" "}
                <span style={{ fontWeight: 600, color: "#dc2626" }}>
                  {wqConfig.determinands[itemData.w].label}
                </span>
              </div>
            )}

            <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {!overallStatusBadge && (
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 99,
                    background: statusBadge.bg,
                    color: statusBadge.color,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {statusBadge.label}
                </span>
              )}
              {regionBadge && (
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 500,
                    padding: "2px 8px",
                    borderRadius: 99,
                    background: "#f1f5f9",
                    color: "#475569",
                  }}
                >
                  {regionBadge}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              fontSize: 20,
              color: "#94a3b8",
              lineHeight: 1,
              marginLeft: 8,
            }}
          >
            ✕
          </button>
        </div>

        {/* Progress bar */}
        {loading && (
          <div style={{ marginTop: 12 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 11, color: "#64748b", display: "flex", alignItems: "center", gap: 6 }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 20 20"
                  style={{ flexShrink: 0 }}
                >
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="32 18"
                    style={{
                      animation: "riverwatch-spin 0.8s linear infinite",
                      transformOrigin: "center",
                    }}
                  />
                </svg>
                Loading observations…
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: "#94a3b8",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {progress.loaded.toLocaleString()}
                {progress.total > 0 &&
                  ` / ${progress.total.toLocaleString()}`}
              </span>
            </div>
            <div
              style={{
                width: "100%",
                height: 3,
                background: "#e2e8f0",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                  borderRadius: 2,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
        }}
      >
        {/* Determinand breakdown for scored points */}
        {isScored && tileDetail && (
          <DeterminandBreakdown
            detail={tileDetail}
            wqConfig={wqConfig}
            worstDeterminand={itemData.w}
          />
        )}

        {/* Plain-English summary */}
        <SummaryBlock summary={summary} loading={loading} />

        {/* Real charts — appear progressively as data streams in */}
        {sortedGroups.map((group, i) => (
          <DeterminandChart
            key={group.code}
            group={group}
            animDelay={i * 60}
            isStreaming={loading}
            timeDomain={timeDomain}
            hoveredTimestamp={hoveredTimestamp}
            onHoverTimestamp={setHoveredTimestamp}
            chartColor={layerConfig.chartColor}
            dataType={effectiveDataType}
            wqConfig={wqConfig}
          />
        ))}

        {/* Skeleton placeholders while waiting for first batch */}
        {loading && !hasCharts && (
          <>
            <SkeletonChart delay={0} />
            <SkeletonChart delay={100} />
            <SkeletonChart delay={200} />
          </>
        )}

        {/* Empty state */}
        {!loading && !hasCharts && (
          <div
            style={{
              textAlign: "center",
              padding: "40px 0",
              color: "#94a3b8",
              fontSize: 14,
            }}
          >
            No observation data available for this site.
          </div>
        )}
      </div>
    </div>
  );
}
