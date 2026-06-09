const { PutCommand } = require('@aws-sdk/lib-dynamodb')
const { doc, table } = require('./db')

const json = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify(body),
})

exports.handler = async (event) => {
  let payload
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'invalid json' })
  }

  const { deviceId, characteristicId, value, ts } = payload
  if (!deviceId || !value) {
    return json(400, { error: 'deviceId and value are required' })
  }

  const item = {
    deviceId,
    ts: Number(ts) || Date.now(),
    characteristicId: characteristicId || null,
    value,
  }

  await doc.send(new PutCommand({ TableName: table, Item: item }))
  return json(201, item)
}
