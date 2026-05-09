'use strict';

const { createLogger, format, transports } = require('winston');
const { env } = require('../config/env');

const isDev = env.NODE_ENV === 'development';

const logger = createLogger({
  level: isDev ? 'debug' : 'info',
  format: isDev
    ? format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
          return `${timestamp} ${level}: ${message}${extra}`;
        })
      )
    : format.combine(format.timestamp(), format.json()),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' }),
  ],
});

module.exports = { logger };
