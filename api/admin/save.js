"use strict";

const publishHandler = require("./publish");

module.exports = async function handler(req, res) {
  return publishHandler(req, res);
};
