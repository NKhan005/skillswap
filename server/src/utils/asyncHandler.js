'use strict';

/** Forward rejected promises from async controllers into Express's error path. */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
