import { defineFunction } from "@aws-amplify/backend";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// This helps locate your Python file relative to this TypeScript file
const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const myPythonFunction = defineFunction(
  (scope) =>
    new (await import("aws-cdk-lib/aws-lambda")).Function(scope, "MyPythonFunction", {
      handler: "index.handler", // Points to 'index.py' and the 'handler' function
      runtime: Runtime.PYTHON_3_12, // Ensure this matches your Python version
      code: (await import("aws-cdk-lib/aws-lambda")).Code.fromAsset(functionDir),
    })
);
