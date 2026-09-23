'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/** Turn express-validator failures into one 400 with a field->message map. */
function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = {};
  for (const e of result.array()) {
    details[e.path || e.param] = e.msg;
  }
  return next(new ApiError(400, 'Validation failed', details));
}

module.exports = validate;
