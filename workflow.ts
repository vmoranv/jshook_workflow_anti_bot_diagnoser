import {
  createWorkflow,
  type WorkflowExecutionContext,
  SequenceNodeBuilder,
} from '@jshookmcp/extension-sdk/workflow';

const workflowId = 'workflow.anti-bot-diagnoser.v1';

/**
 * Anti-Bot Diagnoser — Reverse Mission Workflow
 *
 * Differential analysis to detect bot-detection mechanisms:
 *   1. Creates a baseline fingerprint (normal browser context)
 *   2. Creates a stealth fingerprint (stealth executor)
 *   3. Compares both against known detection probes
 *   4. Identifies specific detection points (webdriver, CDP, timing, canvas, etc.)
 *   5. Produces a detection map and remediation hints
 *   6. Records evidence for the diagnostic session
 */
export default createWorkflow(workflowId, 'Anti-Bot Diagnoser')
  .description(
    'Compares normal vs stealth browser fingerprints, identifies bot-detection triggers (webdriver, CDP, canvas, WebRTC, timing), and produces a detection report with remediation hints.',
  )
  .tags([
    'reverse',
    'antibot',
    'stealth',
    'fingerprint',
    'detection',
    'webdriver',
    'mission',
  ])
  .timeoutMs(12 * 60_000)
  .defaultMaxConcurrency(2)
  .buildGraph((ctx: WorkflowExecutionContext) => {
    const prefix = 'workflows.antiBotDiagnoser';

    // ── Config ──────────────────────────────────────────────────────
    const url = String(ctx.getConfig(`${prefix}.url`, 'https://example.com'));
    const waitUntil = String(ctx.getConfig(`${prefix}.waitUntil`, 'networkidle0'));
    const probeCategories = String(
      ctx.getConfig(
        `${prefix}.probeCategories`,
        'webdriver,navigator,timing,canvas,webgl,webrtc,audio,fonts,plugins,permissions',
      ),
    );
    const maxConcurrency = Number(ctx.getConfig(`${prefix}.parallel.maxConcurrency`, 2));
    const stealthMode = String(ctx.getConfig(`${prefix}.stealthMode`, 'patchright'));

    const root = new SequenceNodeBuilder('anti-bot-diagnoser-root');

    root
      // ── Phase 1: Enable Network & Navigate ────────────────────────
      .tool('enable-network', 'network_enable', {
        input: { enableExceptions: true },
      })
      .tool('navigate', 'page_navigate', {
        input: { url, waitUntil },
      })

      // ── Phase 2: Baseline Fingerprint (Normal) ────────────────────
      .tool('fingerprint-baseline', 'page_evaluate', {
        input: {
          expression: `
            (function() {
              const probes = {};
              // webdriver
              probes.webdriver = navigator.webdriver;
              probes.webdriverDefined = 'webdriver' in navigator;
              // navigator properties
              probes.userAgent = navigator.userAgent;
              probes.platform = navigator.platform;
              probes.languages = navigator.languages;
              probes.hardwareConcurrency = navigator.hardwareConcurrency;
              probes.deviceMemory = navigator.deviceMemory;
              // timing
              probes.timingResolution = (() => {
                const t0 = performance.now();
                for (let i = 0; i < 1000; i++) performance.now();
                return performance.now() - t0;
              })();
              // canvas
              probes.canvasFingerprint = (() => {
                const c = document.createElement('canvas');
                c.width = 200; c.height = 50;
                const ctx = c.getContext('2d');
                if (!ctx) return null;
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillText('probe', 2, 2);
                return c.toDataURL().slice(0, 100);
              })();
              // chrome
              probes.chromeRuntime = typeof chrome !== 'undefined' && !!chrome.runtime;
              // permissions
              probes.permissionsQuery = typeof navigator.permissions !== 'undefined';
              // plugins
              probes.pluginCount = navigator.plugins ? navigator.plugins.length : -1;
              return probes;
            })()
          `,
        },
      })

      // ── Phase 3: Parallel Detection Checks ────────────────────────
      .parallel('detection-checks', (p) => {
        p.maxConcurrency(maxConcurrency)
          .failFast(false)
          // Check CDP leak
          .tool('check-cdp-leak', 'stealth_check_cdp_leak', {
            input: {},
          })
          // Check webdriver property
          .tool('check-webdriver', 'stealth_check_webdriver', {
            input: {},
          })
          // Check automation flags
          .tool('check-automation-flags', 'stealth_check_automation', {
            input: {},
          })
          // Run all stealth probes
          .tool('run-stealth-probes', 'stealth_run_probes', {
            input: { categories: probeCategories },
          });
      })

      // ── Phase 4: Stealth Mode Fingerprint ─────────────────────────
      .tool('switch-stealth', 'browser_set_stealth_mode', {
        input: { mode: stealthMode },
      })
      .tool('navigate-stealth', 'page_navigate', {
        input: { url, waitUntil },
      })
      .tool('fingerprint-stealth', 'page_evaluate', {
        input: {
          expression: `
            (function() {
              const probes = {};
              probes.webdriver = navigator.webdriver;
              probes.webdriverDefined = 'webdriver' in navigator;
              probes.userAgent = navigator.userAgent;
              probes.platform = navigator.platform;
              probes.chromeRuntime = typeof chrome !== 'undefined' && !!chrome.runtime;
              probes.pluginCount = navigator.plugins ? navigator.plugins.length : -1;
              return probes;
            })()
          `,
        },
      })

      // ── Phase 5: Differential Analysis ────────────────────────────
      .tool('compute-diff', 'console_execute', {
        input: {
          expression: `
            (function() {
              return {
                analysis: 'differential_fingerprint_complete',
                hint: 'Compare baseline vs stealth results in evidence graph',
              };
            })()
          `,
        },
      })

      // ── Phase 6: Detection Report ─────────────────────────────────
      .tool('generate-report', 'stealth_generate_report', {
        input: {
          includeRemediation: true,
        },
      })

      // ── Phase 7: Evidence Recording ───────────────────────────────
      .tool('create-evidence-session', 'instrumentation_session_create', {
        input: {
          name: `antibot-diagnosis-${new Date().toISOString().slice(0, 10)}`,
          metadata: { url, workflowId, stealthMode },
        },
      })
      .tool('record-artifact', 'instrumentation_artifact_record', {
        input: {
          type: 'antibot_report',
          label: `Anti-bot diagnosis for ${url}`,
          metadata: { url, probeCategories, stealthMode },
        },
      })

      // ── Phase 8: Session Insight ──────────────────────────────────
      .tool('emit-insight', 'append_session_insight', {
        input: {
          insight: JSON.stringify({
            status: 'anti_bot_diagnoser_complete',
            workflowId,
            url,
            probeCategories,
            stealthMode,
          }),
        },
      });

    return root;
  })
  .onStart((ctx) => {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
      workflowId,
      mission: 'anti_bot_diagnoser',
      stage: 'start',
    });
  })
  .onFinish((ctx) => {
    ctx.emitMetric('workflow_runs_total', 1, 'counter', {
      workflowId,
      mission: 'anti_bot_diagnoser',
      stage: 'finish',
    });
  })
  .onError((ctx, error) => {
    ctx.emitMetric('workflow_errors_total', 1, 'counter', {
      workflowId,
      mission: 'anti_bot_diagnoser',
      stage: 'error',
      error: error.name,
    });
  })
  .build();
