import { Handler } from "aws-lambda";

export const handler: Handler<string, { containsPineapple: boolean }> =
  async function (flavour) {
    console.log("Requested Pizza :", JSON.stringify(flavour, undefined, 2));

    flavour = flavour.toLowerCase();

    return {
      containsPineapple: flavour === "pineapple" || flavour === "hawaiian",
    };
  };
