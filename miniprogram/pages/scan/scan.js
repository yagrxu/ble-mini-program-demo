const app = getApp()

Page({
  data: {
    discovering: false,
    devices: [],
  },

  onLoad() {
    wx.onBluetoothDeviceFound((res) => {
      const map = {}
      this.data.devices.forEach((d) => (map[d.deviceId] = d))
      res.devices.forEach((d) => {
        map[d.deviceId] = {
          deviceId: d.deviceId,
          name: d.name || d.localName,
          RSSI: d.RSSI,
        }
      })
      const list = Object.values(map).sort((a, b) => b.RSSI - a.RSSI)
      this.setData({ devices: list })
    })
  },

  onUnload() {
    if (this.data.discovering) {
      wx.stopBluetoothDevicesDiscovery()
    }
  },

  toggleScan() {
    if (this.data.discovering) {
      wx.stopBluetoothDevicesDiscovery({
        complete: () => this.setData({ discovering: false }),
      })
      return
    }

    // iOS quirk: openBluetoothAdapter returns success before the adapter is
    // actually ready. Poll getBluetoothAdapterState until `available: true`
    // before calling startBluetoothDevicesDiscovery.
    const waitUntilReady = (attempt = 0) => {
      wx.getBluetoothAdapterState({
        success: (state) => {
          if (state.available) {
            startScan()
          } else if (attempt < 10) {
            setTimeout(() => waitUntilReady(attempt + 1), 300)
          } else {
            wx.showToast({ title: 'Bluetooth not ready — turn on BT', icon: 'none' })
          }
        },
        fail: (err) => wx.showToast({ title: err.errMsg, icon: 'none' }),
      })
    }

    const startScan = () => {
      wx.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: false,
        success: () => this.setData({ discovering: true, devices: [] }),
        fail: (err) => wx.showToast({ title: err.errMsg, icon: 'none' }),
      })
    }

    wx.openBluetoothAdapter({
      success: () => waitUntilReady(),
      fail: (err) => {
        const alreadyOpen = err.errCode === 10001 || /already opened/i.test(err.errMsg || '')
        if (alreadyOpen) {
          waitUntilReady()
        } else {
          wx.showToast({ title: err.errMsg, icon: 'none' })
        }
      },
    })
  },

  connect(e) {
    const { id, name } = e.currentTarget.dataset
    if (this.data.discovering) {
      wx.stopBluetoothDevicesDiscovery()
    }
    app.globalData.selectedDevice = { deviceId: id, name }
    wx.navigateTo({ url: '/pages/device/device' })
  },
})
