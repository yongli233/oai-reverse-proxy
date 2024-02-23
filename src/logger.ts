import pino from "pino";
import { config } from "./config";

const transports: pino.TransportTargetOptions[] = [];

transports.push({
  level: config.logLevel,
  target: "pino-pretty",
  options: {
    singleLine: true,
    messageFormat: "{if module}\x1b[90m[{module}] \x1b[39m{end}{msg}",
    ignore: "module",
    colorize: true,
  },
});

if (process.env.AXIOM_DATASET && process.env.AXIOM_TOKEN) {
  transports.push({
    level: config.logLevel,
    target: "@axiomhq/pino",
    options: {
      dataset: process.env.AXIOM_DATASET,
      token: process.env.AXIOM_TOKEN,
    },
  });
}

export const logger = pino(
  { level: config.logLevel, base: { pid: process.pid, module: "server" } },
  pino.transport({ targets: transports })
);
