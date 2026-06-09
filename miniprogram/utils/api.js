const app = getApp()

function request(path, options = {}) {
  const url = app.globalData.apiBaseUrl + path
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: options.method || 'GET',
      data: options.data,
      header: { 'content-type': 'application/json' },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error('HTTP ' + res.statusCode + ' from ' + url + ' body=' + JSON.stringify(res.data)))
        }
      },
      fail: (err) => {
        // err shape: { errMsg, errno } — never an Error instance
        reject(new Error('wx.request fail: ' + (err && err.errMsg ? err.errMsg : JSON.stringify(err)) + ' url=' + url))
      },
    })
  })
}

module.exports = {
  postTelemetry(payload) {
    return request('/telemetry', { method: 'POST', data: payload })
  },
  listTelemetry(deviceId) {
    const q = deviceId ? '?deviceId=' + encodeURIComponent(deviceId) : ''
    return request('/telemetry' + q, { method: 'GET' })
  },
}
