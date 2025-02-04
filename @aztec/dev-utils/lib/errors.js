"use strict";

/**
 * Error module to be used in aztec.js and protocol
 * @module Errors
 */

/**
 * Take in the error to be thrown, throw it and return additional debugging
 * information alongside
 * @method customError
 * @param {string} errorType - the type of error thrown
 * @param {Object} data - additional debugging information to be thrown alongside the
 * error
 */
var customError = function customError(errorType, data) {
  var error = new Error(errorType);
  error.data = data;
  return error;
};

module.exports = {
  customError: customError
};