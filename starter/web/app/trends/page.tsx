"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { api, ApiError, createIdempotencyKey } from "@/lib/api";
import {
  formatNumber,
  localeTags,
  optionLabel,
  useInterfaceLocale,
} from "@/lib/i18n";
import { trendsCopy } from "@/lib/trends-copy";
import type {
  TrendHome,
  TrendHomeStatus,
  TrendSource,
} from "@/types/trends";

function dateTime(locale: keyof typeof localeTags, value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat(localeTags[locale], {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function StatusMark({ status }: { status: TrendHomeStatus | TrendSource["status"] }) {
  return <span className="trend-status-mark" data-status={status} aria-hidden="true" />;
}

export default function TrendsPage() {
  const locale = useInterfaceLocale();
  const copy = trendsCopy[locale];
  const [home, setHome] = useState<TrendHome | null>(null);
  const [sources, setSources] = useState<TrendSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [sourcesError, setSourcesError] = useState("");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const closeSourcesRef = useRef<HTMLButtonElement>(null);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setHome(await api.trends.home());
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : copy.loadError);
    } finally {
      setLoading(false);
    }
  }, [copy.loadError]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  useEffect(() => {
    if (!sourcesOpen) return;
    setSourcesError("");
    void api.trends
      .sources()
      .then(setSources)
      .catch((reason) =>
        setSourcesError(
          reason instanceof ApiError ? reason.message : copy.modal.error
        )
      );
    requestAnimationFrame(() => closeSourcesRef.current?.focus());
  }, [copy.modal.error, sourcesOpen]);

  async function refresh() {
    if (!home?.refresh_allowed || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      // The refresh collects exactly the declared scope, never the aggregated
      // cards, which may belong to other scopes.
      await api.trends.refresh(home.refresh_scope, {
        idempotencyKey: createIdempotencyKey(),
      });
      await loadHome();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : copy.refreshError);
    } finally {
      setRefreshing(false);
    }
  }

  const stateHint =
    home?.status === "empty" ||
    home?.status === "disabled" ||
    home?.status === "unconfigured" ||
    home?.status === "failed"
      ? copy.stateHint[home.status]
      : null;

  return (
    <AppShell>
      <main className="app-page trends-home">
        <header className="trends-home-header">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="trends-home-lead">{copy.subtitle}</p>
            <p className="trend-updated">
              <span>{copy.lastUpdated}</span>
              <strong>
                {home?.updated_at
                  ? dateTime(locale, home.updated_at)
                  : copy.noUpdate}
              </strong>
            </p>
          </div>
          <div className="trends-home-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setSourcesOpen(true)}
            >
              {copy.sources}
              {home ? <span className="trend-source-count">{home.sources.total}</span> : null}
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={() => void refresh()}
              disabled={!home?.refresh_allowed || refreshing}
              aria-describedby={home?.next_refresh_at ? "trend-cooldown" : undefined}
            >
              {refreshing ? copy.refreshing : copy.refresh}
            </button>
          </div>
        </header>

        {home ? (
          <p className="trend-refresh-scope">
            <span>{copy.refreshScope}</span>
            <strong>
              {home.refresh_scope.region}
              {home.refresh_scope.category
                ? ` · ${optionLabel(locale, "category", home.refresh_scope.category)}`
                : ""}
            </strong>
          </p>
        ) : null}

        {home?.next_refresh_at ? (
          <p className="trend-cooldown" id="trend-cooldown" role="status">
            {copy.cooldown}:{" "}
            <time dateTime={home.next_refresh_at}>
              {dateTime(locale, home.next_refresh_at)}
            </time>
          </p>
        ) : null}

        {error ? (
          <section className="trend-state trend-state--error" role="alert">
            <div>
              <h2>{copy.loadError}</h2>
              <p>{error}</p>
            </div>
            <button type="button" className="button-secondary" onClick={() => void loadHome()}>
              {copy.retry}
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="trend-grid" aria-label={copy.loading} aria-busy="true">
            {[0, 1, 2].map((item) => (
              <article className="trend-card trend-card--loading" key={item} aria-label={copy.loadingCard}>
                <span className="skeleton-line" />
                <span className="skeleton-line skeleton-line--short" />
                <span className="skeleton-line" />
              </article>
            ))}
          </section>
        ) : null}

        {!loading && !error && home ? (
          <>
            <section
              className="trend-state"
              data-status={home.status}
              role={home.status === "failed" ? "alert" : "status"}
            >
              <StatusMark status={home.status} />
              <div>
                <h2>{copy.state[home.status]}</h2>
                {stateHint ? <p>{stateHint}</p> : null}
              </div>
            </section>

            {home.items.length ? (
              <section className="trend-grid" aria-label={copy.title}>
                {home.items.map((trend) => (
                  <article className="trend-card" key={trend.id}>
                    <header className="trend-card-header">
                      <span className="trend-freshness" data-status={trend.freshness}>
                        <StatusMark status={trend.freshness} />
                        {trend.freshness === "fresh" ? copy.fresh : copy.stale}
                      </span>
                      <span className="trend-scope">
                        {trend.region}
                        {trend.category
                          ? ` · ${optionLabel(locale, "category", trend.category)}`
                          : ""}
                      </span>
                    </header>
                    <div className="trend-card-copy">
                      <h2>{trend.title}</h2>
                      <p>{trend.summary}</p>
                    </div>
                    <dl className="trend-scores">
                      <div>
                        <dt>{copy.globalScore}</dt>
                        <dd>
                          {formatNumber(locale, trend.total_score, {
                            maximumFractionDigits: 2,
                          })}
                        </dd>
                      </div>
                      {trend.workspace_relevance ? (
                        <div>
                          <dt>{copy.relevance}</dt>
                          <dd>
                            {formatNumber(locale, trend.workspace_relevance.score, {
                              style: "percent",
                              maximumFractionDigits: 0,
                            })}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <section className="trend-evidence">
                      <h3>{copy.evidence}</h3>
                      <ul>
                        {trend.evidence.map((evidence) => (
                          <li key={`${evidence.source}-${evidence.source_url}`}>
                            <a
                              href={evidence.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {evidence.source_name}
                            </a>
                            <span>
                              {copy.observed}{" "}
                              <time dateTime={evidence.observed_at}>
                                {dateTime(locale, evidence.observed_at)}
                              </time>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                    <footer className="trend-card-footer">
                      <p>{copy.basedOnSignal}</p>
                      <Link
                        href={`/studio/new?trend=${encodeURIComponent(trend.id)}`}
                        className="button-primary"
                      >
                        {copy.create}
                      </Link>
                    </footer>
                  </article>
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </main>

      {sourcesOpen ? (
        <div
          className="trend-modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSourcesOpen(false);
          }}
        >
          <section
            className="trend-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trend-sources-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setSourcesOpen(false);
            }}
          >
            <header>
              <div>
                <h2 id="trend-sources-title">{copy.modal.title}</h2>
                <p>{copy.modal.lead}</p>
              </div>
              <button
                ref={closeSourcesRef}
                type="button"
                className="trend-modal-close"
                aria-label={copy.modal.close}
                onClick={() => setSourcesOpen(false)}
              >
                ×
              </button>
            </header>
            {sourcesError ? <p className="page-error" role="alert">{sourcesError}</p> : null}
            {!sourcesError && !sources.length ? <p>{copy.modal.empty}</p> : null}
            <ul className="trend-source-list">
              {sources.map((source) => (
                <li key={source.identifier}>
                  <div>
                    <strong>{source.public_name}</strong>
                    <span>
                      {source.source_type.toUpperCase()} ·{" "}
                      {source.configured
                        ? copy.modal.configured
                        : copy.modal.notConfigured}
                    </span>
                  </div>
                  <div className="trend-source-state">
                    <span>
                      <StatusMark status={source.status} />
                      {copy.modal.status[source.status]}
                    </span>
                    {source.next_reset_at ? (
                      <small>
                        {copy.modal.nextReset}:{" "}
                        <time dateTime={source.next_reset_at}>
                          {dateTime(locale, source.next_reset_at)}
                        </time>
                      </small>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}
