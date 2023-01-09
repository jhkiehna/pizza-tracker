import { handler } from "../lambda-fns/notifyCustomer";

const mockLambdaContext = {};
const mockLambdaCallback = jest.fn();

describe("Notify Function", () => {
  it("should not fail", async () => {
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

    await expect(
      // @ts-expect-error Event is mocked and doesn't contain every required property
      handler(event, mockLambdaContext, mockLambdaCallback)
    ).resolves.not.toThrow();
  });
});
