export const resources = {
  functions: {
    "my-function": {
      handler: "amplify/functions/my-function/handler.handler",
      runtime: "nodejs18.x",
      memorySize: 128,
      timeout: 10,
    },
  },
};

export default resources;
