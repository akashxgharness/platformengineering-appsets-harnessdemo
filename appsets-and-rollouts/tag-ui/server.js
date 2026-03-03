const express = require('express');
const k8s = require('@kubernetes/client-node');

const app = express();

const PORT = Number.parseInt(process.env.PORT || '8080', 10);
const ROLLOUT_NAME = process.env.ROLLOUT_NAME || 'canary';
const CONTAINER_NAME = process.env.CONTAINER_NAME || 'canary';
const NAMESPACE =
  process.env.POD_NAMESPACE || process.env.NAMESPACE || 'default';

/** @type {Set<import('http').ServerResponse>} */
const sseClients = new Set();

let lastPayload = null;

function sendSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function parseImageTag(image) {
  if (!image || typeof image !== 'string') return null;
  // Handles: repo:tag, repo@sha256:..., repo:tag@sha256:...
  const at = image.split('@')[0];
  const idx = at.lastIndexOf(':');
  if (idx === -1) return null;
  return at.slice(idx + 1) || null;
}

function extractRolloutInfo(rollout) {
  const containers =
    rollout?.spec?.template?.spec?.containers ||
    rollout?.spec?.template?.spec?.initContainers ||
    [];
  const canaryContainer = Array.isArray(containers)
    ? containers.find((c) => c?.name === CONTAINER_NAME)
    : null;

  const image = canaryContainer?.image || null;
  const tag = parseImageTag(image);

  // status fields are optional and version-dependent; keep UI resilient.
  const status = rollout?.status || {};
  const message =
    status?.message ||
    status?.conditions?.find((c) => c?.message)?.message ||
    null;

  return {
    namespace: NAMESPACE,
    rolloutName: rollout?.metadata?.name || ROLLOUT_NAME,
    containerName: CONTAINER_NAME,
    image,
    tag,
    observedGeneration: status?.observedGeneration ?? null,
    phase: status?.phase ?? null,
    message,
    updatedAt: new Date().toISOString(),
  };
}

function broadcast(payload) {
  lastPayload = payload;
  for (const res of sseClients) {
    sendSse(res, 'rollout', payload);
  }
}

function startRolloutWatch() {
  const kc = new k8s.KubeConfig();
  try {
    kc.loadFromCluster();
  } catch (e) {
    // Falls back to local kubeconfig for dev/testing.
    kc.loadFromDefault();
  }

  const watch = new k8s.Watch(kc);
  const basePath = `/apis/argoproj.io/v1alpha1/namespaces/${encodeURIComponent(
    NAMESPACE
  )}/rollouts/${encodeURIComponent(ROLLOUT_NAME)}`;

  const doWatch = () => {
    watch.watch(
      basePath,
      {},
      (_type, obj) => {
        const payload = extractRolloutInfo(obj);
        if (!payload.tag) return;
        if (!lastPayload || payload.tag !== lastPayload.tag) {
          broadcast(payload);
        } else {
          // Still refresh timestamp periodically for connected clients.
          lastPayload = payload;
        }
      },
      (err) => {
        // Reconnect with a small backoff.
        const delayMs = err ? 1500 : 250;
        setTimeout(doWatch, delayMs);
      }
    );
  };

  doWatch();
}

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/api/status', (_req, res) => {
  res.json({
    namespace: NAMESPACE,
    rolloutName: ROLLOUT_NAME,
    containerName: CONTAINER_NAME,
    last: lastPayload,
  });
});

app.get('/api/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.write('\n');
  sseClients.add(res);

  // Send latest state immediately (if we have it), so UI renders quickly.
  if (lastPayload) {
    sendSse(res, 'rollout', lastPayload);
  } else {
    sendSse(res, 'rollout', {
      namespace: NAMESPACE,
      rolloutName: ROLLOUT_NAME,
      containerName: CONTAINER_NAME,
      image: null,
      tag: null,
      observedGeneration: null,
      phase: null,
      message: null,
      updatedAt: new Date().toISOString(),
    });
  }

  req.on('close', () => {
    sseClients.delete(res);
  });
});

app.use(express.static('public'));

startRolloutWatch();
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `tag-ui listening on :${PORT} watching ${NAMESPACE}/${ROLLOUT_NAME}`
  );
});

