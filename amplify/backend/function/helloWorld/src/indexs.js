"use strict";

exports.handler = async (event) => {
  // CORS origin for dev
  const origin = "*";

  // Handle preflight
  if (event && event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization"
      },
      body: ""
    };
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type,Authorization"
    },
    body: JSON.stringify({
      ok: true,
      message: "Hello from Lambda!"
    })
  };
};
