Since the api gateway is waiting on the result on the state machine. I decided to publish events to an SNS topic and have subscriptions do whatever other work needed to be done, such as inserting the order into a database or sending notifications of order status.

deploy steps:

install the aws cli utility and configure credentials

`$ aws configure`

`$ npm install`

`$ npm run build`

`$ npm run deploy`

running tests:

`$ npm run test`
