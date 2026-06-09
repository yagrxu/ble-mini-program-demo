const { DynamoDBClient } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb')

const client = new DynamoDBClient({})
const doc = DynamoDBDocumentClient.from(client)

module.exports = {
  doc,
  table: process.env.TABLE_NAME,
}
