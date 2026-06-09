# Troubleshooting — issues we hit and how we fixed them

Real-world issues encountered while bringing this demo online, in the order
they appeared. Useful as a reference for anyone trying the same stack.

---

## 1. `nodejs20.x` runtime deprecated

**Symptom:** `sam validate --lint` failed:

```
E2531: Runtime 'nodejs20.x' was deprecated on '2026-04-30'.
Creation was disabled on '2026-06-01'. Please update to 'nodejs24.x'.
```

**Cause:** AWS Lambda has rolling runtime deprecation. nodejs20 was deprecated.

**Fix:** Bump `Globals.Function.Runtime` in `backend/template.yaml` to
`nodejs24.x`.

---

## 2. WAF association created before the API stage existed

**Symptom:** First `sam deploy` failed mid-way with:

```
AWS WAF couldn't perform the operation because your resource doesn't exist
(Service: Wafv2, Status: 400)
```

CloudFormation rolled the whole stack back.

**Cause:** `AWS::WAFv2::WebACLAssociation` referenced
`/restapis/${TelemetryApi}/stages/Prod`, but at deploy time the implicit
`AWS::ApiGateway::Stage` (created by `AWS::Serverless::Api`) hadn't been
created yet. CloudFormation parallelized the WAF association.

**Fix:** Add explicit dependency in `backend/template.yaml`:

```yaml
TelemetryWebAclAssociation:
  Type: AWS::WAFv2::WebACLAssociation
  DependsOn: TelemetryApiProdStage    # SAM names the implicit stage <ApiId>Stage
  Properties:
    ResourceArn: !Sub 'arn:${AWS::Partition}:apigateway:${AWS::Region}::/restapis/${TelemetryApi}/stages/Prod'
    WebACLArn: !GetAtt TelemetryWebAcl.Arn
```

**Lesson:** when the producing resource is implicit (created by a transform),
you must reference its CloudFormation logical name, not the SAM resource name.
SAM transform creates `<ApiLogicalId>Stage` for HTTP REST APIs.

---

## 3. WAF doesn't attach to API Gateway HTTP API (v2)

This was a design-time gotcha — the original template used
`AWS::Serverless::HttpApi` (HTTP API). When we added WAF, the association
silently has no effect because **WAFv2 only attaches to**:

- API Gateway **REST** APIs (`AWS::Serverless::Api`)
- Application Load Balancers
- CloudFront
- AppSync
- Cognito user pools

**Fix:** switched to `AWS::Serverless::Api` (REST). Side effect: the URL gains
a `/Prod` stage path that HTTP API URLs don't have.

---

## 4. Mini program errors

### 4a. `openBluetoothAdapter:fail already opened`

**Symptom:** Home page showed `Bluetooth adapter: unavailable (already opened)`.

**Cause:** `wx.openBluetoothAdapter` returns errCode `10001` if called when the
adapter is already initialized — typically after navigating between pages.

**Fix:** treat both `errCode === 10001` and a regex match for
`/already opened/i` on `errMsg` as success:

```js
const alreadyOpen = err.errCode === 10001 || /already opened/i.test(err.errMsg || '')
```

The errCode field isn't always populated on iOS, so we needed the message
match too.

### 4b. iPhone: `startBluetoothDevicesDiscovery:fail ble adapter has not been initialized`

**Symptom:** On iOS, scanning failed even after `openBluetoothAdapter` reported
success.

**Cause:** iOS's CoreBluetooth init is asynchronous. WeChat's
`openBluetoothAdapter` callback fires before CoreBluetooth has fully come up,
and the next API call races the still-uninitialized adapter.

**Fix:** poll `wx.getBluetoothAdapterState` until `available: true` before
starting discovery (10 attempts × 300 ms = 3 s):

```js
const waitUntilReady = (attempt = 0) => {
  wx.getBluetoothAdapterState({
    success: (state) => {
      if (state.available) startScan()
      else if (attempt < 10) setTimeout(() => waitUntilReady(attempt + 1), 300)
      else wx.showToast({ title: 'Bluetooth not ready', icon: 'none' })
    },
  })
}
```

### 4c. `desc of scope.userLocation exceeds 30 word count`

**Symptom:** Preview compile error:

```
System error, code 80058: desc of scope.userLocation exceeds 30, word count: 53
```

**Cause:** WeChat caps each permission `desc` field in `app.json` at **30
characters**. English descriptions easily exceed this.

**Fix:** use short Chinese descriptions (each char counts as 1):

```json
"permission": {
  "scope.bluetooth":     { "desc": "用于扫描和连接BLE设备" },
  "scope.userLocation":  { "desc": "Android系统蓝牙扫描需要" }
}
```

### 4d. `[object Object]` in error display

**Symptom:** Page showed `ERR: [object Object]` instead of the actual reason.

**Cause:** `wx.request`'s `fail` callback receives a plain `{ errMsg, errno }`
object, not an `Error` instance. Passing it to `reject` and then doing
`err.message` gives `undefined`, and rendering the object stringifies as
`[object Object]`.

**Fix:** wrap fail-side errors in real `Error` objects with the `errMsg`
extracted:

```js
fail: (err) => reject(
  new Error('wx.request fail: ' + (err && err.errMsg ? err.errMsg : JSON.stringify(err)))
)
```

### 4e. `request:fail url not in domainList`

**Symptom:** On a real phone with a real AppID, every API call failed with
`url not in domainList`. The DevTools "skip domain check" toggle did **not**
help.

**Cause:** WeChat enforces the server-domain allowlist on real devices when
running under a registered AppID. The DevTools toggle (`不校验合法域名`) only
applies to:

- DevTools' own simulator
- The developer's own preview QR (first-party developer of that AppID)

It is **not** honored on trial-version uploads or for non-developer previewers.

**Fix:** register the API Gateway domain in the WeChat dashboard:

1. https://mp.weixin.qq.com → 开发管理 / Development → 开发设置 / Settings
2. **服务器域名** section → modify **request合法域名**
3. Add the **base origin** (no path, no trailing slash):

   ```
   https://abc123xyz.execute-api.ap-southeast-1.amazonaws.com
   ```

4. Save. Limit: 5 modifications per month.

The domain must be HTTPS with a valid TLS certificate. API Gateway URLs
satisfy both automatically.

**Cache caveat:** WeChat caches the domain list. After saving, you may need
to:

- **DevTools:** click 清除缓存 → 清除全部缓存, then re-Preview
- **Phone:** force-quit WeChat (swipe out of app switcher) and re-scan the
  fresh QR

---

## 5. Permission caveats not strictly errors

### Bluetooth permission (iOS)

iOS asks for Bluetooth permission once per app. If the user denied it the
first time, WeChat will not ask again. The user must manually enable it:
**Settings → WeChat → Bluetooth**.

### Location permission (Android)

Android requires Location permission for BLE scanning, even though the app
doesn't actually use the GPS. This is because BLE beacon scans can be used to
infer location. The mini program declares `scope.userLocation` for this; the
user is prompted on first scan.

---

## 6. AWS-side observations

- **WAF rate limit (30 req / 5 min)** is tight — one BLE characteristic that
  pushes notifications faster than ~1/10 s will get blocked. For a real
  product, scope the rate-based rule to `POST /telemetry` only, or raise the
  limit.
- **DynamoDB Scan** in `listTelemetry` is fine for a demo with one device.
  For multi-device usage, query by `deviceId` (we already accept the
  `?deviceId=` query parameter for that).
- **CORS `*`** on the API is unnecessary for a WeChat mini program (no
  browser involved) but harmless; tighten it before any web-facing use.

---

## 7. What we did NOT secure (deliberately)

This is a learning demo. Production would add:

- Auth (e.g., Lambda authorizer validating WeChat OpenID/JWT)
- Per-user data isolation in DynamoDB
- CloudWatch alarms on Lambda errors and unusually high request rates
- Lock the GitHub Actions IAM role from `AdministratorAccess` to a scoped
  policy
- Tighten the WAF rule (per-route, lower threshold for write paths)
