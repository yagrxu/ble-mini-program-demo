const app = getApp()
const api = require('../../utils/api.js')
const { ab2hex, hex2ab } = require('../../utils/ble.js')

Page({
  data: {
    device: {},
    state: 'idle',
    services: [],
    characteristics: [],
    selectedService: '',
    writeHex: '',
    log: [],
  },

  onLoad() {
    const device = app.globalData.selectedDevice || {}
    this.setData({ device })

    wx.onBLEConnectionStateChange((res) => {
      if (res.deviceId === this.data.device.deviceId) {
        this.setData({ state: res.connected ? 'connected' : 'disconnected' })
      }
    })

    wx.onBLECharacteristicValueChange((res) => {
      const hex = ab2hex(res.value)
      this.appendLog('notify ' + res.characteristicId.slice(0, 8) + ' = ' + hex)
      this.uploadValue(res.characteristicId, hex)
    })
  },

  onUnload() {
    if (this.data.state === 'connected') {
      wx.closeBLEConnection({ deviceId: this.data.device.deviceId })
    }
  },

  appendLog(line) {
    const stamp = new Date().toISOString().slice(11, 19)
    this.setData({ log: [stamp + ' ' + line, ...this.data.log].slice(0, 30) })
  },

  connect() {
    this.setData({ state: 'connecting' })
    wx.createBLEConnection({
      deviceId: this.data.device.deviceId,
      timeout: 10000,
      success: () => {
        this.setData({ state: 'connected' })
        this.appendLog('connected')
        this.loadServices()
      },
      fail: (err) => {
        this.setData({ state: 'failed' })
        this.appendLog('connect fail: ' + err.errMsg)
      },
    })
  },

  disconnect() {
    wx.closeBLEConnection({
      deviceId: this.data.device.deviceId,
      success: () => this.appendLog('disconnected'),
    })
  },

  loadServices() {
    wx.getBLEDeviceServices({
      deviceId: this.data.device.deviceId,
      success: (res) => this.setData({ services: res.services }),
      fail: (err) => this.appendLog('services fail: ' + err.errMsg),
    })
  },

  loadCharacteristics(e) {
    const uuid = e.currentTarget.dataset.uuid
    wx.getBLEDeviceCharacteristics({
      deviceId: this.data.device.deviceId,
      serviceId: uuid,
      success: (res) => this.setData({ selectedService: uuid, characteristics: res.characteristics }),
      fail: (err) => this.appendLog('chars fail: ' + err.errMsg),
    })
  },

  readChar(e) {
    const uuid = e.currentTarget.dataset.uuid
    wx.readBLECharacteristicValue({
      deviceId: this.data.device.deviceId,
      serviceId: this.data.selectedService,
      characteristicId: uuid,
      fail: (err) => this.appendLog('read fail: ' + err.errMsg),
    })
  },

  subscribe(e) {
    const uuid = e.currentTarget.dataset.uuid
    wx.notifyBLECharacteristicValueChange({
      deviceId: this.data.device.deviceId,
      serviceId: this.data.selectedService,
      characteristicId: uuid,
      state: true,
      success: () => this.appendLog('subscribed ' + uuid.slice(0, 8)),
      fail: (err) => this.appendLog('notify fail: ' + err.errMsg),
    })
  },

  onWriteHex(e) {
    this.setData({ writeHex: e.detail.value })
  },

  writeChar(e) {
    const uuid = e.currentTarget.dataset.uuid
    let buf
    try {
      buf = hex2ab(this.data.writeHex)
    } catch (err) {
      wx.showToast({ title: 'invalid hex', icon: 'none' })
      return
    }
    wx.writeBLECharacteristicValue({
      deviceId: this.data.device.deviceId,
      serviceId: this.data.selectedService,
      characteristicId: uuid,
      value: buf,
      success: () => this.appendLog('wrote ' + this.data.writeHex),
      fail: (err) => this.appendLog('write fail: ' + err.errMsg),
    })
  },

  uploadValue(characteristicId, hex) {
    api
      .postTelemetry({
        deviceId: this.data.device.deviceId,
        characteristicId,
        value: hex,
        ts: Date.now(),
      })
      .catch((err) => this.appendLog('upload fail: ' + err.message))
  },
})
