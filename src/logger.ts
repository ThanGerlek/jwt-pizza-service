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

import config from './config.js';

// TODO Add types


export class Logger {

  httpLogger = (req: any, res: any, next: any) => {
    let send = res.send;
    res.send = (resBody: any) => {
      console.log("Logging.");
      const logData = {
        authorized: !!req.headers.authorization,
        path: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        reqBody: JSON.stringify(req.body),
        resBody: JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);
      res.send = send;
      return res.send(resBody);
    };
    next();
  };

  log(level: any, type: any, logData: any) {
    const labels = { component: config.logs.source, level: level, type: type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode: any) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData: any) {
    logData = JSON.stringify(logData);
    return logData.replace(/\\"password\\":\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');
  }

  sendLogToGrafana(event: any) {
    const body = JSON.stringify(event);
    fetch(`${config.logs.endpointUrl}`, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logs.accountId}:${config.logs.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana');
    });
  }
}
