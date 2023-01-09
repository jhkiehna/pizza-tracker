import { SNSHandler } from "aws-lambda";

export const handler: SNSHandler = async (event) => {
  event.Records.forEach((record) => console.log({ order: record.Sns.Message }));

  // TODO: Do something to notify the customer
};
