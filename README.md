# BLE WeChat Mini Program Demo

A WeChat mini program that scans, connects, and exchanges data with BLE peripherals,
plus an AWS backend (API Gateway + Lambda + DynamoDB) that stores telemetry uploaded
by the device.

```
mini-program-demo/
├── miniprogram/         # WeChat mini program (frontend)
├── backend/             # AWS SAM stack (deployed to ap-southeast-1)
├── infra/github/tf/     # Terraform — bootstraps GitHub repo + AWS OIDC role
└── .github/workflows/   # GitHub Actions: deploy SAM stack on push to main
```

## Deployment options

You can deploy the backend two ways:

- **Manual `sam deploy`** — see Part 1 below (good for first-time exploration)
- **GitHub Actions** — push to `main` and CI deploys via OIDC. One-time
  bootstrap: `cd infra/github/tf && terraform apply`. See
  [`infra/github/tf/README.md`](infra/github/tf/README.md).

## Part 1 — Backend (AWS, ap-southeast-1)

### 1.1 Prerequisites
- AWS account + AWS CLI configured (`aws configure`)
- AWS SAM CLI: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html
- Node.js 20+

### 1.2 Install Lambda dependencies
```bash
cd backend/src
npm install
cd ..
```

### 1.3 Build & deploy
```bash
sam build
sam deploy --guided      # first time only — accept the defaults from samconfig.toml
```

After deploy completes, copy the `ApiUrl` output. It looks like:
```
https://abc123xyz.execute-api.ap-southeast-1.amazonaws.com/Prod
```

The stack also creates a **WAF Web ACL** in front of the API with a rate-based rule:
**30 requests per 5 minutes per source IP** (over-limit traffic gets a 403).

### 1.4 Smoke test
```bash
curl -X POST "$API_URL/telemetry" \
  -H "content-type: application/json" \
  -d '{"deviceId":"test-1","value":"01ff","ts":1700000000000}'

curl "$API_URL/telemetry"
```

## Part 2 — Mini program (frontend)

### 2.1 Install WeChat DevTools
Download "微信开发者工具" (WeChat DevTools) — the only official IDE for mini programs:
https://developers.weixin.qq.com/miniprogram/en/dev/devtools/download.html

### 2.2 Open the project
1. Launch DevTools and choose **Mini Program** project type.
2. Click **Import** and pick the `miniprogram/` folder of this repo.
3. For **AppID**, click **Use test account / 测试号** — this works without registration.
   When you later register a real AppID at https://mp.weixin.qq.com, replace
   `"appid": "touristappid"` in `miniprogram/project.config.json`.

### 2.3 Wire the API URL
Edit `miniprogram/app.js` and set `apiBaseUrl` to the URL from step 1.3, including
the stage path. For HttpApi the stage is the default route, so the value is just:
```js
apiBaseUrl: 'https://abc123xyz.execute-api.ap-southeast-1.amazonaws.com/Prod'
```

### 2.4 Disable URL validation (test account only)
DevTools → **Detail** → **Local Settings** → check **不校验合法域名** (do not verify
the legal domain). With a real AppID, you must add the API Gateway domain to the
mini program's allowlist in https://mp.weixin.qq.com → Development → Server domains.

### 2.5 Run on a real phone
BLE does **not** work in the DevTools simulator — you must preview on a real phone:
- DevTools → **Preview** → scan QR with WeChat
- On Android, allow Bluetooth **and** Location permission (required by Android for BLE scans)
- On iOS, allow Bluetooth permission

## How it works

| Mini program API                            | Purpose                                  |
| ------------------------------------------- | ---------------------------------------- |
| `wx.openBluetoothAdapter`                   | Initialise the BLE stack                 |
| `wx.startBluetoothDevicesDiscovery`         | Begin scanning                           |
| `wx.onBluetoothDeviceFound`                 | Receive scan results                     |
| `wx.createBLEConnection`                    | Connect to a chosen device               |
| `wx.getBLEDeviceServices` / `Characteristics` | Enumerate GATT services & characteristics |
| `wx.readBLECharacteristicValue`             | One-shot read                            |
| `wx.writeBLECharacteristicValue`            | Write hex bytes                          |
| `wx.notifyBLECharacteristicValueChange`     | Subscribe to notifications               |
| `wx.onBLECharacteristicValueChange`         | Receive notification payloads            |

Each notification payload is uploaded via `POST /telemetry` to the AWS backend,
where it lands in the DynamoDB table keyed by `(deviceId, ts)`.

## Documentation

- [`docs/mini-program-setup-explained.md`](docs/mini-program-setup-explained.md) — beginner walkthrough of the 5 setup steps
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — issues we hit while bringing the demo online and how to fix them
- [`infra/github/tf/README.md`](infra/github/tf/README.md) — bootstrap Terraform (creates the GitHub repo + AWS OIDC role)

## Cleanup

```bash
cd backend
sam delete
```
