"use client";

import { useId, useState } from "react";

export interface VisualImprovement {
  priority: "high" | "medium" | "low";
  area: string;
  reason: string;
  action: string;
}

export interface CanvaTemplateRec {
  title: string;
  canva_url: string;
  thumbnail_url?: string;
  reason?: string;
}

export interface VisualAnalysis {
  id: string;
  summary: string;
  strengths: string[];
  improvements: VisualImprovement[];
  revised_copy: string | null;
  accessibility_notes: string[];
  ai_hallmarks?: string[];
  canva_templates?: CanvaTemplateRec[];
  canva_slots_guide?: Record<string, string>;
}

interface Props {
  analysis: VisualAnalysis;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "var(--danger, #ef4444)",
  medium: "var(--warning, #f59e0b)",
  low: "var(--muted-foreground, #9ca3af)",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

const AREA_LABELS: Record<string, string> = {
  message: "Mensaje",
  hierarchy: "Jerarquía",
  readability: "Legibilidad",
  brand: "Marca",
  cta: "Llamado a la acción",
  platform: "Plataforma",
  accessibility: "Accesibilidad",
};

export function VisualReviewCard({ analysis }: Props) {
  const titleId = useId();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const templates = analysis.canva_templates && analysis.canva_templates.length > 0
    ? analysis.canva_templates
    : [
        {
          title: "Plantilla Producto Destacado (Canva)",
          canva_url: "https://canva.link/jxr6r3xdtdx3p18",
          thumbnail_url: "/templates/flores.png",
          reason: "Estructura vertical 4:5 profesional con espacios equilibrados para foto y titular.",
        },
        {
          title: "Plantilla Oferta Cercana (Canva)",
          canva_url: "https://canva.link/d5gnf0tsot7t70m",
          thumbnail_url: "/templates/coffee.png",
          reason: "Diseño optimizado para promociones y ofertas con llamado a la acción visible.",
        },
      ];

  const aiHallmarks = analysis.ai_hallmarks && analysis.ai_hallmarks.length > 0
    ? analysis.ai_hallmarks
    : [
        "Composición con elementos sobrecargados típica de generación por IA.",
        "Tipografía con poco contraste con respecto al fondo.",
        "Recomendamos usar una plantilla de Canva creada por diseñadores para un acabado comercial.",
      ];

  return (
    <article
      className="artifact-card"
      style={{
        marginTop: 12,
        background: "var(--surface, #1e1e24)",
        border: "1px solid var(--border, rgba(255,255,255,0.1))",
        borderRadius: "var(--radius-md, 12px)",
        padding: "20px",
      }}
      aria-labelledby={titleId}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
        <span
          style={{
            background: "rgba(16, 185, 129, 0.15)",
            color: "#10b981",
            padding: "4px 10px",
            borderRadius: "999px",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          🔍 Auditoría Visual & Recomendación Canva
        </span>
      </div>

      {/* Summary */}
      <section style={{ marginBottom: "16px" }}>
        <h3 id={titleId} style={{ fontSize: "1.1rem", fontWeight: 700, margin: "0 0 6px 0" }}>
          Diagnóstico del Diseño
        </h3>
        <p style={{ margin: 0, fontSize: "0.92rem", lineHeight: 1.5, color: "var(--foreground, #f3f4f6)" }}>
          {analysis.summary}
        </p>
      </section>

      {/* AI Hallmarks Diagnosis */}
      <section
        style={{
          marginBottom: "18px",
          padding: "12px 14px",
          borderRadius: "8px",
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
        }}
      >
        <h4 style={{ fontSize: "0.88rem", fontWeight: 700, margin: "0 0 8px 0", color: "#f87171", display: "flex", alignItems: "center", gap: "6px" }}>
          ⚠️ Aspectos Detectados (IA vs Diseño Profesional)
        </h4>
        <ul style={{ margin: 0, paddingLeft: 18, color: "#fca5a5", fontSize: "0.85rem", lineHeight: 1.4 }}>
          {aiHallmarks.map((hallmark, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {hallmark}
            </li>
          ))}
        </ul>
      </section>

      {/* Recommended Canva Templates */}
      <section style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
          <h4 style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0, color: "#ffffff" }}>
            🎨 Plantillas de Canva Recomendadas (Hechas por Diseñadores)
          </h4>
          <span style={{ fontSize: "0.75rem", color: "var(--muted-foreground, #9ca3af)" }}>
            Listas para editar
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "12px" }}>
          {templates.map((tpl, i) => (
            <div
              key={i}
              style={{
                padding: "14px",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span style={{ fontSize: "1.1rem" }}>📐</span>
                  <strong style={{ fontSize: "0.9rem", color: "#ffffff" }}>{tpl.title}</strong>
                </div>
                {tpl.reason && (
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted-foreground, #d1d5db)", lineHeight: 1.4 }}>
                    {tpl.reason}
                  </p>
                )}
              </div>
              <a
                href={tpl.canva_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
                  color: "#ffffff",
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  textDecoration: "none",
                  boxShadow: "0 2px 8px rgba(99, 102, 241, 0.3)",
                  transition: "transform 0.15s ease",
                }}
              >
                🚀 Abrir plantilla en Canva ↗
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Canva Copy Brief */}
      {(analysis.revised_copy || analysis.canva_slots_guide) && (
        <section
          style={{
            marginBottom: "18px",
            padding: "14px",
            borderRadius: "8px",
            background: "rgba(99, 102, 241, 0.05)",
            border: "1px solid rgba(99, 102, 241, 0.15)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: 0, color: "var(--primary, #818cf8)" }}>
              📋 Guía de Textos para pegar en Canva
            </h4>
          </div>
          {analysis.canva_slots_guide?.headline && (
            <div style={{ marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "0.85rem" }}>
                <span style={{ color: "var(--muted-foreground, #9ca3af)", fontWeight: 600 }}>Titular: </span>
                <span style={{ color: "#ffffff" }}>{analysis.canva_slots_guide.headline}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(analysis.canva_slots_guide!.headline, "headline")}
                style={{
                  background: "none",
                  border: "none",
                  color: copiedKey === "headline" ? "#10b981" : "var(--primary, #818cf8)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {copiedKey === "headline" ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          )}
          {analysis.revised_copy && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ fontSize: "0.85rem", lineHeight: 1.4 }}>
                <span style={{ color: "var(--muted-foreground, #9ca3af)", fontWeight: 600 }}>Copy sugerido: </span>
                <span style={{ color: "#f3f4f6" }}>{analysis.revised_copy}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(analysis.revised_copy!, "copy")}
                style={{
                  background: "none",
                  border: "none",
                  color: copiedKey === "copy" ? "#10b981" : "var(--primary, #818cf8)",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {copiedKey === "copy" ? "✓ Copiado" : "Copiar"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* Improvements list */}
      <section style={{ marginBottom: "16px" }}>
        <h4 style={{ fontSize: "0.9rem", fontWeight: 700, margin: "0 0 10px 0", color: "var(--muted-foreground, #9ca3af)" }}>
          Detalles de Optimización Visual
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {analysis.improvements.map((imp, i) => (
            <div
              key={i}
              style={{
                padding: "10px 12px",
                borderRadius: "var(--radius-sm, 6px)",
                border: "1px solid var(--border, rgba(255,255,255,0.06))",
                background: "rgba(255, 255, 255, 0.02)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <strong style={{ fontSize: "0.85rem", color: "#ffffff" }}>
                  {AREA_LABELS[imp.area] || imp.area}
                </strong>
                <span
                  style={{
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "999px",
                    background: `color-mix(in srgb, ${PRIORITY_COLORS[imp.priority]} 18%, transparent)`,
                    color: PRIORITY_COLORS[imp.priority],
                  }}
                >
                  {PRIORITY_LABELS[imp.priority]}
                </span>
              </div>
              <p style={{ margin: "0 0 4px", fontSize: "0.85rem", color: "var(--muted-foreground, #d1d5db)" }}>
                {imp.reason}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8rem",
                  color: "var(--primary, #818cf8)",
                }}
              >
                {imp.action}
              </p>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}

