"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { TemplateLibrary } from "@/components/templates/template-library";
import { api, ApiError } from "@/lib/api";
import { routes } from "@/lib/routes";
import type { Template } from "@/types/template";
import {
  appCopy,
  formatDate,
  isSupportedLocale,
  readStoredLocale,
  surfaceCopy,
  translate,
  type AppLocale,
} from "@/lib/i18n";

interface ProjectItem {
  id: string;
  name: string;
  platform: string;
  status: "active" | "archived";
  updated_at: string | null;
  artifact_snapshot?: { hook?: string } | null;
}

function dateLabel(value: string | null, locale: AppLocale, empty: string) {
  return formatDate(locale, value) || empty;
}

export default function DashboardPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [view, setView] = useState<"projects" | "templates">("projects");
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [locale, setLocale] = useState<AppLocale>(readStoredLocale);
  const copy = appCopy[locale];
  const initialProjectError = useRef(copy.dashboard.loadError);
  useEffect(() => {
    const onLocale = (event: Event) => { const next = (event as CustomEvent<AppLocale>).detail; if (isSupportedLocale(next)) setLocale(next); };
    window.addEventListener("hitrendy:locale", onLocale);
    return () => window.removeEventListener("hitrendy:locale", onLocale);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError("");
    void api.projects
      .list({ status })
      .then((items) => setProjects(items as unknown as ProjectItem[]))
      .catch((reason) =>
        setError(
          reason instanceof ApiError
            ? reason.message
            : initialProjectError.current
        )
      )
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    void api.templates
      .list()
      .then((items) => setTemplates(items as unknown as Template[]))
      .catch(() => undefined);
  }, []);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return normalized
      ? projects.filter((project) =>
          `${project.name} ${project.platform}`
            .toLocaleLowerCase("es")
            .includes(normalized)
        )
      : projects;
  }, [projects, query]);

  async function changeStatus(project: ProjectItem) {
    setBusyId(project.id);
    try {
      await api.projects.update(project.id, {
        status: project.status === "active" ? "archived" : "active",
      });
      setProjects((items) => items.filter((item) => item.id !== project.id));
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : translate(locale, "dashboard.updateError")
      );
    } finally {
      setBusyId(null);
    }
  }

  async function useTemplate(template: Template) {
    router.push(`/studio/new?template=${encodeURIComponent(template.id)}`);
  }

  return (
    <AppShell>
      <main className="app-page dashboard-page">
        <header className="dashboard-head">
          <div>
            <p className="eyebrow">{copy.dashboard.eyebrow}</p>
            <h1>{copy.dashboard.title}</h1>
            <p>{copy.dashboard.subtitle}</p>
          </div>
          <div
            className="dashboard-tabs"
            role="tablist"
            aria-label={copy.dashboard.tabsLabel}
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === "projects"}
              onClick={() => setView("projects")}
            >
              {copy.dashboard.projects}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "templates"}
              onClick={() => setView("templates")}
            >
              {copy.dashboard.templates}
            </button>
          </div>
        </header>
        <section className="dashboard-hero">
          <div className="dashboard-hero-rail" aria-hidden="true">
            <Image src="/templates/flores.png" alt="" width={92} height={122} />
            <Image src="/templates/coffee.png" alt="" width={92} height={122} />
            <Image src="/templates/amor.png" alt="" width={92} height={122} />
          </div>
          <p className="eyebrow">{copy.dashboard.startEyebrow}</p>
          <h2>
            {view === "projects"
              ? copy.dashboard.projectsHeadline
              : copy.dashboard.templatesHeadline}
          </h2>
          <p>
            {view === "projects"
              ? copy.dashboard.projectsLead
              : copy.dashboard.templatesLead}
          </p>
          <Link href={routes.studioNew} className="button-secondary">
            {copy.dashboard.createCta} <span aria-hidden="true">→</span>
          </Link>
        </section>
        {view === "templates" ? (
          <TemplateLibrary templates={templates} onUse={useTemplate} copy={surfaceCopy[locale].templates} />
        ) : (
          <>
            <div className="content-title dashboard-project-title"><h2>{copy.dashboard.yourProjects}</h2></div>
            <div className="dashboard-toolbar">
              <div role="tablist" aria-label={copy.dashboard.statusLabel}>
                {(["active", "archived"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={status === value}
                    className="filter-tab"
                    onClick={() => setStatus(value)}
                  >
                    {value === "active"
                      ? copy.dashboard.statusActive
                      : copy.dashboard.statusArchived}
                  </button>
                ))}
              </div>
              <label className="search-field" htmlFor="project-search">
                {copy.dashboard.search}
                <input
                  id="project-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.dashboard.searchPlaceholder}
                />
              </label>
            </div>
            {error ? (
              <p className="page-error" role="alert">
                {error}
              </p>
            ) : null}
            {loading ? (
              <div className="folder-grid" aria-label={copy.dashboard.loadingProjects}>
                {[0, 1, 2].map((index) => (
                  <article
                    className="folder-card folder-card--loading"
                    key={index}
                  >
                    <span className="skeleton-line" />
                    <span className="skeleton-line skeleton-line--short" />
                  </article>
                ))}
              </div>
            ) : null}
            {!loading && !error && filteredProjects.length === 0 ? (
              <section className="empty-state">
                <h2>
                  {projects.length
                    ? copy.dashboard.noResults
                    : status === "archived"
                      ? copy.dashboard.emptyArchived
                      : copy.dashboard.emptyActive}
                </h2>
                <p>
                  {projects.length
                    ? copy.dashboard.noResultsHint
                    : copy.dashboard.emptyHint}
                </p>
                {!projects.length ? (
                  <Link href={routes.templates} className="button-primary">
                    {copy.dashboard.startCta}
                  </Link>
                ) : null}
              </section>
            ) : null}
            <section className="folder-grid" aria-label={copy.dashboard.projectsList}>
              {filteredProjects.map((project) => (
                <article className="folder-card" key={project.id}>
                  <div className="folder-art" aria-hidden="true">
                    <Image
                      src="/icons/folder-violet-papirus-hitrendy.svg"
                      alt=""
                      width={128}
                      height={128}
                    />
                    <span>{project.artifact_snapshot?.hook ? 1 : 0}</span>
                  </div>
                  <div className="folder-card-copy">
                    <Link href={`/projects/${project.id}`}>
                      <h2>{project.name}</h2>
                    </Link>
                    <p>
                      {project.platform} · {copy.dashboard.updatedAt}{" "}
                      {dateLabel(project.updated_at, locale, copy.dashboard.noActivity)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="button-secondary button-small"
                    onClick={() => changeStatus(project)}
                    disabled={busyId === project.id}
                  >
                    {busyId === project.id
                      ? copy.common.saving
                      : project.status === "active"
                        ? copy.dashboard.archive
                        : copy.dashboard.restore}
                  </button>
                </article>
              ))}
              <Link href={routes.studioNew} className="folder-card folder-card--new">
                <span className="folder-new-art" aria-hidden="true">
                  <Image
                    src="/icons/folder-violet-papirus-hitrendy.svg"
                    alt=""
                    width={128}
                    height={128}
                  />
                  <span className="folder-new-plus">+</span>
                </span>
                <strong>{copy.dashboard.newProject}</strong>
                <small>{copy.dashboard.newProjectHint}</small>
              </Link>
            </section>
            <section className="dashboard-recommended">
              <div className="content-title">
                <h2>{copy.dashboard.recommended}</h2>
                <Link href={routes.templates}>{copy.dashboard.seeAll}</Link>
              </div>
              <TemplateLibrary
                templates={templates.slice(0, 4)}
                onUse={useTemplate}
                compact
                copy={surfaceCopy[locale].templates}
              />
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
