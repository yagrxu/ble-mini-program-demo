# Architecture

A reference for **what exists today** and **where to plug in new features**.
Read this once before adding anything substantial.

---

## 1. System map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER'S PHONE                                   │
│                                                                         │
│  ┌──────────────┐         ┌──────────────────────────────────────┐      │
│  │ BLE          │  GATT   │  WeChat Mini Program                 │      │
│  │ Peripheral   │◄───────►│  (miniprogram/)                      │      │
│  └──────────────┘         └──────────────┬───────────────────────┘      │
└──────────────────────────────────────────┼──────────────────────────────┘
                                           │ HTTPS (REST JSON)
                                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        AWS  (ap-southeast-1)                            │
│                                                                         │
│        WAFv2 (rate-based 30 / 5 min / IP)                               │
│                  │                                                      │
│                  ▼                                                      │
│         API Gateway REST API   (stage: Prod)                            │
│             │                  │                                        │
│      POST /telemetry    GET /telemetry                                  │
│             │                  │                                        │
│             ▼                  ▼                                        │
│       PostTelemetryFn    ListTelemetryFn                                │
│       (Lambda nodejs24)  (Lambda nodejs24)                              │
│             │                  │                                        │
│             ▼                  ▼                                        │
│         DynamoDB:  TelemetryTable   PK=deviceId  SK=ts                  │
│                                                                         │
│  Bootstrap (one-shot, local Terraform):                                 │
│    GitHub OIDC provider · IAM role · S3 (artifacts) · DynamoDB locks    │
│    GitHub repo + Actions variables                                      │
└─────────────────────────────────────────────────────────────────────────┘
```

Three layers, each with a clear extension story:

| Layer | Where | What it owns |
|---|---|---|
| **Frontend** | `miniprogram/` | UI, BLE GATT operations, calls to the API |
| **Backend** | `backend/` | HTTP endpoints, persistence, security gates |
| **Bootstrap** | `infra/github/tf/` | GitHub repo, AWS OIDC role, state bucket |

---

## 2. Frontend (mini program)

### Layout

```
miniprogram/
├── app.js               globalData (apiBaseUrl, selectedDevice) + onLaunch
├── app.json             page registry, permissions, window chrome
├── app.wxss             shared styles (.btn, .card, .mono, etc.)
├── pages/
│   ├── index/           home: adapter status + telemetry history
│   ├── scan/            BLE discovery + device list
│   └── device/          GATT operations on the chosen device
└── utils/
    ├── api.js           wx.request wrapper → AWS REST API
    └── ble.js           ArrayBuffer ⇄ hex helpers
```

### Page state machine

```
index ──navigateTo──► scan ──navigateTo──► device
  ▲                                          │
  └──────────  navigateBack  ────────────────┘
```

`globalData.selectedDevice` carries the device ID across the navigation
boundary (mini program nav can't pass complex objects safely).

### BLE lifecycle (where most BLE bugs hide)

1. `wx.openBluetoothAdapter` — initialize stack. **iOS quirk:** success
   callback fires before adapter is truly ready → poll
   `getBluetoothAdapterState` until `available: true`.
2. `wx.startBluetoothDevicesDiscovery` + `wx.onBluetoothDeviceFound`
3. `wx.createBLEConnection` + `wx.onBLEConnectionStateChange`
4. `wx.getBLEDeviceServices` → `wx.getBLEDeviceCharacteristics`
5. Per-characteristic: read / write / notify
6. `wx.closeBLEConnection` on page unload

The **adapter and discovery state are global** (one process-wide stack), so
opening a second time returns errCode `10001` ("already opened") — treated
as success in our code.

### Extension points

| You want to… | Touch these |
|---|---|
| Add a screen | new folder under `pages/`; register in `app.json` |
| Call a new API | add a function in `utils/api.js` |
| Parse BLE bytes | add a decoder in `utils/ble.js`, called from `pages/device/device.js` |
| Persist data on device | `wx.setStorage` / `wx.getStorage` (synchronous variant exists) |
| Share state across pages | `getApp().globalData` (do not abuse — keep small) |

Keep pages dumb. Logic lives in `utils/`.

---

## 3. Backend (AWS SAM)

### Layout

```
backend/
├── template.yaml        SAM stack definition (single source of truth)
├── samconfig.toml       deploy defaults (region, stack name)
└── src/
    ├── package.json     Lambda dependencies
    ├── db.js            DynamoDB document client (shared)
    ├── postTelemetry.js POST /telemetry → PutItem
    └── listTelemetry.js GET  /telemetry → Query/Scan
```

### Resources in `template.yaml`

| Logical name | Type | Purpose |
|---|---|---|
| `TelemetryTable` | `AWS::DynamoDB::Table` | Telemetry storage, on-demand billing |
| `TelemetryApi` | `AWS::Serverless::Api` | REST API, stage `Prod`, CORS open |
| `PostTelemetryFn` | `AWS::Serverless::Function` | Write handler |
| `ListTelemetryFn` | `AWS::Serverless::Function` | Read handler |
| `TelemetryWebAcl` | `AWS::WAFv2::WebACL` | Rate limit (30 / 5 min / IP) |
| `TelemetryWebAclAssociation` | `AWS::WAFv2::WebACLAssociation` | Binds WAF to the `Prod` stage |

**Globals** in the template apply to every Lambda: `nodejs24.x`, arm64,
256 MB, 10 s timeout, `TABLE_NAME` env var.

### Request flow

```
phone ─► WAF ─► API Gateway (Prod stage)
                       │
                       ▼
              event { httpMethod, body, queryStringParameters, ... }
                       │
                       ▼
                  Lambda handler
                       │
                       ▼
              DynamoDBDocumentClient (shared)
                       │
                       ▼
                  TelemetryTable
```

### Data model

`TelemetryTable`:

| Attribute | Key | Type | Notes |
|---|---|---|---|
| `deviceId` | partition (HASH) | String | BLE device identifier (MAC on Android, UUID on iOS) |
| `ts` | sort (RANGE) | Number | ms since epoch |
| `characteristicId` | — | String | UUID, nullable |
| `value` | — | String | hex-encoded payload |

Query patterns currently supported:
- `Query` by `deviceId` (sorted by ts desc) when `?deviceId=` is provided
- `Scan` (limited to 50) for the "show me everything" path

If you add data, **do not break the (deviceId, ts) primary key** —
projection, GSIs, or new attributes are fine; reshaping the keys would
require migration.

### Extension points

| You want to… | Touch these |
|---|---|
| Add an endpoint | add a Lambda in `src/`, add `Function` + `Events` block in `template.yaml` |
| Add a query pattern | add a GSI on `TelemetryTable`, then a new handler |
| Add a queue / fan-out | `AWS::SQS::Queue` resource; subscribe a Lambda via `Events` |
| Add a scheduled job | `AWS::Serverless::Function` + `Events: { Type: Schedule }` |
| Add secrets | `AWS::SecretsManager::Secret`; reference via env var `{{resolve:secretsmanager:...}}` |
| Tighten WAF | add rules with lower `Priority` ints; `RateLimitPerIp` is currently `Priority: 1` |

Every new resource goes in `template.yaml`. Avoid drifting into the AWS
console — anything not in the template is invisible to your future self.

---

## 4. Infrastructure & deploy pipeline

### Bootstrap (`infra/github/tf/`) — runs once, locally

Creates:
- GitHub repo (public)
- AWS OIDC provider for `token.actions.githubusercontent.com`
- IAM role `ble-demo-github-actions-role` (currently `AdministratorAccess`)
- S3 bucket (versioned, KMS-encrypted) — also serves as SAM artifacts bucket
- DynamoDB lock table (reserved for future TF-managed app infra)
- GitHub Actions repository **variables**: `AWS_REGION`,
  `AWS_DEPLOY_ROLE_ARN`, `SAM_ARTIFACTS_BUCKET`

State is **local** (`terraform.tfstate` in the directory). This is
intentional — bootstrap can't depend on resources it hasn't created yet.

### Deploy (GitHub Actions, `.github/workflows/deploy.yml`)

Triggered on push to `main` (path-filtered to `backend/**`). Steps:

1. Checkout
2. Setup Node 20
3. AWS OIDC: assume `AWS_DEPLOY_ROLE_ARN` (no static keys)
4. `sam build` → `sam deploy --no-confirm-changeset`
5. Echo stack outputs (the `ApiUrl`)

Local equivalent: `cd backend && sam build && sam deploy --resolve-s3 ...`.

### Extension points

| You want to… | Touch these |
|---|---|
| Add a deploy gate (tests) | new step in `.github/workflows/deploy.yml` before `sam deploy` |
| Add a second environment | duplicate `IAM role` in `infra/github/tf/` with branch-scoped trust; add a workflow on that branch |
| Tighten IAM | replace `AdministratorAccess` in `iam_policies.tf` with a scoped policy |
| Move TF state to S3 | switch the `terraform { backend "s3" {...} }` block once the bucket exists |

---

## 5. Cross-cutting concerns

### Security posture

| Concern | Status today | Where to harden |
|---|---|---|
| Authentication | **None** | Lambda authorizer validating WeChat OpenID/JWT |
| Authorization | None | Per-user partition keys in DynamoDB |
| Rate limiting | WAF 30/5min/IP | Per-route rules, lower limits on writes |
| Secrets | None | Secrets Manager + IAM scoping |
| Audit | CloudTrail only | App-level audit log table |
| TLS | Yes (managed) | — |
| CORS | `*` | Tighten if anything calls from a browser |

### Observability

What exists:
- CloudWatch Logs per Lambda (default 30-day retention, can be tuned)
- CloudFormation events for deploys
- WAF sampled requests in CloudWatch metrics

Not yet:
- Metric filters / alarms
- Structured logging conventions
- Distributed tracing (X-Ray)

Add via `AWS::Logs::MetricFilter` + `AWS::CloudWatch::Alarm` in
`template.yaml` when you start caring.

### Cost

At zero traffic, the stack costs roughly:
- DynamoDB on-demand: $0
- Lambda: $0 (free tier)
- API Gateway: $0 below free tier
- WAFv2: **~$5/month** (Web ACL flat fee) + small per-request
- S3 (artifacts): pennies

The WAF flat fee is the biggest single line — drop the WAF if you're
running this purely as a learning demo and aren't worried about abuse.

---

## 6. Cookbooks — adding common feature shapes

### 6.1 New API endpoint

1. Create `backend/src/<name>.js` with an `exports.handler = async (event) => {...}`
2. Add to `template.yaml` (mirror an existing function block):
   ```yaml
   <Name>Fn:
     Type: AWS::Serverless::Function
     Properties:
       CodeUri: src/
       Handler: <name>.handler
       Policies:
         - DynamoDB<Read|Write>Policy: { TableName: !Ref TelemetryTable }
       Events:
         Default:
           Type: Api
           Properties:
             RestApiId: !Ref TelemetryApi
             Method: <GET|POST|...>
             Path: /<route>
   ```
3. Add a method in `miniprogram/utils/api.js`
4. Push to `main` → CI deploys

### 6.2 New mini program page

1. `mkdir miniprogram/pages/<name>`, create `<name>.{js,wxml,json,wxss}`
2. Register in `app.json` `pages` array
3. Navigate from another page: `wx.navigateTo({ url: '/pages/<name>/<name>' })`

### 6.3 New BLE characteristic interaction

Lives entirely in `pages/device/device.js`. The adapter, connection, and
service discovery are already wired — you mostly write a handler that calls
one of `wx.{read,write,notify}BLECharacteristicValue` and reacts in
`onBLECharacteristicValueChange`.

### 6.4 New AWS-side trigger (e.g., process telemetry async)

1. Add an SQS queue or DynamoDB stream resource in `template.yaml`
2. Add a worker Lambda with the appropriate `Events` source
3. Have `PostTelemetryFn` either send to SQS or rely on the table stream

Don't put long work in the request-path Lambda — keep request handlers
under ~1 second.

### 6.5 New environment (staging, production)

1. Branch the bootstrap TF: add another IAM role in `infra/github/tf/main.tf`
   with `sub` scoped to a different branch (e.g. `release`)
2. Duplicate the workflow as `deploy-release.yml`, triggered on that branch,
   reading a different `<env>_AWS_DEPLOY_ROLE_ARN` variable
3. Use `--stack-name ble-demo-<env>` in the deploy step

---

## 7. Design decisions worth remembering

These were chosen consciously — change them only with intent.

- **REST API, not HTTP API.** WAF only attaches to REST. The `/Prod` stage
  path is the visible cost.
- **Implicit SAM stage with `DependsOn: TelemetryApiProdStage`.** WAF
  association references a stage created by the SAM transform; without the
  explicit dependency, deploy races.
- **Single DynamoDB table, single PK shape.** Telemetry is the only domain
  for now. Don't pre-build multi-tenant patterns until needed.
- **Local Terraform state for bootstrap.** Bootstrap can't store state in
  resources it hasn't created.
- **`AdministratorAccess` on the deploy role.** Demo simplicity. First
  hardening step before any real use.
- **CORS `*`.** Mini program doesn't enforce CORS, so this only matters if
  a browser-based client appears. Tighten when one does.

---

## 8. Glossary (mini program ↔ AWS)

| Term | Side | Meaning |
|---|---|---|
| AppID | mini program | WeChat-issued identifier per registered mini program |
| 测试号 | mini program | Test AppID generated by DevTools (no registration needed) |
| 服务器域名 | mini program | API allowlist — registered in mp.weixin.qq.com |
| 不校验合法域名 | DevTools | Local-only bypass of the allowlist |
| Stage | API Gateway | Deployable environment (e.g. `Prod`) |
| Web ACL | WAF | Set of rules attached to a protected resource |
| OIDC role | IAM | IAM role assumable from GitHub Actions via JWT — no static keys |
| Implicit resource | SAM | Resource the SAM transform synthesizes from a `Serverless::*` definition |
