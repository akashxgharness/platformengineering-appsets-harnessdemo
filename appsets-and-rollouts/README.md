# deploy-rollouts

## Pipeline

![Alt text](assets/pipelines.png)

## Image-tag color UI (in-cluster)

This repo includes a small in-cluster dashboard that **streams the current `Rollout/canary` image tag** (expected to be a color like `yellow`) and renders it as a big color tile.

### Build and push the dashboard image

From the repo root:

```bash
docker build -t ghcr.io/<YOUR_ORG>/rollouts-tag-ui:0.1.0 appsets-and-rollouts/tag-ui
docker push ghcr.io/<YOUR_ORG>/rollouts-tag-ui:0.1.0
```

Then update the image reference in:
- `appsets-and-rollouts/base/tag-ui-deployment.yaml` (`spec.template.spec.containers[0].image`)

### Deploy (via Argo CD ApplicationSet)

Once the updated base is synced into each namespace, the dashboard will be deployed as:
- Deployment: `tag-ui`
- Service: `tag-ui`

### Access the UI

Port-forward in the namespace you want to observe:

```bash
kubectl -n <namespace> port-forward svc/tag-ui 8080:80
```

Open `http://localhost:8080/`.

When your Harness pipeline updates a cluster’s `config.json` `image_tag` (which changes the `argoproj/rollouts-demo:<color>` tag), the UI should update in realtime via SSE.