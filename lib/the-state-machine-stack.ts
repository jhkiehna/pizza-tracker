import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as apigw from "@aws-cdk/aws-apigatewayv2";
import * as sfn from "@aws-cdk/aws-stepfunctions";
import * as sns from "@aws-cdk/aws-sns";
import * as subs from "@aws-cdk/aws-sns-subscriptions";
import * as logs from "@aws-cdk/aws-logs";
import * as tasks from "@aws-cdk/aws-stepfunctions-tasks";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import {
  Effect,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "@aws-cdk/aws-iam";

export class TheStateMachineStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Dynamo DB Table for Pizza Orders
     */

    const pizzaOrdersTable = new dynamodb.Table(this, "PizzaOrdersTable", {
      partitionKey: { name: "uuid", type: dynamodb.AttributeType.STRING },
    });

    /**
     * Pizza Tracker SNS Topic
     */
    const pizzaTrackerTopic = new sns.Topic(this, "PizzaTrackerTopic");

    const publishRejectedMessage = new tasks.SnsPublish(
      this,
      "PizzaTrackerSendRejectedMessage",
      {
        topic: pizzaTrackerTopic,
        messageAttributes: { OrderStatus: { value: "Rejected" } },
        message: sfn.TaskInput.fromJsonPathAt("$"),
      }
    );

    const publishAcceptedMessage = new tasks.SnsPublish(
      this,
      "PizzaTrackerSendAcceptedMessage",
      {
        topic: pizzaTrackerTopic,
        messageAttributes: { OrderStatus: { value: "Accepted" } },
        message: sfn.TaskInput.fromJsonPathAt("$"),
      }
    );

    /**
     * SNS Topic Consumers
     */

    // Subscriptions for Accepted Orders
    const insertOrderLambda = new lambda.Function(this, "insertOrderHandler", {
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("lambda-fns"),
      handler: "insertOrder.handler",
      environment: {
        TABLE_NAME: pizzaOrdersTable.tableName,
        REGION: "us-east-1",
      },
    });

    pizzaOrdersTable.grantWriteData(insertOrderLambda);

    const insertOrderLambdaSubscription = new subs.LambdaSubscription(
      insertOrderLambda,
      {
        filterPolicy: {
          OrderStatus: sns.SubscriptionFilter.stringFilter({
            allowlist: ["Accepted"],
          }),
        },
      }
    );

    // Subscriptions for notifying customer of order status
    const notifyCustomerLambda = new lambda.Function(
      this,
      "notifyCustomerHandler",
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset("lambda-fns"),
        handler: "notifyCustomer.handler",
      }
    );

    const notifyCustomerLambdaSubscription = new subs.LambdaSubscription(
      notifyCustomerLambda,
      {
        filterPolicy: {
          OrderStatus: sns.SubscriptionFilter.stringFilter({
            allowlist: ["Accepted", "Rejected"],
          }),
        },
      }
    );

    // Subscriptions for notifying me of order status
    const orderStatusEmailSubscription = new subs.EmailSubscription(
      "jhkiehna@gmail.com",
      {
        filterPolicy: {
          OrderStatus: sns.SubscriptionFilter.stringFilter({
            allowlist: ["Rejected", "Accepted"],
          }),
        },
      }
    );

    pizzaTrackerTopic.addSubscription(insertOrderLambdaSubscription);
    pizzaTrackerTopic.addSubscription(notifyCustomerLambdaSubscription);
    pizzaTrackerTopic.addSubscription(orderStatusEmailSubscription);

    /**
     * Step Function Starts Here
     */
    //The first thing we need to do is see if they are asking for pineapple on a pizza
    let pineappleCheckLambda = new lambda.Function(
      this,
      "pineappleCheckLambdaHandler",
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset("lambda-fns"),
        handler: "orderPizza.handler",
      }
    );

    // Step functions are built up of steps, we need to define our first step
    const orderPizza = new tasks.LambdaInvoke(this, "Order Pizza Job", {
      lambdaFunction: pineappleCheckLambda,
      inputPath: "$.flavour",
      resultPath: "$.pineappleAnalysis",
      payloadResponseOnly: true,
    });

    // Pizza Order failure step defined
    const pineappleDetected = new sfn.Fail(
      this,
      "Sorry, We Dont add Pineapple",
      {
        cause: "They asked for Pineapple",
        error: "Failed To Make Pizza",
      }
    );

    // If they didnt ask for pineapple let's cook the pizza
    const cookPizza = new sfn.Succeed(this, "Lets make your pizza");

    //Express Step function definition
    const definition = sfn.Chain.start(orderPizza).next(
      new sfn.Choice(this, "With Pineapple?") // Logical choice added to flow
        // Look at the "status" field
        .when(
          sfn.Condition.booleanEquals(
            "$.pineappleAnalysis.containsPineapple",
            true
          ),
          publishRejectedMessage.next(pineappleDetected)
        ) // Fail for pineapple
        .otherwise(publishAcceptedMessage.next(cookPizza))
    );

    let stateMachine = new sfn.StateMachine(this, "StateMachine", {
      definition,
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: true,
      stateMachineType: sfn.StateMachineType.EXPRESS,
      logs: {
        destination: new logs.LogGroup(this, "LogGroup", {
          retention: logs.RetentionDays.ONE_DAY, // Setting to 1 day for demo purposes
        }),
        level: sfn.LogLevel.ALL,
      },
    });

    /**
     * HTTP API Definition
     */
    // defines an API Gateway HTTP API resource backed by our step function

    // We need to give our HTTP API permission to invoke our step function
    const httpApiRole = new Role(this, "HttpApiRole", {
      assumedBy: new ServicePrincipal("apigateway.amazonaws.com"),
      inlinePolicies: {
        AllowSFNExec: new PolicyDocument({
          statements: [
            new PolicyStatement({
              actions: ["states:StartSyncExecution"],
              effect: Effect.ALLOW,
              resources: [stateMachine.stateMachineArn],
            }),
          ],
        }),
      },
    });

    const api = new apigw.HttpApi(this, "the-state-machine-api", {
      createDefaultStage: true,
    });

    // create an AWS_PROXY integration between the HTTP API and our Step Function
    const integ = new apigw.CfnIntegration(this, "Integ", {
      apiId: api.httpApiId,
      integrationType: "AWS_PROXY",
      connectionType: "INTERNET",
      integrationSubtype: "StepFunctions-StartSyncExecution",
      credentialsArn: httpApiRole.roleArn,
      requestParameters: {
        Input: "$request.body",
        StateMachineArn: stateMachine.stateMachineArn,
      },
      payloadFormatVersion: "1.0",
      timeoutInMillis: 10000,
    });

    new apigw.CfnRoute(this, "DefaultRoute", {
      apiId: api.httpApiId,
      routeKey: apigw.HttpRouteKey.DEFAULT.key,
      target: `integrations/${integ.ref}`,
    });

    // output the URL of the HTTP API
    new cdk.CfnOutput(this, "HTTP API Url", {
      value: api.url ?? "Something went wrong with the deploy",
    });
  }
}
