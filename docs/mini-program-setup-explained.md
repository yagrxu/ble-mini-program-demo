# Mini Program Setup — Explained Step by Step

A learning-oriented walkthrough of the 5 steps for getting the BLE demo running
in WeChat DevTools and on a phone. The terse checklist is in the main `README.md`;
this document explains *why* each step exists.

---

## 1. Install WeChat DevTools

The official IDE for building mini programs, made by Tencent. It is the only
sanctioned way to develop, debug, and submit mini programs. It bundles a code
editor, an in-process simulator, and tools to preview on real devices.

Download: https://developers.weixin.qq.com/miniprogram/en/dev/devtools/download.html

There is no third-party IDE that can publish a mini program to the WeChat
platform — DevTools is mandatory for the final upload step, even if you write
code in another editor.

---

## 2. Import `miniprogram/` folder, choose 测试号 / test account

When you create a project in DevTools, it asks for an **AppID**.

An AppID is the unique identifier WeChat issues when you register a mini program
at https://mp.weixin.qq.com. It ties the code to a registered legal entity and
unlocks production capabilities (publishing, payments, real domain allowlist,
shareable links, etc.).

You don't have one yet, so click **测试号 / test account** instead. DevTools
then generates a temporary local AppID — your code will run inside DevTools and
on phones via QR preview, but it cannot be publicly published. This is the
correct choice for learning and demos.

When you import the `miniprogram/` folder, DevTools reads `project.config.json`
and `app.json` and loads all the pages declared there.

> Once you obtain a real AppID later, edit `miniprogram/project.config.json`
> and replace the `appid` field with your real one.

---

## 3. Paste API URL into `miniprogram/app.js` → `apiBaseUrl`

After running `sam deploy`, AWS prints an output like:

```
ApiUrl = https://abc123xyz.execute-api.ap-southeast-1.amazonaws.com/Prod
```

Open `miniprogram/app.js` and replace the `REPLACE_ME` placeholder so the
mini program knows where to send `POST /telemetry` and `GET /telemetry`:

```js
App({
  globalData: {
    apiBaseUrl: 'https://abc123xyz.execute-api.ap-southeast-1.amazonaws.com/Prod',
    // ...
  },
})
```

Without this step, every API call fails because there is no real backend on
the other end of `REPLACE_ME`.

The `/Prod` suffix is the API Gateway **stage name**, defined in
`backend/template.yaml` (`StageName: Prod`). REST API URLs always include the
stage path; HTTP API URLs do not — that is why the URL format changed when
we switched to REST API to add WAF.

---

## 4. DevTools → Detail → Local Settings → check 不校验合法域名

**不校验合法域名** literally means "do not verify legal domain."

### Why the check exists in the first place

By default, WeChat only allows a mini program's `wx.request` calls to reach
**pre-registered** API domains. These domains are configured in the
mp.weixin.qq.com dashboard under **Development → Server domains**. This
allowlist is a security feature: if a mini program were ever compromised
(malicious code injected, leaked source, etc.), it cannot exfiltrate data to
arbitrary servers — only the ones the developer registered up-front.

### Why we bypass it

A test account has no dashboard, so you cannot register the AWS API Gateway
domain. The bypass checkbox lets DevTools skip the allowlist check during
local development. After you tick it, `wx.request` calls to your AWS URL
succeed.

### Important caveats

- The checkbox only affects **DevTools**. On a real phone, the bypass also
  applies because you are still on a test account.
- Once you switch to a real AppID, the checkbox stops mattering — you must
  register the AWS domain in the dashboard.
- The domain you register must be **HTTPS** and have a valid TLS certificate.
  API Gateway URLs satisfy both automatically.

---

## 5. Preview on a real phone — BLE doesn't work in the simulator

DevTools' built-in simulator is a JavaScript environment running on your
computer. It has no Bluetooth radio. Any call like `wx.openBluetoothAdapter`
fails immediately with a "not supported" error.

To exercise BLE, you must run the mini program on a real phone:

1. In DevTools, click **预览 / Preview** (top right).
2. A QR code appears.
3. Scan it with your WeChat app.
4. The mini program loads on your phone, where it has access to a real
   Bluetooth radio.

### Platform notes

- **Android:** you must grant **Location permission** in addition to
  Bluetooth. This is an Android requirement, not a WeChat one — Android
  treats BLE scanning as location-sensitive because nearby BLE beacons can
  reveal a user's location. The mini program declares `scope.userLocation`
  in `app.json` for this reason.
- **iOS:** only Bluetooth permission is required.
- **Both:** the phone's Bluetooth must be turned on at the OS level. The
  mini program cannot toggle it for you.

---

## Summary

| Step | What it does | Why it matters |
| ---- | ------------ | -------------- |
| 1    | Install DevTools | Required IDE for mini program development |
| 2    | Import + test account | Lets you build without registering an AppID |
| 3    | Paste API URL | Connects the frontend to your AWS backend |
| 4    | Tick "skip domain check" | Dev-only bypass of the production allowlist |
| 5    | Preview on phone | Only way to actually exercise BLE hardware |

Steps 1–2 are setup. Step 3 wires frontend to backend. Step 4 is a dev-only
escape hatch. Step 5 is the only way to test the BLE behavior — anything you
verify in the simulator says nothing about whether BLE actually works.
