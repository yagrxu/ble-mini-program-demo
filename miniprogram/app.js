App({
  globalData: {
    apiBaseUrl: 'https://REPLACE_ME.execute-api.ap-southeast-1.amazonaws.com/Prod',
    selectedDevice: null,
  },
  onLaunch() {
    const sysInfo = wx.getSystemInfoSync()
    console.log('[app] platform:', sysInfo.platform, 'SDK:', sysInfo.SDKVersion)
  },
})
