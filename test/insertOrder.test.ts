import { handler } from "../lambda-fns/insertOrder";

jest.mock("aws-sdk", () => ({
  DynamoDB: {
    DocumentClient: class {
      put() {
        return this;
      }
      async promise() {
        return "success";
      }
    },
  },
}));

const mockLambdaContext = {};
const mockLambdaCallback = jest.fn();

describe("insertOrder Function", () => {
  it("should insert an order into the database", async () => {
    const { DynamoDB } = require("aws-sdk");
    DynamoDB.DocumentClient.prototype.put = jest.fn().mockReturnThis();

    const event = {
      Records: [
        {
          Sns: {
            Message: JSON.stringify({
              flavour: "Pepperoni",
              size: "Large",
              quantity: 1,
            }),
          },
        },
      ],
    };

    // @ts-expect-error Event is mocked and doesn't contain every required property
    await handler(event, mockLambdaContext, mockLambdaCallback);

    expect(DynamoDB.DocumentClient.prototype.put).toBeCalledTimes(1);
    expect(DynamoDB.DocumentClient.prototype.put).toBeCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          uuid: expect.any(String),
          order: {
            flavour: "Pepperoni",
            size: "Large",
            quantity: 1,
          },
        }),
      })
    );
  });
});
