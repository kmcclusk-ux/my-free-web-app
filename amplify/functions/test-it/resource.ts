import { execSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { defineFunction } from "@aws-amplify/backend";
import { DockerImage, Duration } from "aws-cdk-lib";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";

const functionDir = path.dirname(fileURLToPath(import.meta.url));

export const testIt = defineFunction((scope) =>
  new Function(scope, "test-it", {
    handler: "index.handler",
    runtime: Runtime.PYTHON_3_11, // pick the Python runtime you want
    timeout: Duration.seconds(10),
    code: Code.fromAsset(functionDir, {
      bundling: {
        // Amplify's example uses "dummy" here; bundling is done locally in tryBundle
        image: DockerImage.fromRegistry("dummy"),
        local: {
          tryBundle(outputDir: string) {
            // install deps into the output directory (optional if no requirements.txt)
            execSync(
              `python3 -m pip install -r ${path.join(
                functionDir,
                "requirements.txt"
              )} -t ${path.join(
                outputDir
              )} --platform manylinux2014_x86_64 --only-binary=:all:`,
              { stdio: "inherit" }
            );

            // copy your handler code into the output directory
            execSync(`cp -r ${functionDir}/* ${path.join(outputDir)}`, {
              stdio: "inherit",
            });

            return true;
          },
        },
      },
    }),
  })
);
