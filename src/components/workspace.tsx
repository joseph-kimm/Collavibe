"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleDot,
  Command,
  FileCheck2,
  GitBranch,
  History,
  Inbox,
  LayoutList,
  Link2,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { EvidenceType, FeatureStatus, ProjectView } from "@/lib/types";

const statusLabel: Record<FeatureStatus, string> = {
  queued: "Queued",
  active: "In progress",
  review: "In review",
  done: "Done",
  blocked: "Blocked",
};

const roleLabel = { product: "Product", systems: "Systems", verification: "Verification", integration: "Integration" };

async function postAction(payload: Record<string, unknown>): Promise<ProjectView> {
  const response = await fetch("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The action could not be completed.");
  return data as ProjectView;
}

export function Workspace({ initialState }: { initialState: ProjectView }) {
  const [state, setState] = useState(initialState);
  const [selectedId, setSelectedId] = useState(initialState.featureSummaries.find((item) => item.status === "active")?.id || initialState.featureSummaries[0].id);
  const [filter, setFilter] = useState<FeatureStatus | "all">("all");
  const [panel, setPanel] = useState<"feature" | "evidence" | "decision" | "session" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const currentMember = state.members.find((member) => member.id === state.currentMemberId)!;
  const selected = state.featureSummaries.find((feature) => feature.id === selectedId) || state.featureSummaries[0];
  const visibleFeatures = useMemo(() => state.featureSummaries.filter((feature) => filter === "all" || feature.status === filter), [state, filter]);
  const completion = Math.round((state.counts.done / state.features.length) * 100);
  const acceptedReview = state.reviews.find((review) => review.featureId === selected.id && review.status === "accepted");

  function run(payload: Record<string, unknown>, success: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        setState(await postAction(payload));
        setPanel(null);
        setNotice(success);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Action failed");
      }
    });
  }

  return (
    <main className="app-shell">
      <aside className="rail">
        <div className="brand-mark" aria-label="Collavibe"><span>c</span></div>
        <nav className="rail-nav" aria-label="Primary navigation">
          <button className="rail-button active" aria-label="Project workspace"><LayoutList size={18} /></button>
          <button className="rail-button" aria-label="Team"><Users size={18} /></button>
          <button className="rail-button" aria-label="Inbox"><Inbox size={18} /></button>
          <button className="rail-button" aria-label="History"><History size={18} /></button>
        </nav>
        <div className="avatar small">{currentMember.initials}</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-brand"><button className="mobile-menu" aria-label="Open navigation"><Menu size={18} /></button><strong>Collavibe</strong><span>/</span><button className="project-switch">{state.project.shortName}<ChevronDown size={14} /></button></div>
          <div className="topbar-actions">
            <button className="search-button"><Search size={15} /><span>Search workspace</span><kbd>⌘ K</kbd></button>
            <button className="icon-button" aria-label="Open command menu"><Command size={17} /></button>
            <div className="presence">
              {state.members.map((member) => <div key={member.id} className="avatar presence-avatar" title={`${member.name}, ${roleLabel[member.role]}`}>{member.initials}</div>)}
            </div>
          </div>
        </header>

        <div className="project-header">
          <div>
            <div className="eyebrow">Active learning project</div>
            <h1>{state.project.name}</h1>
            <p>{state.project.problem}</p>
          </div>
          <div className="project-health">
            <div className="health-number">{completion}%</div>
            <div><strong>Release readiness</strong><span>{state.counts.review} feature awaiting review</span></div>
          </div>
        </div>

        <div className="progress-line" aria-label={`${completion}% complete`}><span style={{ width: `${completion}%` }} /></div>

        <div className="workspace-grid">
          <section className="ledger" aria-label="Feature ledger">
            <div className="section-toolbar">
              <div><h2>Feature ledger</h2><p>Intent, ownership, and proof in one place.</p></div>
              <button className="primary-button" onClick={() => setPanel("feature")}><Plus size={16} /> New feature</button>
            </div>

            <div className="filters" role="group" aria-label="Filter features">
              {(["all", "active", "review", "blocked", "done"] as const).map((item) => (
                <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>
                  {item === "all" ? "All" : statusLabel[item]}
                  <span>{item === "all" ? state.features.length : state.counts[item]}</span>
                </button>
              ))}
            </div>

            <div className="ledger-head"><span>Feature</span><span>Owner</span><span>Evidence</span><span>Status</span></div>
            <div className="feature-list">
              {visibleFeatures.map((feature, index) => (
                <button key={feature.id} className={`feature-row ${selected.id === feature.id ? "selected" : ""}`} onClick={() => setSelectedId(feature.id)} style={{ "--row-delay": `${index * 35}ms` } as React.CSSProperties}>
                  <span className="feature-main"><span className={`status-pin ${feature.status}`} /><span><strong>{feature.title}</strong><small>{feature.userStory}</small></span></span>
                  <span>{feature.owner ? <span className="owner"><span className="avatar tiny">{feature.owner.initials}</span>{feature.owner.name.split(" ")[0]}</span> : <span className="muted">Unclaimed</span>}</span>
                  <span className="evidence-count"><FileCheck2 size={15} />{feature.evidenceCount}</span>
                  <span><span className={`status-text ${feature.status}`}>{statusLabel[feature.status]}</span></span>
                </button>
              ))}
            </div>

            <div className="activity-strip">
              <div className="activity-title"><CircleDot size={16} /><span><strong>Recent decisions</strong> across the team</span></div>
              <div className="decision-list">
                {state.decisions.slice(-3).reverse().map((decision) => {
                  const member = state.members.find((item) => item.id === decision.memberId);
                  return <div key={decision.id}><span className="decision-line" /><p>{decision.decision}</p><small>{member?.name} · {decision.affectedComponents.join(", ")}</small></div>;
                })}
              </div>
            </div>
          </section>

          <aside className="inspector" aria-label="Selected feature details">
            <div className="inspector-topline"><span className={`status-text ${selected.status}`}>{statusLabel[selected.status]}</span><button className="icon-button" aria-label="Copy feature link"><Link2 size={15} /></button></div>
            <h2>{selected.title}</h2>
            <p className="user-story">{selected.userStory}</p>

            <div className="inspector-section">
              <h3>Acceptance criteria</h3>
              <ul className="criteria-list">
                {selected.acceptanceCriteria.map((criterion, index) => <li key={criterion}><span>{selected.status === "done" || index === 0 ? <Check size={13} /> : index + 1}</span>{criterion}</li>)}
              </ul>
            </div>

            <div className="inspector-section split-detail">
              <div><span className="detail-label">Risk</span><strong className={`risk ${selected.risk}`}>{selected.risk}</strong></div>
              <div><span className="detail-label">Dependencies</span><strong>{selected.dependencies.length || "None"}</strong></div>
            </div>

            {selected.activeSession && <div className="live-session"><Sparkles size={15} /><div><strong>Live work session</strong><span>{selected.activeSession.plan}</span></div></div>}

            {selected.openReview && <div className="review-callout">
              <div><ShieldCheck size={15} /><strong>{selected.openReview.status === "changes_requested" ? "Changes requested" : "Peer review waiting"}</strong></div>
              <p>{selected.openReview.notes || "Inspect the acceptance criteria and attached evidence before deciding."}</p>
              {selected.openReview.reviewerId === currentMember.id && <div className="review-actions">
                <button onClick={() => run({ action: "resolve_review", reviewId: selected.openReview!.id, reviewerId: currentMember.id, status: "changes_requested", notes: "Please address the missing boundary case and attach fresh evidence." }, "Changes requested with a visible rationale.")}>Request changes</button>
                <button onClick={() => run({ action: "resolve_review", reviewId: selected.openReview!.id, reviewerId: currentMember.id, status: "accepted", notes: "Acceptance criteria and evidence reviewed independently." }, "Review accepted. The owner can now mark the feature done once passing evidence is present.")}><Check size={14} /> Accept evidence</button>
              </div>}
            </div>}

            <div className="inspector-section">
              <div className="section-label-row"><h3>Evidence</h3><span>{selected.evidenceCount} attached</span></div>
              <div className="evidence-stack">
                {state.evidence.filter((item) => item.featureId === selected.id).map((item) => <div key={item.id}><span className={`result-dot ${item.result}`} /><div><strong>{item.title}</strong><small>{item.type} · {item.result}</small></div></div>)}
                {!selected.evidenceCount && <p className="empty-copy">No evidence yet. A claim is not complete until someone can inspect what supports it.</p>}
              </div>
            </div>

            {error && <div className="inline-message error">{error}</div>}
            {notice && <div className="inline-message success">{notice}</div>}

            <div className="action-stack">
              {!selected.ownerId && <button className="primary-button wide" disabled={isPending} onClick={() => run({ action: "claim_feature", featureId: selected.id, memberId: currentMember.id }, "Feature claimed.")}>Claim feature</button>}
              {selected.ownerId === currentMember.id && !selected.activeSession && selected.status !== "done" && <button className="primary-button wide" onClick={() => setPanel("session")}><GitBranch size={16} /> Start work session</button>}
              {selected.ownerId === currentMember.id && selected.activeSession && <button className="primary-button wide" onClick={() => run({ action: "finish_session", sessionId: selected.activeSession!.id, summary: "Completed the planned change and documented the remaining verification work.", handoff: { intent: selected.userStory, changes: "Updated the feature according to the current plan.", evidenceSummary: `${selected.evidenceCount} evidence item(s) are attached.`, uncertainty: "A teammate should inspect the boundary cases.", nextAction: "Review the evidence and run one independent check." } }, "Session closed and handoff recorded.")}><ArrowUpRight size={16} /> Finish & hand off</button>}
              <div className="secondary-actions">
                <button onClick={() => setPanel("evidence")}><FileCheck2 size={15} /> Evidence</button>
                <button onClick={() => setPanel("decision")}><MessageSquareText size={15} /> Decision</button>
              </div>
              {selected.evidenceCount > 0 && selected.status !== "review" && selected.status !== "done" && <button className="text-action" onClick={() => run({ action: "request_review", featureId: selected.id, requesterId: currentMember.id, reviewerId: state.members.find((member) => member.id !== currentMember.id)!.id }, "Peer review requested.")}><ShieldCheck size={15} /> Request peer review</button>}
              {acceptedReview && selected.status !== "done" && <button className="text-action" onClick={() => run({ action: "update_feature", featureId: selected.id, status: "done" }, "Feature marked done after evidence and peer review checks.")}><Check size={15} /> Mark feature done</button>}
            </div>
          </aside>
        </div>
      </section>

      {panel && <ActionPanel kind={panel} featureId={selected.id} memberId={currentMember.id} onClose={() => setPanel(null)} onSubmit={run} />}
    </main>
  );
}

function ActionPanel({ kind, featureId, memberId, onClose, onSubmit }: { kind: "feature" | "evidence" | "decision" | "session"; featureId: string; memberId: string; onClose: () => void; onSubmit: (payload: Record<string, unknown>, success: string) => void }) {
  const [type, setType] = useState<EvidenceType>("test");
  function submit(formData: FormData) {
    if (kind === "feature") onSubmit({ action: "create_feature", title: formData.get("title"), userStory: formData.get("userStory"), acceptanceCriteria: String(formData.get("criteria")).split("\n").map((item) => item.trim()).filter(Boolean), risk: formData.get("risk") }, "Feature added to the queue.");
    if (kind === "evidence") onSubmit({ action: "attach_evidence", featureId, memberId, type, title: formData.get("title"), result: formData.get("result"), details: formData.get("details") }, "Evidence attached.");
    if (kind === "decision") onSubmit({ action: "record_decision", featureId, memberId, decision: formData.get("decision"), rationale: formData.get("rationale"), alternatives: formData.get("alternatives"), affectedComponents: String(formData.get("components")).split(",").map((item) => item.trim()).filter(Boolean) }, "Decision recorded.");
    if (kind === "session") onSubmit({ action: "start_session", featureId, memberId, plan: formData.get("plan"), expectedEvidence: formData.get("expectedEvidence") }, "Work session started.");
  }
  return <div className="panel-scrim" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="action-panel">
      <div className="panel-heading"><div><span className="eyebrow">Structured project record</span><h2>{kind === "feature" ? "Define a feature" : kind === "evidence" ? "Attach evidence" : kind === "decision" ? "Record a decision" : "Start a work session"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close panel"><X size={17} /></button></div>
      <form action={submit}>
        {kind === "feature" && <>
          <label>Feature title<input name="title" required minLength={3} placeholder="Confirm a meeting place" /></label>
          <label>User story<textarea name="userStory" required minLength={12} placeholder="As a student, I can confirm a public meeting place with my peer." /></label>
          <label>Acceptance criteria<textarea name="criteria" required minLength={4} placeholder={"Both students see the same location\nPrivate addresses are rejected\nCancellation remains available"} /></label>
          <label>Risk<select name="risk" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
        </>}
        {kind === "evidence" && <>
          <label>Evidence type<select value={type} onChange={(event) => setType(event.target.value as EvidenceType)}>{["test", "preview", "screenshot", "log", "explanation"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Title<input name="title" required minLength={3} placeholder="Refresh-state verification" /></label>
          <label>Result<select name="result" defaultValue="pass"><option value="pass">Pass</option><option value="fail">Fail</option><option value="inconclusive">Inconclusive</option></select></label>
          <label>What does this show?<textarea name="details" required minLength={8} placeholder="State the claim this evidence supports and its limits." /></label>
        </>}
        {kind === "decision" && <>
          <label>Decision<input name="decision" required minLength={4} placeholder="Keep filters in the URL" /></label>
          <label>Rationale<textarea name="rationale" required minLength={8} placeholder="Why is this the right tradeoff for the project and its users?" /></label>
          <label>Alternative considered<input name="alternatives" required minLength={3} placeholder="Local component state" /></label>
          <label>Affected components<input name="components" required placeholder="search, routing, tests" /></label>
        </>}
        {kind === "session" && <>
          <label>Plan<textarea name="plan" required minLength={8} placeholder="What will you change, and in what order?" /></label>
          <label>Expected evidence<textarea name="expectedEvidence" required minLength={8} placeholder="What will another person be able to inspect afterward?" /></label>
        </>}
        <div className="panel-footer"><button type="button" className="ghost-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">{kind === "session" ? "Start session" : kind === "feature" ? "Add to queue" : "Save record"}</button></div>
      </form>
    </section>
  </div>;
}
