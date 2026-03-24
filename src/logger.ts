/*
{
  "streams": [
    {
      "stream": {
        "label": "value"
      },
      "values": [["<unix epoch in nanoseconds>", "<log line>", { "<metadata label>": "<metadata value>" }]]
    }
  ]
}
{
  "streams": [
    {
      "stream": { "component": "jwt-pizza-service", "level": "info", "type": "http-req" },
      "values": [["1717627004763", "{\"name\":\"pizza diner\", \"email\":\"d@jwt.com\", \"password\":\"****\"}", { "userID": "32", "traceID": "0242ac120002" }]]
    }
  ]
}
*/

import config from "./config.js";
import { sanitizeForLog } from "./util/sanitize.ts";

// TODO Add types

export interface Logger {
  httpLogger(req: any, res: any, next: any): void;
  log(level: any, type: any, logData: any): void;
}

export class GrafanaLogger implements Logger {
  public httpLogger = (req: any, res: any, next: any) => {
    const send = res.send.bind(res);
    const json = res.json.bind(res);
    const end = res.end.bind(res);

    let responseBody: unknown;

    res.send = (resBody: any) => {
      responseBody = resBody;
      return send(resBody);
    };

    res.json = (resBody: any) => {
      responseBody = resBody;
      return json(resBody);
    };

    res.end = (chunk: any, encoding?: any, callback?: any) => {
      if (responseBody === undefined && chunk !== undefined) {
        responseBody = chunk;
      }
      return end(chunk, encoding, callback);
    };

    res.on("finish", () => {
      const statusCode = res.statusCode;
      const logData = {
        hasAuthorizationHeader: Boolean(req.headers.authorization),
        path: req.originalUrl,
        method: req.method,
        statusCode,
        requestBody: req.body,
        responseBody,
      };
      this.log(this.statusToLogLevel(statusCode), "http", logData);
    });

    next();
  };

  log(level: any, type: any, logData: any) {
    const labels = { component: config.logging.source, level: level, type: type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  private statusToLogLevel(statusCode: any) {
    if (statusCode >= 500) return "error";
    if (statusCode >= 400) return "warn";
    return "info";
  }

  private nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  private sanitize(logData: any) {
    return sanitizeForLog(logData);
  }

  private sendLogToGrafana(event: any) {
    const body = JSON.stringify(event);
    fetch(`${config.logging.endpointUrl}`, {
      method: "post",
      body: body,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log("Failed to send log to Grafana");
    });
  }
}
