const { QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb')
const { doc, table } = require('./db')

const json = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
  body: JSON.stringify(body),
})

exports.handler = async (event) => {
  const deviceId = event.queryStringParameters && event.queryStringParameters.deviceId

  let res
  if (deviceId) {
    res = await doc.send(
      new QueryCommand({
        TableName: table,
        KeyConditionExpression: 'deviceId = :d',
        ExpressionAttributeValues: { ':d': deviceId },
        ScanIndexForward: false,
        Limit: 50,
      })
    )
  } else {
    res = await doc.send(new ScanCommand({ TableName: table, Limit: 50 }))
  }

  const items = (res.Items || []).sort((a, b) => b.ts - a.ts)
  return json(200, items)
}
