import { SNSHandler } from "aws-lambda";
import { DynamoDB } from "aws-sdk";
import { randomUUID } from "crypto";

const { TABLE_NAME } = process.env;

const docClient = new DynamoDB.DocumentClient();

export const handler: SNSHandler = async (event) => {
  console.log(JSON.stringify({ event }));

  try {
    await Promise.all(
      event.Records.map((record) => {
        return docClient
          .put({
            TableName: TABLE_NAME as string,
            Item: {
              uuid: randomUUID(),
              order: JSON.parse(record.Sns.Message),
            },
          })
          .promise();
      })
    );
  } catch (error) {
    console.error(error);
  }
};
