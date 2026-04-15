"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

const LAYERS = [
  {
    key: "rivers",
    label: "Rivers",
    color: "#0ea5e9",
    emoji: "🌊",
    description: "River network overlay",
  },
  {
    key: "waterQuality",
    label: "Water Quality",
    color: "#3b82f6",
    emoji: "💧",
    description: "EA sampling points",
  },
  {
    key: "fish",
    label: "Fish Surveys",
    color: "#7c3aed",
    emoji: "🐟",
    description: "Fish population sites",
  },
  {
    key: "invertebrates",
    label: "Invertebrates",
    color: "#0d9488",
    emoji: "🦐",
    description: "River health monitoring",
  },
];

// Shared health palette colours (matches wq_config.json)
const HEALTH_COLORS = {
  High: "#60a5fa",
  Good: "#16a34a",
  Moderate: "#f59e0b",
  Poor: "#f97316",
  Bad: "#dc2626",
};

// WQ status filter chips
const WQ_STATUS_ORDER = [
  { code: "H", label: "Excellent", configKey: "High" },
  { code: "G", label: "Good", configKey: "Good" },
  { code: "M", label: "Moderate", configKey: "Moderate" },
  { code: "P", label: "Poor", configKey: "Poor" },
  { code: "B", label: "Bad", configKey: "Bad" },
  { code: "U", label: "Unscored", color: "#9ca3af" },
];

// Invertebrate status filter chips (BMWP 5-tier)
const INV_STATUS_ORDER = [
  { code: "E", label: "Excellent", configKey: "High" },
  { code: "G", label: "Good", configKey: "Good" },
  { code: "M", label: "Moderate", configKey: "Moderate" },
  { code: "P", label: "Poor", configKey: "Poor" },
  { code: "B", label: "Bad", configKey: "Bad" },
  { code: "N", label: "No data", color: "#9ca3af" },
];

/**
 * Renders a row of toggleable status filter chips.
 */
function StatusChips({ items, filter, onToggle, statusConfig }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        padding: "4px 12px 8px 50px",
        maxWidth: 220,
      }}
    >
      {items.map(({ code, label, configKey, color: hardColor }) => {
        const active = filter[code] !== false;
        const color =
          hardColor ||
          statusConfig?.[configKey]?.color ||
          HEALTH_COLORS[configKey] ||
          "#9ca3af";
        return (
          <button
            key={code}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggle(code);
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 99,
              border: `1.5px solid ${color}`,
              background: active ? color : "transparent",
              color: active ? "white" : color,
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
              opacity: active ? 1 : 0.5,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export default function LayerToggle({
  layers,
  onToggle,
  counts = {},
  statusFilter = {},
  onStatusToggle,
  statusConfig,
  invStatusFilter = {},
  onInvStatusToggle,
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      style={{
        position: "absolute",
        top: "calc(4rem + 12px)",
        left: 12,
        zIndex: 1000,
        background: "white",
        borderRadius: 10,
        boxShadow: "0 2px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        minWidth: 180,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 12px",
          background: "none",
          border: "none",
          borderBottom: collapsed ? "none" : "1px solid #e2e8f0",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 600,
          color: "#334155",
        }}
      >
        <span>Layers</span>
        {collapsed ? (
          <ChevronDown size={16} color="#64748b" />
        ) : (
          <ChevronUp size={16} color="#64748b" />
        )}
      </button>

      {/* Layer list */}
      {!collapsed && (
        <div style={{ padding: "8px 0" }}>
          {LAYERS.map((layer) => {
            const isActive = layers[layer.key];
            const count = counts[layer.key];
            const isWq = layer.key === "waterQuality";
            const isInv = layer.key === "invertebrates";

            return (
              <div key={layer.key}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#f8fafc")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  {/* Custom checkbox */}
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      border: `2px solid ${isActive ? layer.color : "#cbd5e1"}`,
                      background: isActive ? layer.color : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.15s",
                      flexShrink: 0,
                    }}
                  >
                    {isActive && (
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2.5 6L5 8.5L9.5 4"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Emoji indicator */}
                  <span
                    style={{
                      fontSize: 16,
                      opacity: isActive ? 1 : 0.4,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {layer.emoji}
                  </span>

                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => onToggle(layer.key)}
                    style={{ display: "none" }}
                  />

                  {/* Label and count */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: isActive ? "#1e293b" : "#64748b",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {layer.label}
                      {count !== undefined && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "#94a3b8",
                            background: "#f1f5f9",
                            padding: "1px 5px",
                            borderRadius: 99,
                          }}
                        >
                          {count.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#94a3b8",
                        marginTop: 1,
                      }}
                    >
                      {layer.description}
                    </div>
                  </div>
                </label>

                {/* WQ status filter chips */}
                {isWq && isActive && onStatusToggle && (
                  <StatusChips
                    items={WQ_STATUS_ORDER}
                    filter={statusFilter}
                    onToggle={onStatusToggle}
                    statusConfig={statusConfig}
                  />
                )}

                {/* Invertebrate BMWP status filter chips */}
                {isInv && isActive && onInvStatusToggle && (
                  <StatusChips
                    items={INV_STATUS_ORDER}
                    filter={invStatusFilter}
                    onToggle={onInvStatusToggle}
                    statusConfig={statusConfig}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
