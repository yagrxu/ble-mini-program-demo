const app = getApp()
const api = require('../../utils/api.js')

Page({
  data: {
    adapterState: 'unknown',
    history: [],
    apiBaseUrl: '',
    fetchInfo: '',
    fetchError: '',
  },

  onShow() {
    this.setData({ apiBaseUrl: app.globalData.apiBaseUrl })
    wx.openBluetoothAdapter({
      success: () => this.setData({ adapterState: 'available' }),
      fail: (err) => {
        const alreadyOpen = err.errCode === 10001 || /already opened/i.test(err.errMsg || '')
        if (alreadyOpen) {
          this.setData({ adapterState: 'available' })
        } else {
          this.setData({ adapterState: 'unavailable (' + err.errMsg + ')' })
        }
      },
    })
  },

  goScan() {
    wx.navigateTo({ url: '/pages/scan/scan' })
  },

  fetchHistory() {
    this.setData({ fetchError: '', fetchInfo: 'requesting ' + app.globalData.apiBaseUrl + '/telemetry' })
    wx.showLoading({ title: 'Loading...' })
    api
      .listTelemetry()
      .then((items) => {
        this.setData({
          history: (items || []).slice(0, 10),
          fetchInfo: 'got ' + (items ? items.length : 0) + ' rows',
        })
      })
      .catch((err) =>
        this.setData({ fetchError: err.message || String(err), fetchInfo: '' })
      )
      .finally(() => wx.hideLoading())
  },
})
