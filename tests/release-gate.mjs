import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

const require = createRequire(import.meta.url);
const {parse} = require(process.env.YAML_MODULE_PATH || 'yaml');
const workflow = parse(fs.readFileSync('.github/workflows/deploy-worker.yml', 'utf8'));
const {validate, deploy} = workflow.jobs;
const inputs = workflow.on.workflow_dispatch.inputs;

assert.deepEqual(workflow.on.pull_request.paths, workflow.on.push.paths);
assert.ok(workflow.on.pull_request.paths.includes('checkout.html'));
assert.ok(workflow.on.pull_request.paths.includes('scripts/check-worker-release.sh'));
assert.deepEqual(workflow.on.pull_request.branches, ['main']);
assert.deepEqual(workflow.on.push.branches, ['main']);
assert.equal(inputs.deploy_production.type, 'boolean');
assert.equal(inputs.deploy_production.default, false);
assert.equal(inputs.approved_sha.type, 'string');
assert.equal(deploy.environment.name, 'worker-production');
assert.equal(deploy.needs, 'validate');
assert.equal(deploy.concurrency['cancel-in-progress'], false);
assert.deepEqual(workflow.permissions, {contents: 'read'});
assert.equal(validate.environment, undefined);
assert.ok(!JSON.stringify(validate).includes('secrets.'));
for (const job of [validate, deploy]) {
  assert.equal(job.steps[0].with.ref, '${{ github.sha }}');
}

// Exercise the actual job condition. GitHub additionally applies success() to
// jobs without a status function, so a failed/skipped validate cannot deploy.
assert.ok(!/always\(|failure\(|cancelled\(/.test(deploy.if));
for (const event_name of ['push', 'pull_request', 'workflow_dispatch', 'schedule']) {
  for (const ref of ['refs/heads/main', 'refs/heads/feature', 'refs/tags/main']) {
    for (const request of [undefined, false, true]) {
      const actual = vm.runInNewContext(deploy.if, {
        github: {event_name, ref}, inputs: {deploy_production: request}
      });
      assert.equal(actual, event_name === 'workflow_dispatch' && ref === 'refs/heads/main' && request === true);
    }
  }
}
console.log('PASS: 36 event/ref/opt-in combinations; PR and push never deploy; validation-only dispatch never deploys');

const requestCheck = validate.steps.find(step => step.name === 'Validate production deployment request');
assert.equal(requestCheck.run, 'bash scripts/check-worker-release.sh');
assert.equal(requestCheck.if, "github.event_name == 'workflow_dispatch' && inputs.deploy_production == true");
assert.equal(requestCheck.env.APPROVED_SHA, '${{ inputs.approved_sha }}');
const checks = deploy.steps.flatMap((step, i) => step.run === 'bash scripts/check-worker-release.sh' ? [i] : []);
assert.equal(checks.length, 2);
const secretStep = deploy.steps.findIndex(step => JSON.stringify(step).includes('secrets.'));
const uploadStep = deploy.steps.findIndex(step => step.run?.includes('wrangler@4 deploy'));
assert.ok(checks[0] < secretStep);
assert.equal(checks[1], uploadStep - 1);
for (const i of checks) assert.equal(deploy.steps[i].env.APPROVED_SHA, '${{ inputs.approved_sha }}');
for (const command of ['admin-operations.mjs', 'local-delivery.mjs', 'notification-outbox.mjs', 'checkout-security.mjs', 'cloudflare-runtime.mjs', 'local-delivery-browser.mjs', 'release-gate.mjs']) {
  assert.ok(validate.steps.some(step => step.run?.includes(command)), command);
}
assert.ok(deploy.steps.some(step => step.name === 'Verify production Worker'));
console.log('PASS: protected environment, successful validation dependency, immutable checkout, two revision rechecks, existing regressions retained');

// Run the real shell guard with an isolated fake git executable. No network,
// Cloudflare credentials, deployment or production health requests are used.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'release-policy-'));
try {
  fs.writeFileSync(path.join(temp, 'git'), `#!/usr/bin/env bash
set -eu
if [[ "$*" == "rev-parse HEAD" ]]; then printf '%s\\n' "$TEST_HEAD";
elif [[ "$*" == "ls-remote --exit-code origin refs/heads/main" ]]; then
  [[ "\${TEST_REMOTE_FAIL:-0}" == 0 ]] || exit 128
  printf '%s\\trefs/heads/main\\n' "$TEST_MAIN";
else exit 99; fi
`, {mode: 0o755});
  const sha = 'a'.repeat(40), other = 'b'.repeat(40);
  const base = {...process.env, PATH: `${temp}:${process.env.PATH}`,
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: sha, APPROVED_SHA: sha, TEST_HEAD: sha, TEST_MAIN: sha, TEST_REMOTE_FAIL: '0'};
  const cases = [
    ['approved current main', {}, true],
    ['push', {GITHUB_EVENT_NAME: 'push'}, false],
    ['PR', {GITHUB_EVENT_NAME: 'pull_request'}, false],
    ['feature branch', {GITHUB_REF: 'refs/heads/feature'}, false],
    ['tag named main', {GITHUB_REF: 'refs/tags/main'}, false],
    ['blank SHA', {APPROVED_SHA: ''}, false],
    ['abbreviated SHA', {APPROVED_SHA: 'aaaaaaa'}, false],
    ['different SHA', {APPROVED_SHA: other}, false],
    ['different checkout', {TEST_HEAD: other}, false],
    ['main advanced while awaiting approval', {TEST_MAIN: other}, false],
    ['main lookup failed', {TEST_REMOTE_FAIL: '1'}, false],
    ['empty main', {TEST_MAIN: ''}, false],
    ['shell-like input', {APPROVED_SHA: '$(exit 0)'}, false]
  ];
  for (const [name, env, expected] of cases) {
    const result = spawnSync('bash', ['scripts/check-worker-release.sh'], {env: {...base, ...env}, encoding: 'utf8'});
    assert.equal(result.status === 0, expected, `${name}: ${result.stderr}`);
  }
  console.log(`PASS: ${cases.length} shell guard cases, including stale approval, missing/malformed SHA, wrong checkout and failed remote lookup`);
} finally {
  fs.rmSync(temp, {recursive: true, force: true});
}
