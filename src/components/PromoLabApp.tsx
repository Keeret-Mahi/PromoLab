'use client';

import { useMemo, useState } from 'react';
import { DEFAULT_PROMPT, getCartSubtotal, SAMPLE_CARTS } from '../data/fixtures.ts';
import type {
  DiscountCode,
  PreflightReport,
  ValidationResult,
  ValidationStatus,
} from '../domain/types.ts';
import { buildDemoReport, runPreflight } from '../engine/run-preflight.ts';

type ResultFilter = 'all' | ValidationStatus;

const money = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  minimumFractionDigits: 2,
});

const statusCopy: Record<ValidationStatus, { label: string; symbol: string }> = {
  pass: { label: 'Passed', symbol: '✓' },
  fail: { label: 'Unexpected', symbol: '×' },
  warning: { label: 'Expected conflict', symbol: '!' },
};

const statusOrder: Record<ValidationStatus, number> = { fail: 0, warning: 1, pass: 2 };

function codeList(codes: DiscountCode[], emptyLabel = 'None expected') {
  if (!codes.length) return <span className="empty-value">{emptyLabel}</span>;
  return (
    <span className="code-list">
      {codes.map((code) => <code key={code}>{code}</code>)}
    </span>
  );
}

function ResultRow({
  result,
  expanded,
  onToggle,
}: {
  result: ValidationResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { scenario, execution, status } = result;

  return (
    <article className={`result-row ${expanded ? 'expanded' : ''}`}>
      <button
        type="button"
        className="result-summary"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`details-${scenario.id}`}
      >
        <span className={`status-icon ${status}`}>{statusCopy[status].symbol}</span>
        <span className="scenario-cell">
          <span className="scenario-title">
            {scenario.discountCodes.join(' + ')}
          </span>
          <span>{scenario.cart.name} · {money.format(getCartSubtotal(scenario.cart))} subtotal</span>
        </span>
        <span className="result-codes">
          <small>Expected</small>
          {codeList(result.expectedDiscounts)}
        </span>
        <span className="result-codes actual-codes">
          <small>Actual</small>
          {codeList(execution.appliedDiscounts, 'None applied')}
        </span>
        <span className="total-cell">
          <small>Cart total</small>
          <strong>{money.format(execution.total)}</strong>
        </span>
        <span className="chevron" aria-hidden="true">⌄</span>
      </button>

      {expanded && (
        <div className="result-detail" id={`details-${scenario.id}`}>
          <div className="explanation">
            <span className={`explanation-kicker ${status}`}>
              {statusCopy[status].label}
            </span>
            <h4>{result.reason}</h4>
            <p>{result.detail}</p>
            {execution.rejectedDiscounts.length > 0 && (
              <div className="shopify-response">
                <span>Mock Shopify response</span>
                {execution.rejectedDiscounts.map((rejection) => (
                  <p key={rejection.code}>
                    <code>{rejection.code}</code> {rejection.reason}
                  </p>
                ))}
              </div>
            )}
          </div>
          <div className="calculation" aria-label="Cart calculation">
            <div><span>Merchandise</span><strong>{money.format(execution.subtotal)}</strong></div>
            <div><span>Product discount</span><strong>−{money.format(execution.productDiscount)}</strong></div>
            <div><span>Order discount</span><strong>−{money.format(execution.orderDiscount)}</strong></div>
            <div><span>Shipping</span><strong>{money.format(execution.shippingPrice - execution.shippingDiscount)}</strong></div>
            <div className="calculation-total"><span>Actual total</span><strong>{money.format(execution.total)}</strong></div>
          </div>
        </div>
      )}
    </article>
  );
}

export default function PromoLabApp() {
  const initialReport = useMemo(() => buildDemoReport(), []);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [report, setReport] = useState<PreflightReport>(initialReport);
  const [runState, setRunState] = useState<'idle' | 'running'>('idle');
  const [filter, setFilter] = useState<ResultFilter>('all');
  const [expandedId, setExpandedId] = useState(
    initialReport.results.find((result) => result.status === 'fail')?.scenario.id ?? '',
  );

  const counts = useMemo(
    () => report.results.reduce(
      (total, result) => ({ ...total, [result.status]: total[result.status] + 1 }),
      { pass: 0, fail: 0, warning: 0 },
    ),
    [report],
  );

  const filteredResults = useMemo(
    () => report.results
      .filter((result) => filter === 'all' || result.status === filter)
      .sort((left, right) =>
        statusOrder[left.status] - statusOrder[right.status]
        || left.scenario.sequence - right.scenario.sequence,
      ),
    [filter, report],
  );

  async function handleRun() {
    if (!prompt.trim() || runState === 'running') return;
    setRunState('running');
    const [nextReport] = await Promise.all([
      runPreflight(prompt.trim()),
      new Promise((resolve) => setTimeout(resolve, 700)),
    ]);
    setReport(nextReport);
    setExpandedId(nextReport.results.find((result) => result.status === 'fail')?.scenario.id ?? '');
    setFilter('all');
    setRunState('idle');
    document.querySelector('#results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">P</span>
          <span>PromoLab</span>
        </div>
        <nav aria-label="Primary navigation">
          <a className="nav-item active" href="#workspace"><span className="nav-icon">⌁</span>Test workspace</a>
          <a className="nav-item" href="#discounts"><span className="nav-icon">%</span>Discounts<span className="nav-count">4</span></a>
          <a className="nav-item" href="#results"><span className="nav-icon">↺</span>Test results<span className="nav-count">{report.results.length}</span></a>
        </nav>
        <div className="principle-card">
          <span className="principle-icon">AI</span>
          <strong>Interpret, then verify</strong>
          <p>AI structures the intent. Code determines every result.</p>
        </div>
        <div className="sidebar-note">
          <span className="status-dot" /> Mock store connected
          <small>promolab-demo.myshopify.com</small>
        </div>
      </aside>

      <section className="workspace" id="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Discount preflight</p>
            <h1>Test a promotion</h1>
          </div>
          <div className="topbar-actions">
            <span className="mock-badge"><i />Mock Shopify mode</span>
            <div className="store-avatar" aria-label="Demo store account">DS</div>
          </div>
        </header>

        <div className="content">
          <section className="intro">
            <div>
              <h2>Know what your discounts will do before customers do.</h2>
              <p>Describe the intended behaviour. PromoLab turns it into explicit rules and runs deterministic cart tests against your active configuration.</p>
            </div>
            <span className="safety-note"><b>✓</b> Deterministically verified</span>
          </section>

          <section className="prompt-card">
            <div className="prompt-label">
              <label htmlFor="promotion-intent">Promotion intent</label>
              <span>Plain text</span>
            </div>
            <textarea
              id="promotion-intent"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              aria-describedby="prompt-help"
            />
            <div className="prompt-footer">
              <span id="prompt-help">Include expected stacking, thresholds, and eligibility.</span>
              <button type="button" onClick={handleRun} disabled={runState === 'running' || !prompt.trim()}>
                {runState === 'running' ? <><i className="spinner" /> Running 40 scenarios</> : <>Run preflight <span>→</span></>}
              </button>
            </div>
          </section>

          <section className="pipeline" aria-label="Preflight workflow">
            {[
              ['01', 'Interpret intent', 'Mock LLM', 'ai'],
              ['02', 'Generate cases', 'Deterministic', 'code'],
              ['03', 'Execute carts', 'Mock Shopify', 'shopify'],
              ['04', 'Validate results', 'Deterministic', 'code'],
            ].map(([step, title, label, kind], index) => (
              <div className="pipeline-step" key={step}>
                <span className={`step-number ${kind}`}>{step}</span>
                <div><strong>{title}</strong><small>{label}</small></div>
                {index < 3 && <span className="step-arrow">→</span>}
              </div>
            ))}
          </section>

          <section className="expectations-section">
            <div className="section-heading">
              <div><p className="eyebrow">Intent contract</p><h3>Structured expectations</h3></div>
              <span className="ai-badge"><b>AI</b> Interpreted · {Math.round(report.expectations.confidence * 100)}% confidence</span>
            </div>
            <div className="expectations-layout">
              <div className="expectations-card">
                <div className="expectations-head">
                  <div><strong>{report.expectations.name}</strong><p>{report.expectations.summary}</p></div>
                  <span>{report.expectations.rules.length} rules</span>
                </div>
                <div className="rules-list">
                  {report.expectations.rules.map((rule, index) => (
                    <article className="rule-row" key={rule.id}>
                      <span className="rule-index">{String(index + 1).padStart(2, '0')}</span>
                      <div><strong>{rule.title}</strong><p>{rule.statement}</p></div>
                      <span className={`rule-kind ${rule.kind}`}>{rule.kind.replace('-', ' ')}</span>
                    </article>
                  ))}
                </div>
                <div className="expectations-note"><span>i</span><p><strong>AI stops here.</strong> These structured rules are passed to the deterministic validator; the LLM never assigns pass or fail.</p></div>
              </div>

              <aside className="coverage-card">
                <p className="eyebrow">Deterministic coverage</p>
                <div className="coverage-number"><strong>{report.scenarios.length}</strong><span>scenarios generated</span></div>
                <div className="coverage-math"><span><b>10</b> combinations</span><i>×</i><span><b>{SAMPLE_CARTS.length}</b> carts</span></div>
                <div className="cart-fixtures">
                  {SAMPLE_CARTS.map((cart) => (
                    <div key={cart.id}><span>{cart.name}</span><strong>{money.format(getCartSubtotal(cart))}</strong></div>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          <section className="discount-strip" id="discounts">
            <div className="section-heading">
              <div><p className="eyebrow">Shopify Admin adapter</p><h3>4 active discounts</h3></div>
              <span><i className="synced-dot" />Mock response · synced just now</span>
            </div>
            <div className="discount-grid">
              {report.discounts.map((discount) => (
                <article className="discount-card" key={discount.code}>
                  <span className={`discount-icon ${discount.category}`}>
                    {discount.category === 'shipping' ? '↗' : discount.category === 'product' ? '1+' : '%'}
                  </span>
                  <div><strong>{discount.code}</strong><p>{discount.title}</p></div>
                  <span className="type-pill">{discount.method}</span>
                </article>
              ))}
            </div>
          </section>

          <section className="results-section" id="results">
            <div className="results-heading">
              <div><p className="eyebrow">Preflight report</p><h3>Interaction results</h3><p>Every result is produced by the deterministic validator.</p></div>
              <div className="run-stamp"><span className="status-dot" /><strong>Run complete</strong><small>{report.scenarios.length} of {report.scenarios.length} executed</small></div>
            </div>

            <div className="summary-grid">
              {(['pass', 'fail', 'warning'] as ValidationStatus[]).map((status) => (
                <button className={`summary-card ${status} ${filter === status ? 'selected' : ''}`} type="button" key={status} onClick={() => setFilter(status)}>
                  <span className={`status-icon ${status}`}>{statusCopy[status].symbol}</span>
                  <div><strong>{counts[status]}</strong><span>{statusCopy[status].label}</span></div>
                  <small>{status === 'pass' ? 'Matched intent' : status === 'fail' ? 'Needs attention' : 'Safe to expect'}</small>
                </button>
              ))}
              <button className={`summary-card total ${filter === 'all' ? 'selected' : ''}`} type="button" onClick={() => setFilter('all')}>
                <span className="coverage-ring">100%</span>
                <div><strong>{report.results.length}</strong><span>Total tests</span></div>
                <small>4 carts covered</small>
              </button>
            </div>

            <div className="results-table">
              <div className="table-toolbar">
                <div className="filter-tabs" role="tablist" aria-label="Filter results">
                  {(['all', 'fail', 'warning', 'pass'] as ResultFilter[]).map((item) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={filter === item}
                      className={filter === item ? 'active' : ''}
                      onClick={() => setFilter(item)}
                      key={item}
                    >
                      {item === 'all' ? 'All results' : statusCopy[item].label}
                      <span>{item === 'all' ? report.results.length : counts[item]}</span>
                    </button>
                  ))}
                </div>
                <span>Sorted by attention needed</span>
              </div>
              <div className="table-head"><span>Outcome & scenario</span><span>Expected</span><span>Actual</span><span>Total</span></div>
              <div className="result-list">
                {filteredResults.map((result) => (
                  <ResultRow
                    key={result.scenario.id}
                    result={result}
                    expanded={expandedId === result.scenario.id}
                    onToggle={() => setExpandedId(expandedId === result.scenario.id ? '' : result.scenario.id)}
                  />
                ))}
              </div>
            </div>
          </section>

          <footer className="app-footer">
            <span><b>PromoLab</b> prototype</span>
            <span>Mock adapters · no live Shopify data</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
